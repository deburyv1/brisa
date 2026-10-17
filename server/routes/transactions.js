import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import crypto from 'crypto';
import pool from '../db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Linked transaction must exist and belong to the same user (and account)
async function validateLink(linkedId, accountId, userId, res) {
  if (!linkedId) return null;
  const found = await pool.query(
    `SELECT id, account_id FROM transactions WHERE id = $1 AND user_id = ${userId}`,
    [linkedId]
  );
  if (found.rows.length === 0) {
    res.status(400).json({ error: 'Linked transaction not found' });
    return false;
  }
  if (accountId && found.rows[0].account_id && String(found.rows[0].account_id) !== String(accountId)) {
    res.status(400).json({ error: 'Linked transaction belongs to another account' });
    return false;
  }
  return linkedId;
}

// GET /api/transactions?account_id=&uncategorized=1
router.get('/', async (req, res) => {
  try {
    const conditions = [`user_id = ${req.userId}`];
    const params = [];
    if (req.query.account_id) {
      params.push(req.query.account_id);
      conditions.push(`account_id = $${params.length}`);
    }
    if (req.query.uncategorized === '1') {
      conditions.push('category IS NULL');
    }
    const result = await pool.query(`SELECT * FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY date DESC, id DESC`, params);
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
    let where = `WHERE user_id = ${req.userId} AND category IS NULL`;
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
    const result = await pool.query(`SELECT * FROM transactions WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching transaction:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/transactions
router.post('/', async (req, res) => {
  const { description, amount, type, category, date, account_id, linked_id, is_recurring, alias, status, details, owner, person_id } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  const linkId = await validateLink(linked_id, account_id, req.userId, res);
  if (linkId === false) return;
  const ownerVal = owner === 'other' ? 'other' : 'mine';
  let personVal = person_id || null;
  if (personVal) {
    const found = await pool.query(`SELECT id FROM people WHERE id = $1 AND user_id = ${req.userId}`, [personVal]);
    if (found.rows.length === 0) {
      return res.status(400).json({ error: 'Person not found' });
    }
  } else if (ownerVal === 'other') {
    personVal = null;
  }
  try {
    const result = await pool.query(
      `INSERT INTO transactions (user_id, account_id, description, amount, type, category, date, linked_id, is_recurring, alias, status, details, owner, person_id) VALUES (${req.userId}, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [account_id || null, description.trim(), parsedAmount, type === 'income' ? 'income' : 'expense', category || null, date || new Date().toISOString().slice(0, 10), linkId, is_recurring ? true : false, alias?.trim() || null, status === 'planned' ? 'planned' : 'posted', details?.trim() || null, ownerVal, personVal]
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
      `UPDATE transactions SET category = $1 WHERE id = $2 AND user_id = ${req.userId} RETURNING *`,
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
  const { description, amount, type, category, date, account_id, linked_id, is_recurring, alias, status, details, owner, person_id } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  if (linked_id && String(linked_id) === String(req.params.id)) {
    return res.status(400).json({ error: 'Cannot link to itself' });
  }
  const linkId = await validateLink(linked_id, account_id, req.userId, res);
  if (linkId === false) return;
  const ownerVal = owner === 'other' ? 'other' : 'mine';
  let personVal = person_id || null;
  if (personVal) {
    const found = await pool.query(`SELECT id FROM people WHERE id = $1 AND user_id = ${req.userId}`, [personVal]);
    if (found.rows.length === 0) {
      return res.status(400).json({ error: 'Person not found' });
    }
  }
  try {
    const result = await pool.query(
      `UPDATE transactions SET description = $1, amount = $2, type = $3, category = $4, date = $5, account_id = $6, linked_id = $7, is_recurring = $8, alias = $9, status = $10, details = $11, owner = $12, person_id = $13 WHERE id = $14 AND user_id = ${req.userId} RETURNING *`,
      [description.trim(), parsedAmount, type === 'income' ? 'income' : 'expense', category || null, date || null, account_id || null, linkId, is_recurring ? true : false, alias?.trim() || null, status === 'planned' ? 'planned' : 'posted', details?.trim() || null, ownerVal, personVal, req.params.id]
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
    await pool.query(`DELETE FROM transactions WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting transaction:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/transactions/import?account_id=&force=1 — import Banco de Chile XLSX
router.post('/import', upload.single('file'), async (req, res) => {
  const accountId = req.query.account_id || req.body.account_id;
  const force = req.query.force === '1' || req.body.force === '1';
  if (!accountId) {
    return res.status(400).json({ error: 'account_id is required' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Excel file is required' });
  }
  try {
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    // The account must belong to the session user.
    const accountRes = await pool.query(`SELECT * FROM accounts WHERE id = $1 AND user_id = ${req.userId}`, [accountId]);
    if (accountRes.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Same exact file already uploaded for this account?
    const prior = await pool.query(
      `SELECT * FROM imports WHERE account_id = $1 AND file_hash = $2 AND user_id = ${req.userId} ORDER BY created_at DESC LIMIT 1`,
      [accountId, fileHash]
    );
    if (prior.rows.length > 0 && !force) {
      return res.status(409).json({ duplicate_file: true, import: prior.rows[0] });
    }

    const initialDate = accountRes.rows[0]?.initial_date
      ? String(accountRes.rows[0].initial_date).slice(0, 10)
      : null;

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

    const importRes = await pool.query(
      `INSERT INTO imports (user_id, account_id, filename, file_hash) VALUES (${req.userId}, $1, $2, $3) RETURNING *`,
      [accountId, req.file.originalname || 'cartola.xlsx', fileHash]
    );
    const importId = importRes.rows[0].id;

    let imported = 0;
    let duplicates = 0;
    let skipped = 0;
    let beforeInitial = 0;

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

      // Only movements after the initial balance date
      if (initialDate && date <= initialDate) { beforeInitial++; continue; }

      const type = deposit > 0 ? 'income' : 'expense';
      const amount = deposit > 0 ? deposit : charge;

      // Dedupe: same account + date + description + amount
      const existing = await pool.query(
        `SELECT id FROM transactions WHERE account_id = $1 AND date = $2 AND description = $3 AND amount = $4 AND user_id = ${req.userId} LIMIT 1`,
        [accountId, date, detail, amount]
      );
      if (existing.rows.length > 0) { duplicates++; continue; }

      await pool.query(
        `INSERT INTO transactions (user_id, account_id, import_id, description, amount, type, category, date) VALUES (${req.userId}, $1, $2, $3, $4, $5, NULL, $6)`,
        [accountId, importId, detail, amount, type, date]
      );
      imported++;
    }

    await pool.query(
      `UPDATE imports SET imported = $1, duplicates = $2, skipped = $3, before_initial = $4 WHERE id = $5 AND user_id = ${req.userId}`,
      [imported, duplicates, skipped, beforeInitial, importId]
    );

    res.json({ imported, duplicates, skipped, before_initial: beforeInitial });
  } catch (err) {
    console.error('Error importing transactions:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

export default router;
