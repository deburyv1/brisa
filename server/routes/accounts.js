import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/accounts
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accounts ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching accounts:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/accounts/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accounts WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching account:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/accounts
router.post('/', async (req, res) => {
  const { name, account_number, initial_balance, initial_date } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO accounts (user_id, name, account_number, initial_balance, initial_date) VALUES (1, $1, $2, $3, $4) RETURNING *',
      [name.trim(), account_number || null, Number(initial_balance) || 0, initial_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating account:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/accounts/:id
router.put('/:id', async (req, res) => {
  const { name, account_number, initial_balance, initial_date } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const result = await pool.query(
      'UPDATE accounts SET name = $1, account_number = $2, initial_balance = $3, initial_date = $4 WHERE id = $5 RETURNING *',
      [name.trim(), account_number || null, Number(initial_balance) || 0, initial_date || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating account:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE account_id = $1', [req.params.id]);
    await pool.query('DELETE FROM accounts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting account:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
