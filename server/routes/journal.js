import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// Strip rich HTML down to searchable plain text (mirror of client plainText)
function stripHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// GET /api/journal/search?q= — full-text ranked search (must precede /:id)
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT *, ts_rank(search_vector, plainto_tsquery('spanish', $1)) AS rank
       FROM journal
       WHERE user_id = ${req.userId} AND search_vector @@ plainto_tsquery('spanish', $1)
       ORDER BY rank DESC, updated_at DESC
       LIMIT 20`,
      [q]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error searching notes:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Dos clases de escrito en el mismo diario: notas y pensamientos.
const KINDS = ['nota', 'pensamiento'];
const cleanKind = (k) => (KINDS.includes(k) ? k : null);

// GET /api/journal
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM journal WHERE user_id = ${req.userId} ORDER BY updated_at DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching notes:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/journal/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM journal WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching note:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/journal
router.post('/', async (req, res) => {
  const { title, content, mood, kind } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO journal (user_id, title, content, content_text, mood, kind) VALUES (${req.userId}, $1, $2, $3, $4, $5) RETURNING *`,
      [title.trim(), content || null, stripHtml(content), mood || null, cleanKind(kind) || 'nota']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/journal/:id
router.put('/:id', async (req, res) => {
  const { title, content, mood, kind } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const result = await pool.query(
      `UPDATE journal SET title = $1, content = $2, content_text = $3, mood = $4, kind = COALESCE($5, kind), updated_at = CURRENT_TIMESTAMP WHERE id = $6 AND user_id = ${req.userId} RETURNING *`,
      [title.trim(), content || null, stripHtml(content), mood || null, cleanKind(kind), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating note:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/journal/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM journal WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Note not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting note:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
