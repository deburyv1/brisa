import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/journal
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM journal ORDER BY updated_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching notes:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/journal/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM journal WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching note:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/journal
router.post('/', async (req, res) => {
  const { title, content, mood } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO journal (user_id, title, content, mood) VALUES (1, $1, $2, $3) RETURNING *',
      [title.trim(), content || null, mood || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/journal/:id
router.put('/:id', async (req, res) => {
  const { title, content, mood } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const result = await pool.query(
      'UPDATE journal SET title = $1, content = $2, mood = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [title.trim(), content || null, mood || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating note:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/journal/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM journal WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting note:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
