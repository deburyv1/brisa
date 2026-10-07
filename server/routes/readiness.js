import { Router } from 'express';
import pool from '../db.js';

const router = Router();

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// GET /api/readiness — items with today's state
router.get('/', async (req, res) => {
  try {
    const items = await pool.query(
      'SELECT * FROM readiness_items WHERE user_id = 1 AND active = TRUE ORDER BY position ASC, id ASC'
    );
    const states = await pool.query(
      'SELECT item_id FROM readiness_state WHERE day = $1',
      [req.query.date || todayKey()]
    );
    const done = new Set(states.rows.map(r => String(r.item_id)));
    res.json(items.rows.map(i => ({ ...i, done: done.has(String(i.id)) })));
  } catch (err) {
    console.error('Error fetching readiness:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/readiness/items — add custom condition
router.post('/items', async (req, res) => {
  const { label } = req.body;
  if (!label || !label.trim()) {
    return res.status(400).json({ error: 'Label is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO readiness_items (user_id, label) VALUES (1, $1)
       ON CONFLICT (user_id, label) DO UPDATE SET active = TRUE RETURNING *`,
      [label.trim().slice(0, 100)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating readiness item:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/readiness/items/:id — edit label/active/link source
router.put('/items/:id', async (req, res) => {
  const { label, active, source_type, source_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE readiness_items
       SET label = COALESCE($1, label),
           active = COALESCE($2, active),
           source_type = $3,
           source_id = $4
       WHERE id = $5 AND user_id = 1 RETURNING *`,
      [label?.trim() || null, active == null ? null : !!active,
       source_type || null, source_id || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating readiness item:', err);
    res.status(500).json({ error: 'Database error' });
  }
});
router.post('/check', async (req, res) => {
  const { item_id, done, date } = req.body;
  if (!item_id) return res.status(400).json({ error: 'item_id is required' });
  const day = date || todayKey();
  try {
    if (done) {
      await pool.query(
        `INSERT INTO readiness_state (day, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [day, item_id]
      );
    } else {
      await pool.query('DELETE FROM readiness_state WHERE day = $1 AND item_id = $2', [day, item_id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error toggling readiness:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
