import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/reminders?pending=1
router.get('/', async (req, res) => {
  try {
    const clauses = [`user_id = ${req.userId}`];
    if (req.query.pending === '1') clauses.push('done = FALSE');
    const result = await pool.query(
      `SELECT * FROM reminders WHERE ${clauses.join(' AND ')} ORDER BY remind_at ASC NULLS LAST, created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching reminders:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/reminders
router.post('/', async (req, res) => {
  const { title, description, remind_at, entry_id, extreme } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO reminders (user_id, title, description, remind_at, entry_id, extreme) VALUES (${req.userId}, $1, $2, $3, $4, $5) RETURNING *`,
      [title.trim(), description || null, remind_at || null, entry_id || null, extreme ? true : false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating reminder:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/reminders/:id (mark done / undone)
router.patch('/:id', async (req, res) => {
  try {
    // Reopening a reminder re-arms its push notification.
    const result = await pool.query(
      `UPDATE reminders
       SET done = $1, notified_at = CASE WHEN $1 THEN notified_at ELSE NULL END
       WHERE id = $2 AND user_id = ${req.userId} RETURNING *`,
      [req.body.done ? true : false, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reminder not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating reminder:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/reminders/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM reminders WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Reminder not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting reminder:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
