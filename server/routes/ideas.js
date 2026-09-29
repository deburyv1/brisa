import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/ideas
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ideas ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching ideas:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/ideas
router.post('/', async (req, res) => {
  const { title, description, entry_id } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO ideas (user_id, title, description, entry_id) VALUES (1, $1, $2, $3) RETURNING *',
      [title.trim(), description || null, entry_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating idea:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/ideas/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ideas WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting idea:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
