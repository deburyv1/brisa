import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/tasks
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching task:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  const { title, description, priority, scheduled_datetime, due_datetime, first_step } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO tasks (user_id, title, description, priority, scheduled_datetime, due_datetime, first_step) VALUES (1, $1, $2, $3, $4, $5, $6) RETURNING *',
      [title.trim(), description || null, priority || 'medium', scheduled_datetime || null, due_datetime || null, first_step || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/tasks/:id
router.put('/:id', async (req, res) => {
  const { title, description, priority, scheduled_datetime, due_datetime, is_completed, first_step } = req.body;
  try {
    const result = await pool.query(
      'UPDATE tasks SET title = $1, description = $2, priority = $3, scheduled_datetime = $4, due_datetime = $5, is_completed = $6, first_step = $7 WHERE id = $8 RETURNING *',
      [title || null, description || null, priority || 'medium', scheduled_datetime || null, due_datetime || null, is_completed ? true : false, first_step || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
