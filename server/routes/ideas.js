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

// PUT /api/ideas/:id — partial merge: only provided keys are updated
router.put('/:id', async (req, res) => {
  const sets = [];
  const values = [];
  if ('title' in req.body) {
    const t = String(req.body.title || '').trim();
    if (!t) return res.status(400).json({ error: 'Title is required' });
    values.push(t.slice(0, 255));
    sets.push(`title = $${values.length}`);
  }
  if ('description' in req.body) {
    values.push(req.body.description?.trim() || null);
    sets.push(`description = $${values.length}`);
  }
  if ('status' in req.body) {
    if (!['open', 'done'].includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    values.push(req.body.status);
    sets.push(`status = $${values.length}`);
  }
  if ('task_id' in req.body) {
    values.push(req.body.task_id == null ? null : Number(req.body.task_id) || null);
    sets.push(`task_id = $${values.length}`);
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  try {
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE ideas SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Idea not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating idea:', err);
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
