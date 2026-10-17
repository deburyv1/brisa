import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// El avatar es por usuario: se guarda bajo la clave 'avatar:<userId>'.

// GET /api/settings/avatar — serves the stored JPEG (or 404)
router.get('/avatar', async (req, res) => {
  try {
    const result = await pool.query(`SELECT value FROM settings WHERE key = 'avatar:${req.userId}'`);
    if (result.rows.length === 0 || !result.rows[0].value) {
      return res.status(404).json({ error: 'No avatar' });
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(result.rows[0].value);
  } catch (err) {
    console.error('Error fetching avatar:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/settings/avatar — body: { data: "data:image/jpeg;base64,..." }
router.put('/avatar', async (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== 'string') {
    return res.status(400).json({ error: 'Image data is required' });
  }
  const match = data.match(/^data:image\/(jpeg|png);base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Invalid image format' });
  }
  if (match[2].length > 500 * 1024) {
    return res.status(413).json({ error: 'Image too large (max ~375KB)' });
  }
  try {
    const buffer = Buffer.from(match[2], 'base64');
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('avatar:${req.userId}', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [buffer]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving avatar:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/settings/avatar
router.delete('/avatar', async (req, res) => {
  try {
    await pool.query(`DELETE FROM settings WHERE key = 'avatar:${req.userId}'`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting avatar:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
