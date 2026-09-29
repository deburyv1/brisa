import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/entries?status=inbox
router.get('/', async (req, res) => {
  try {
    const params = [];
    let where = '';
    if (req.query.status) {
      params.push(req.query.status);
      where = `WHERE status = $${params.length}`;
    }
    const result = await pool.query(`SELECT * FROM entries ${where} ORDER BY created_at DESC`, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching entries:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/entries
router.post('/', async (req, res) => {
  const { raw_text, suggested_type } = req.body;
  if (!raw_text || !raw_text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO entries (user_id, raw_text, suggested_type, status) VALUES (1, $1, $2, $3) RETURNING *',
      [raw_text.trim(), suggested_type || null, 'inbox']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating entry:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/entries/:id
router.patch('/:id', async (req, res) => {
  const { status, target_type, target_id } = req.body;
  try {
    const result = await pool.query(
      'UPDATE entries SET status = COALESCE($1, status), target_type = COALESCE($2, target_type), target_id = COALESCE($3, target_id) WHERE id = $4 RETURNING *',
      [status || null, target_type || null, target_id || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating entry:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/entries/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM entries WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting entry:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
