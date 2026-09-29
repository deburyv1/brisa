import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/transactions
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transactions ORDER BY date DESC, id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/transactions/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching transaction:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/transactions
router.post('/', async (req, res) => {
  const { description, amount, type, category, date } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO transactions (user_id, description, amount, type, category, date) VALUES (1, $1, $2, $3, $4, $5) RETURNING *',
      [description.trim(), parsedAmount, type === 'income' ? 'income' : 'expense', category || null, date || new Date().toISOString().slice(0, 10)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating transaction:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', async (req, res) => {
  const { description, amount, type, category, date } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  try {
    const result = await pool.query(
      'UPDATE transactions SET description = $1, amount = $2, type = $3, category = $4, date = $5 WHERE id = $6 RETURNING *',
      [description.trim(), parsedAmount, type === 'income' ? 'income' : 'expense', category || null, date || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating transaction:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting transaction:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
