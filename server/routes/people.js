import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// Todas las consultas filtran por req.userId (la sesión), nunca por un
// número fijo: así cada persona ve solo lo suyo.

// GET /api/people
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM people WHERE user_id = ${req.userId} ORDER BY name`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching people:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/people
router.post('/', async (req, res) => {
  const { name, nickname, rut, birthday, relation, photo, phone } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO people (user_id, name, nickname, rut, birthday, relation, photo, phone) VALUES (${req.userId}, $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name.trim(), nickname || null, rut || null, birthday || null, relation || null, photo || null, phone || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating person:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/people/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM people WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Person not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching person:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/people/:id
router.put('/:id', async (req, res) => {
  const { name, nickname, rut, birthday, relation, photo, phone } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const result = await pool.query(
      `UPDATE people SET name = $1, nickname = $2, rut = $3, birthday = $4, relation = $5, photo = $6, phone = $7 WHERE id = $8 AND user_id = ${req.userId} RETURNING *`,
      [name.trim(), nickname || null, rut || null, birthday || null, relation || null, photo || null, phone || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Person not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating person:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/people/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM people WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Person not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting person:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
