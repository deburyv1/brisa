import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// Rutina personal que se copia al crear una salida; cada evento tiene checks propios.
router.get('/checklist-templates', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM event_checklist_templates WHERE user_id = ${req.userId} ORDER BY id`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching event checklist templates:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/checklist-templates', async (req, res) => {
  const title = String(req.body.title || '').trim();
  const phase = req.body.event_phase || 'leave';
  const eventId = Number(req.body.event_id);
  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (!['prep', 'leave', 'during'].includes(phase)) return res.status(400).json({ error: 'Invalid event phase' });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (eventId) {
        const event = await client.query(`SELECT id, title FROM events WHERE id = $1 AND user_id = ${req.userId}`, [eventId]);
        if (!event.rowCount) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Event not found' });
        }
      }
      const result = await client.query(
        `INSERT INTO event_checklist_templates (user_id, title, event_phase) VALUES (${req.userId}, $1, $2) RETURNING *`,
        [title.slice(0, 255), phase]
      );
      if (eventId) {
        await client.query(
          `INSERT INTO tasks (user_id, title, description, event_id, event_phase) VALUES (${req.userId}, $1, $2, $3, $4)`,
          [title.slice(0, 255), `Rutina de salida · evento ${eventId}`, eventId, phase]
        );
      }
      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error creating event checklist template:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/checklist-templates/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM event_checklist_templates WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Checklist item not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting event checklist template:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/events?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const params = [];
    const clauses = [`user_id = ${req.userId}`];
    if (req.query.date) {
      params.push(req.query.date);
      clauses.push(`start::date = $${params.length}::date`);
    }
    const result = await pool.query(`SELECT * FROM events WHERE ${clauses.join(' AND ')} ORDER BY start ASC`, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM events WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching event:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/events
router.post('/', async (req, res) => {
  const { title, description, start, end, location, entry_id, travel_minutes, use_departure_checklist } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!start) {
    return res.status(400).json({ error: 'Start is required' });
  }
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO events (user_id, title, description, start, "end", location, entry_id, travel_minutes, use_departure_checklist) VALUES (${req.userId}, $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [title.trim(), description || null, start, end || null, location || null, entry_id || null, travel_minutes || null, Boolean(use_departure_checklist)]
      );
      const event = result.rows[0];
      if (event.use_departure_checklist) {
        const templates = await client.query(`SELECT * FROM event_checklist_templates WHERE user_id = ${req.userId} ORDER BY id`);
        for (const item of templates.rows) {
          await client.query(
            `INSERT INTO tasks (user_id, title, description, event_id, event_phase) VALUES (${req.userId}, $1, $2, $3, $4)`,
            [item.title, `Rutina de salida · ${event.title}`, event.id, item.event_phase]
          );
        }
      }
      await client.query('COMMIT');
      res.status(201).json(event);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/events/:id — partial merge
router.put('/:id', async (req, res) => {
  const allowed = ['title', 'description', 'start', 'end', 'location', 'travel_minutes', 'status', 'completed_at', 'use_departure_checklist'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (!(key in req.body)) continue;
    let value = req.body[key];
    if (value === '') value = null;
    if (key === 'title' && value) value = String(value).trim();
    if (key === 'travel_minutes' && value != null) value = Number(value) || null;
    if (key === 'use_departure_checklist') value = Boolean(value);
    if (key === 'status' && !['open', 'done', 'cancelled'].includes(value)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    values.push(value);
    const col = key === 'end' ? '"end"' : key;
    sets.push(`${col} = $${values.length}`);
  }
  // Moving or reopening an event re-arms its notification.
  if ('start' in req.body || req.body.status === 'open') {
    sets.push('notified_at = NULL');
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  try {
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE events SET ${sets.join(', ')} WHERE id = $${values.length} AND user_id = ${req.userId} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating event:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/events/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM events WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
