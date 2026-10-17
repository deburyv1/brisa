import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/days?date=YYYY-MM-DD → { misses, closed, order }
router.get('/', async (req, res) => {
  const day = req.query.date;
  if (!day) return res.status(400).json({ error: 'date is required' });
  try {
    const [misses, closed, order] = await Promise.all([
      pool.query(`SELECT kind, ref_id FROM day_misses WHERE day = $1 AND user_id = ${req.userId}`, [day]),
      pool.query(`SELECT day FROM day_closures WHERE day = $1 AND user_id = ${req.userId}`, [day]),
      pool.query(`SELECT kind, ref_id FROM day_order WHERE day = $1 AND user_id = ${req.userId} ORDER BY position ASC`, [day]),
    ]);
    res.json({ misses: misses.rows, closed: closed.rows.length > 0, order: order.rows });
  } catch (err) {
    console.error('Error fetching day state:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/days/miss { day, kind: task|habit, ref_id } — explicit "not done"
router.post('/miss', async (req, res) => {
  const { day, kind, ref_id } = req.body;
  if (!day || !['task', 'habit'].includes(kind) || !ref_id) {
    return res.status(400).json({ error: 'day, kind and ref_id are required' });
  }
  try {
    await pool.query(
      `INSERT INTO day_misses (user_id, day, kind, ref_id) VALUES (${req.userId}, $1, $2, $3) ON CONFLICT DO NOTHING`,
      [day, kind, ref_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking miss:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/days/miss { day, kind, ref_id }
router.delete('/miss', async (req, res) => {
  const { day, kind, ref_id } = req.body;
  if (!day || !kind || !ref_id) {
    return res.status(400).json({ error: 'day, kind and ref_id are required' });
  }
  try {
    await pool.query(`DELETE FROM day_misses WHERE day = $1 AND kind = $2 AND ref_id = $3 AND user_id = ${req.userId}`, [day, kind, ref_id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error unmarking miss:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/days/snapshot { day } — save pre-close state.
// Called when the confirmation dialog opens, BEFORE any habits
// are marked as done, so reopening can restore the exact prior state.
router.post('/snapshot', async (req, res) => {
  const { day } = req.body;
  if (!day) return res.status(400).json({ error: 'day is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const habits = await client.query(
      `SELECT id, EXISTS(SELECT 1 FROM habit_completions WHERE habit_id = habits.id AND day = $1) AS was_done FROM habits WHERE active = TRUE AND user_id = ${req.userId}`,
      [day]
    );
    const tasks = await client.query(
      `SELECT id, is_completed AS was_done FROM tasks WHERE user_id = ${req.userId} AND (scheduled_datetime::date = $1 OR due_datetime::date = $1)`,
      [day]
    );
    await client.query(`DELETE FROM day_close_snapshots WHERE day = $1 AND user_id = ${req.userId}`, [day]);
    for (const h of habits.rows) {
      await client.query(
        `INSERT INTO day_close_snapshots (user_id, day, kind, ref_id, was_done) VALUES (${req.userId}, $1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [day, 'habit', h.id, h.was_done]
      );
    }
    for (const t of tasks.rows) {
      await client.query(
        `INSERT INTO day_close_snapshots (user_id, day, kind, ref_id, was_done) VALUES (${req.userId}, $1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [day, 'task', t.id, t.was_done]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error saving snapshot:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// POST /api/days/close { day } — finish the review.
// Uses the pre-close snapshot (saved when the dialog opened).
router.post('/close', async (req, res) => {
  const { day } = req.body;
  if (!day) return res.status(400).json({ error: 'day is required' });
  try {
    await pool.query(
      `INSERT INTO day_closures (user_id, day) VALUES (${req.userId}, $1) ON CONFLICT DO NOTHING`,
      [day]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error closing day:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/days/order { day, items: [{ kind, ref_id }] } — replace manual order
router.post('/order', async (req, res) => {
  const { day, items } = req.body;
  if (!day || !Array.isArray(items)) {
    return res.status(400).json({ error: 'day and items are required' });
  }
  const clean = items
    .filter(x => x && ['task', 'habit', 'event'].includes(x.kind) && Number(x.ref_id))
    .slice(0, 200);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM day_order WHERE day = $1 AND user_id = ${req.userId}`, [day]);
    for (let i = 0; i < clean.length; i++) {
      await client.query(
        `INSERT INTO day_order (user_id, day, kind, ref_id, position) VALUES (${req.userId}, $1, $2, $3, $4)`,
        [day, clean[i].kind, Number(clean[i].ref_id), i]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, count: clean.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error saving day order:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// DELETE /api/days/close { day, restore=true } — reopen the review.
// Restores the pre-close snapshot so the user can correct and re-close,
// unless restore:false (used when the user already corrected data directly).
router.delete('/close', async (req, res) => {
  const { day, restore = true } = req.body;
  if (!day) return res.status(400).json({ error: 'day is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (restore !== false) {
      const snap = await client.query(
        `SELECT kind, ref_id, was_done FROM day_close_snapshots WHERE day = $1 AND user_id = ${req.userId}`,
        [day]
      );
      for (const row of snap.rows) {
        if (row.kind === 'habit') {
          if (row.was_done) {
            await client.query(
              'INSERT INTO habit_completions (habit_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [row.ref_id, day]
            );
          } else {
            await client.query(
              'DELETE FROM habit_completions WHERE habit_id = $1 AND day = $2',
              [row.ref_id, day]
            );
          }
        } else if (row.kind === 'task') {
          await client.query(
            `UPDATE tasks SET is_completed = $1, completed_at = CASE WHEN $1 THEN COALESCE(completed_at, NOW()) ELSE NULL END WHERE id = $2 AND user_id = ${req.userId}`,
            [row.was_done, row.ref_id]
          );
        }
      }
    }
    await client.query(`DELETE FROM day_closures WHERE day = $1 AND user_id = ${req.userId}`, [day]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error reopening day:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

export default router;
