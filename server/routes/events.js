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

// POST /api/events
router.post('/', async (req, res) => {
  const { title, description, start, end, location, entry_id } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!start) {
    return res.status(400).json({ error: 'Start is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO events (user_id, title, description, start, "end", location, entry_id) VALUES (1, $1, $2, $3, $4, $5, $6) RETURNING *',
      [title.trim(), description || null, start, end || null, location || null, entry_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating event:', err);
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
