import { Router } from 'express';
import pool from '../db.js';
import { searchPhotos, searchPlaces } from '../shopping-card.js';

const router = Router();

// GET /api/shopping
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM shopping_items WHERE user_id = ${req.userId} ORDER BY is_purchased ASC, created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching shopping items:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/shopping/:id/photos — busca fotos (DuckDuckGo, Wikimedia,
// OpenFoodFacts) y las deja locales y chicas en shopping-photos/.
router.get('/:id/photos', async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, description FROM shopping_items WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    const poolUrls = await searchPhotos(req.params.id, result.rows[0].description);
    res.json({ pool: poolUrls });
  } catch (err) {
    console.error('Error buscando fotos:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/shopping/:id/places — tiendas reales de Santiago (OpenStreetMap)
router.get('/:id/places', async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, description FROM shopping_items WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ places: await searchPlaces(result.rows[0].description) });
  } catch (err) {
    console.error('Error buscando lugares:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/shopping
router.post('/', async (req, res) => {
  const { description, estimated_amount, quantity, category } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO shopping_items (user_id, description, estimated_amount, quantity, category) VALUES (${req.userId}, $1, $2, $3, $4) RETURNING *`,
      [description.trim(), estimated_amount || null, quantity || 1, category || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating item:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/shopping/:id
router.put('/:id', async (req, res) => {
  const { description, estimated_amount, quantity, category, is_purchased, card } = req.body;
  try {
    const result = await pool.query(
      `UPDATE shopping_items SET description = COALESCE($1, description),
        estimated_amount = $2, quantity = COALESCE($3, quantity), category = $4,
        is_purchased = COALESCE($5, is_purchased),
        purchased_at = CASE WHEN $5 = TRUE THEN CURRENT_TIMESTAMP WHEN $5 = FALSE THEN NULL ELSE purchased_at END,
        card = COALESCE(card, '{}'::jsonb) || $6::jsonb
       WHERE id = $7 AND user_id = ${req.userId} RETURNING *`,
      [description?.trim() || null, estimated_amount || null, quantity || null, category || null,
       is_purchased == null ? null : !!is_purchased, card || {}, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating item:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/shopping/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM shopping_items WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting item:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/shopping?purchased=1 — clear purchased
router.delete('/', async (req, res) => {
  if (req.query.purchased !== '1') {
    return res.status(400).json({ error: 'Use ?purchased=1' });
  }
  try {
    const result = await pool.query(`DELETE FROM shopping_items WHERE is_purchased = TRUE AND user_id = ${req.userId}`);
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    console.error('Error clearing purchased:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
