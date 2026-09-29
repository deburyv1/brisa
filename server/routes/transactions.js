import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import pool from '../db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/transactions?account_id=&uncategorized=1
router.get('/', async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    if (req.query.account_id) {
      params.push(req.query.account_id);
      conditions.push(`account_id = $${params.length}`);
    }
    if (req.query.uncategorized === '1') {
      conditions.push('category IS NULL');
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`SELECT * FROM transactions ${where} ORDER BY date DESC, id DESC`, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/transactions/uncategorized-count?account_id=
router.get('/uncategorized-count', async (req, res) => {
  try {
    const params = [];
    let where = 'WHERE category IS NULL';
    if (req.query.account_id) {
      params.push(req.query.account_id);
      where += ` AND account_id = $${params.length}`;
    }
    const result = await pool.query(`SELECT COUNT(*)::int AS count FROM transactions ${where}`, params);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error counting uncategorized:', err);
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
  const { description, amount, type, category, date, account_id } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO transactions (user_id, account_id, description, amount, type, category, date) VALUES (1, $1, $2, $3, $4, $5, $6) RETURNING *',
      [account_id || null, description.trim(), parsedAmount, type === 'income' ? 'income' : 'expense', category || null, date || new Date().toISOString().slice(0, 10)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating transaction:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/transactions/:id/category — quick categorize
router.patch('/:id/category', async (req, res) => {
  const { category } = req.body;
  try {
    const result = await pool.query(
      'UPDATE transactions SET category = $1 WHERE id = $2 RETURNING *',
      [category || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', async (req, res) => {
  const { description, amount, type, category, date, account_id } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  try {
    const result = await pool.query(
      'UPDATE transactions SET description = $1, amount = $2, type = $3, category = $4, date = $5, account_id = $6 WHERE id = $7 RETURNING *',
      [description.trim(), parsedAmount, type === 'income' ? 'income' : 'expense', category || null, date || null, account_id || null, req.params.id]
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

// POST /api/transactions/import?account_id= — import Banco de Chile XLSX
router.post('/import', upload.single('file'), async (req, res) => {
  const accountId = req.query.account_id || req.body.account_id;
  if (!accountId) {
    return res.status(400).json({ error: 'account_id is required' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Excel file is required' });
  }
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Find header row: Fecha | Detalle | Monto cargo | Monto abono | Saldo
    let headerIdx = rows.findIndex(r =>
      String(r[0]).toLowerCase() === 'fecha' && String(r[1]).toLowerCase() === 'detalle'
    );
    if (headerIdx === -1) {
      return res.status(400).json({ error: 'Formato no reconocido: no se encontró la fila Fecha/Detalle' });
    }

    let imported = 0;
    let duplicates = 0;
    let skipped = 0;

    for (const r of rows.slice(headerIdx + 1)) {
      const rawDate = String(r[0]).trim();
      const detail = String(r[1]).trim();
      const charge = Number(String(r[2]).replace(/[^0-9.-]/g, '')) || 0;
      const deposit = Number(String(r[3]).replace(/[^0-9.-]/g, '')) || 0;
      if (!rawDate || !detail || (charge === 0 && deposit === 0)) { skipped++; continue; }

      // DD-MM-YYYY -> YYYY-MM-DD
      const m = rawDate.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
      if (!m) { skipped++; continue; }
      const date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      const type = deposit > 0 ? 'income' : 'expense';
      const amount = deposit > 0 ? deposit : charge;

      // Dedupe: same account + date + description + amount
      const existing = await pool.query(
        'SELECT id FROM transactions WHERE account_id = $1 AND date = $2 AND description = $3 AND amount = $4 LIMIT 1',
        [accountId, date, detail, amount]
      );
      if (existing.rows.length > 0) { duplicates++; continue; }

      await pool.query(
        'INSERT INTO transactions (user_id, account_id, description, amount, type, category, date) VALUES (1, $1, $2, $3, $4, NULL, $5)',
        [accountId, detail, amount, type, date]
      );
      imported++;
    }

    res.json({ imported, duplicates, skipped });
  } catch (err) {
    console.error('Error importing transactions:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

export default router;
