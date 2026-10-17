import { Router } from 'express';
import pool from '../db.js';

const router = Router();

/* Papelera: lo que se borra queda acá y se puede devolver tal como estaba.
   Las filas las guarda el trigger brisa_trash_row() (setup-db.js), así que
   ninguna ruta de borrado tiene que hacer nada especial. */

// Tablas que se pueden devolver, con su nombre para mostrar.
const TABLES = {
  tasks: 'Tarea',
  journal: 'Nota',
  ideas: 'Idea',
  events: 'Evento',
  reminders: 'Recordatorio',
  people: 'Persona',
  accounts: 'Cuenta',
  transactions: 'Movimiento',
  entries: 'Captura',
  shopping_items: 'Compra',
  habits: 'Hábito',
  clips: 'Clip',
};

const colCache = new Map();
const fkCache = new Map();

// Columnas insertables (deja fuera las generadas, como journal.search_vector).
async function columnsFor(table) {
  if (colCache.has(table)) return colCache.get(table);
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND is_generated = 'NEVER'
     ORDER BY ordinal_position`,
    [table]
  );
  const cols = r.rows.map(x => x.column_name);
  colCache.set(table, cols);
  return cols;
}

// Claves foráneas: si el original ya no está, se devuelve la fila sin ese lazo.
async function fksFor(table) {
  if (fkCache.has(table)) return fkCache.get(table);
  const r = await pool.query(
    `SELECT kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_col
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1`,
    [table]
  );
  fkCache.set(table, r.rows);
  return r.rows;
}

const quote = (c) => `"${String(c).replace(/"/g, '')}"`;

async function insertRow(table, payload) {
  const cols = await columnsFor(table);
  const sql = `INSERT INTO ${table} (${cols.map(quote).join(', ')})
    SELECT ${cols.map(c => `r.${quote(c)}`).join(', ')}
    FROM jsonb_populate_record(NULL::${table}, $1) r`;
  await pool.query(sql, [payload]);
  await pool.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${table}))`,
    [table]
  );
}

async function restoreRow(row) {
  const table = row.table_name;
  if (!TABLES[table]) throw new Error('Esta tabla no se puede devolver.');

  let payload = row.payload;
  try {
    await insertRow(table, payload);
  } catch (err) {
    if (err.code !== '23503') throw err; // no es un lazo roto
    // Se cayó un lazo (ej: la tarea que originó la idea ya no está):
    // se sueltan sólo los lazos rotos y se intenta de nuevo.
    for (const fk of await fksFor(table)) {
      const val = payload[fk.column_name];
      if (val === null || val === undefined) continue;
      const found = await pool.query(
        `SELECT 1 FROM ${fk.ref_table} WHERE ${quote(fk.ref_col)} = $1`, [val]
      );
      if (found.rowCount === 0) payload = { ...payload, [fk.column_name]: null };
    }
    await insertRow(table, payload);
  }

  await pool.query(`DELETE FROM trash WHERE id = $1`, [row.id]);
}

// GET /api/trash — lo último borrado, más nuevo primero
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const result = await pool.query(
      `SELECT id, user_id, table_name, row_id, label, batch_id, deleted_at
       FROM trash WHERE user_id = ${req.userId}
       ORDER BY deleted_at DESC, id DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows.map(r => ({ ...r, kind: TABLES[r.table_name] || r.table_name })));
  } catch (err) {
    console.error('Error listing trash:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/trash/last — la última camada borrada (para el "Deshacer")
router.get('/last', async (req, res) => {
  try {
    const head = await pool.query(
      `SELECT batch_id, table_name, label, deleted_at
       FROM trash WHERE user_id = ${req.userId} ORDER BY deleted_at DESC, id DESC LIMIT 1`
    );
    if (head.rowCount === 0) return res.json(null);
    const first = head.rows[0];
    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM trash WHERE user_id = ${req.userId} AND batch_id = $1`,
      [first.batch_id]
    );
    res.json({
      batch_id: first.batch_id,
      table_name: first.table_name,
      kind: TABLES[first.table_name] || first.table_name,
      label: first.label,
      count: count.rows[0].n,
      deleted_at: first.deleted_at,
    });
  } catch (err) {
    console.error('Error reading last trash batch:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/trash/restore — body { batch_id } o { id }
router.post('/restore', async (req, res) => {
  const { batch_id, id } = req.body || {};
  try {
    const rows = batch_id
      ? (await pool.query(
        `SELECT * FROM trash WHERE user_id = ${req.userId} AND batch_id = $1 ORDER BY id ASC`, [batch_id]
      )).rows
      : (await pool.query(
        `SELECT * FROM trash WHERE user_id = ${req.userId} AND id = $1`, [id]
      )).rows;

    if (rows.length === 0) return res.status(404).json({ error: 'No está en la papelera' });

    let restored = 0;
    const failed = [];
    for (const row of rows) {
      try {
        await restoreRow(row);
        restored++;
      } catch (err) {
        console.error('Error restoring row:', row.table_name, row.row_id, err.message);
        failed.push({ table: row.table_name, label: row.label });
      }
    }
    if (restored === 0) {
      return res.status(409).json({ error: 'No se pudo devolver: falta el original al que estaba unido.' });
    }
    res.json({ restored, failed });
  } catch (err) {
    console.error('Error restoring from trash:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/trash/:id — borrar para siempre
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM trash WHERE id = $1 AND user_id = ${req.userId}`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error purging trash row:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/trash — vaciar
router.delete('/', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM trash WHERE user_id = ${req.userId}`);
    res.json({ success: true, emptied: result.rowCount });
  } catch (err) {
    console.error('Error emptying trash:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
