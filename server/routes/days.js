import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/days?date=YYYY-MM-DD → { misses, closed, order }
router.get('/', async (req, res) => {
  const day = req.query.date;
  if (!day) return res.status(400).json({ error: 'date is required' });
  try {
    const [misses, closed, order] = await Promise.all([
      pool.query('SELECT kind, ref_id FROM day_misses WHERE day = $1', [day]),
      pool.query('SELECT day FROM day_closures WHERE day = $1', [day]),
      pool.query('SELECT kind, ref_id FROM day_order WHERE day = $1 ORDER BY position ASC', [day]),
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
      'INSERT INTO day_misses (day, kind, ref_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
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
    await pool.query('DELETE FROM day_misses WHERE day = $1 AND kind = $2 AND ref_id = $3', [day, kind, ref_id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error unmarking miss:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/days/close { day } — finish the review
router.post('/close', async (req, res) => {
  const { day } = req.body;
  if (!day) return res.status(400).json({ error: 'day is required' });
  try {
    await pool.query('INSERT INTO day_closures (day) VALUES ($1) ON CONFLICT DO NOTHING', [day]);
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
    await client.query('DELETE FROM day_order WHERE day = $1', [day]);
    for (let i = 0; i < clean.length; i++) {
      await client.query(
        'INSERT INTO day_order (day, kind, ref_id, position) VALUES ($1, $2, $3, $4)',
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

// DELETE /api/days/close { day } — reopen the review
router.delete('/close', async (req, res) => {
  const { day } = req.body;
  if (!day) return res.status(400).json({ error: 'day is required' });
  try {
    await pool.query('DELETE FROM day_closures WHERE day = $1', [day]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error reopening day:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
