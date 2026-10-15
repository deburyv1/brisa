import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/events?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const params = [];
    let where = '';
    if (req.query.date) {
      params.push(req.query.date);
      where = `WHERE start::date = $${params.length}::date`;
    }
    const result = await pool.query(`SELECT * FROM events ${where} ORDER BY start ASC`, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching event:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/events
router.post('/', async (req, res) => {
  const { title, description, start, end, location, entry_id, travel_minutes } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!start) {
    return res.status(400).json({ error: 'Start is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO events (user_id, title, description, start, "end", location, entry_id, travel_minutes) VALUES (1, $1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [title.trim(), description || null, start, end || null, location || null, entry_id || null, travel_minutes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/events/:id — partial merge
router.put('/:id', async (req, res) => {
  const allowed = ['title', 'description', 'start', 'end', 'location', 'travel_minutes', 'status', 'completed_at'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (!(key in req.body)) continue;
    let value = req.body[key];
    if (value === '') value = null;
    if (key === 'title' && value) value = String(value).trim();
    if (key === 'travel_minutes' && value != null) value = Number(value) || null;
    if (key === 'status' && !['open', 'done'].includes(value)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    values.push(value);
    const col = key === 'end' ? '"end"' : key;
    sets.push(`${col} = $${values.length}`);
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  try {
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE events SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
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
    await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
