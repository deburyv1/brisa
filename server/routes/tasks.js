import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/tasks[?parent_task_id=]
router.get('/', async (req, res) => {
  try {
    const { parent_task_id } = req.query;
    let result;
    if (parent_task_id !== undefined && parent_task_id !== '') {
      result = await pool.query(
        'SELECT * FROM tasks WHERE parent_task_id = $1 ORDER BY created_at ASC',
        [Number(parent_task_id)]
      );
    } else {
      result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    }
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
  const { title, description, priority, scheduled_datetime, due_datetime, first_step, estimated_minutes, event_id, parent_task_id } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO tasks (user_id, title, description, priority, scheduled_datetime, due_datetime, first_step, estimated_minutes, event_id, parent_task_id) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [title.trim(), description || null, priority || 'medium', scheduled_datetime || null, due_datetime || null, first_step || null, estimated_minutes || null, Number(event_id) || null, Number(parent_task_id) || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/tasks/:id — partial merge: only provided keys are updated
router.put('/:id', async (req, res) => {
  const allowed = ['title', 'description', 'priority', 'scheduled_datetime', 'due_datetime', 'is_completed', 'first_step', 'estimated_minutes', 'completed_at', 'event_id', 'parent_task_id'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (!(key in req.body)) continue;
    let value = req.body[key];
    if (value === '') value = null;
    if (key === 'title' && value) value = String(value).trim();
    if (key === 'is_completed') value = value ? true : false;
    if (key === 'priority' && !value) value = 'medium';
    values.push(value);
    sets.push(`${key} = $${values.length}`);
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  try {
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    // Completing a task auto-checks linked readiness conditions (today only).
    // Manual state always wins: uncompleting never unchecks.
    if (result.rows[0].is_completed) {
      await pool.query(
        `INSERT INTO readiness_state (day, item_id)
         SELECT CURRENT_DATE, id FROM readiness_items
         WHERE source_type = 'task' AND source_id = $1
         ON CONFLICT DO NOTHING`,
        [req.params.id]
      ).catch(e => console.error('Error syncing readiness:', e));
    }
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
