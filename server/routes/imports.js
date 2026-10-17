import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/imports?account_id=
router.get('/', async (req, res) => {
  try {
    const params = [];
    const clauses = [`user_id = ${req.userId}`];
    if (req.query.account_id) {
      params.push(req.query.account_id);
      clauses.push(`account_id = $${params.length}`);
    }
    const result = await pool.query(`SELECT * FROM imports WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching imports:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/imports/:id — deletes the import and its movements
router.delete('/:id', async (req, res) => {
  try {
    const imp = await pool.query(`DELETE FROM imports WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (imp.rowCount === 0) return res.status(404).json({ error: 'Import not found' });
    const delTx = await pool.query(`DELETE FROM transactions WHERE import_id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    res.json({ success: true, deletedMovements: delTx.rowCount });
  } catch (err) {
    console.error('Error deleting import:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
