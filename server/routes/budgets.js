import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/budgets?month=YYYY-MM
router.get('/', async (req, res) => {
  try {
    const params = [];
    let where = '';
    if (req.query.month) {
      params.push(req.query.month);
      where = `WHERE month = $${params.length}`;
    }
    const result = await pool.query(`SELECT * FROM budgets ${where} ORDER BY category ASC`, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching budgets:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/budgets — upsert {category, month, amount}; empty amount deletes
router.put('/', async (req, res) => {
  const { category, month, amount } = req.body;
  if (!category || !month) {
    return res.status(400).json({ error: 'Category and month are required' });
  }
  try {
    if (amount === null || amount === undefined || amount === '' || Number(amount) <= 0) {
      await pool.query('DELETE FROM budgets WHERE user_id = 1 AND category = $1 AND month = $2', [category, month]);
      return res.json({ success: true, deleted: true });
    }
    const result = await pool.query(
      `INSERT INTO budgets (user_id, category, month, amount) VALUES (1, $1, $2, $3)
       ON CONFLICT (user_id, category, month) DO UPDATE SET amount = $3 RETURNING *`,
      [category, month, Number(amount)]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving budget:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
