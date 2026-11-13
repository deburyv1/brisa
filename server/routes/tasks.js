import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// Datos útiles: pares campo/valor (link del trámite, RUT asociado...)
// que acompañan a la acción mientras la realizas. Se guarda siempre
// como lista saneada de { label, value }, nunca texto libre.
function sanitizePairs(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((p) => ({
    label: String(p?.label ?? '').trim().slice(0, 60),
    value: String(p?.value ?? '').trim().slice(0, 600),
  })).filter((p) => p.label || p.value);
}

// GET /api/tasks[?parent_task_id=]
router.get('/', async (req, res) => {
  try {
    const { parent_task_id } = req.query;
    let result;
    if (parent_task_id !== undefined && parent_task_id !== '') {
      result = await pool.query(
        `SELECT * FROM tasks WHERE parent_task_id = $1 AND user_id = ${req.userId} ORDER BY position ASC, created_at ASC, id ASC`,
        [Number(parent_task_id)]
      );
    } else {
      result = await pool.query(`SELECT * FROM tasks WHERE user_id = ${req.userId} ORDER BY created_at DESC`);
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
    const result = await pool.query(`SELECT * FROM tasks WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching task:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  const { title, description, priority, scheduled_datetime, due_datetime, first_step, estimated_minutes, event_id, parent_task_id, event_phase, data_pairs } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const parentId = Number(parent_task_id) || null;
    let position = 0;
    if (parentId) {
      const next = await pool.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM tasks WHERE user_id = ${req.userId} AND parent_task_id = $1`,
        [parentId]
      );
      position = Number(next.rows[0]?.position) || 0;
    }
    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, priority, scheduled_datetime, due_datetime, first_step, estimated_minutes, event_id, parent_task_id, event_phase, position, data_pairs) VALUES (${req.userId}, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [title.trim(), description || null, priority || 'medium', scheduled_datetime || null, due_datetime || null, first_step || null, estimated_minutes || null, Number(event_id) || null, parentId, event_id ? (['prep', 'leave', 'during'].includes(event_phase) ? event_phase : 'prep') : null, position, JSON.stringify(sanitizePairs(data_pairs))]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/tasks/reorder — persist the order of an action's checklist.
router.put('/reorder', async (req, res) => {
  const parentId = Number(req.body?.parent_task_id);
  const ids = req.body?.task_ids;
  if (!Number.isInteger(parentId) || parentId <= 0 || !Array.isArray(ids) || ids.length > 200
      || ids.some(id => !Number.isInteger(Number(id))) || new Set(ids.map(Number)).size !== ids.length) {
    return res.status(400).json({ error: 'Invalid checklist order' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const parent = await client.query(
      `SELECT id FROM tasks WHERE id = $1 AND user_id = ${req.userId} FOR UPDATE`, [parentId]
    );
    if (!parent.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Parent action not found' });
    }
    const children = await client.query(
      `SELECT id FROM tasks WHERE parent_task_id = $1 AND user_id = ${req.userId} FOR UPDATE`, [parentId]
    );
    const expected = new Set(children.rows.map(row => Number(row.id)));
    const ordered = ids.map(Number);
    if (ordered.length !== expected.size || ordered.some(id => !expected.has(id))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Checklist changed; reload and try again' });
    }
    for (let index = 0; index < ordered.length; index++) {
      await client.query(
        `UPDATE tasks SET position = $1 WHERE id = $2 AND parent_task_id = $3 AND user_id = ${req.userId}`,
        [index, ordered[index], parentId]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error reordering checklist:', err);
    res.status(500).json({ error: 'Could not save checklist order' });
  } finally {
    client.release();
  }
});

// PUT /api/tasks/:id — partial merge: only provided keys are updated
router.put('/:id', async (req, res) => {
  const allowed = ['title', 'description', 'priority', 'scheduled_datetime', 'due_datetime', 'is_completed', 'first_step', 'estimated_minutes', 'completed_at', 'started_at', 'event_id', 'parent_task_id', 'event_phase', 'data_pairs'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (!(key in req.body)) continue;
    let value = req.body[key];
    if (value === '') value = null;
    if (key === 'title' && value) value = String(value).trim();
    if (key === 'is_completed') value = value ? true : false;
    if (key === 'priority' && !value) value = 'medium';
    if (key === 'event_phase' && value != null && !['prep', 'leave', 'during'].includes(value)) return res.status(400).json({ error: 'Invalid event phase' });
    if (key === 'data_pairs') value = JSON.stringify(sanitizePairs(value));
    values.push(value);
    sets.push(`${key} = $${values.length}`);
  }
  if (req.body.is_completed === false && !('started_at' in req.body)) {
    values.push(null);
    sets.push(`started_at = $${values.length}`);
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  try {
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${values.length} AND user_id = ${req.userId} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    // Completing a task auto-checks linked readiness conditions (today only).
    // Manual state always wins: uncompleting never unchecks.
    if (result.rows[0].is_completed) {
      await pool.query(
        `INSERT INTO readiness_state (day, item_id)
         SELECT CURRENT_DATE, id FROM readiness_items
         WHERE source_type = 'task' AND source_id = $1 AND user_id = ${req.userId}
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
    const result = await pool.query(`DELETE FROM tasks WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
