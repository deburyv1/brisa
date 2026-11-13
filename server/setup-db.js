import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:esunsecreto@localhost:5432/brisa';

if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL not set, using local default');
}

const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 10000,
});

async function connectWithRetry(attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const client = await pool.connect();
      client.release();
      return;
    } catch (e) {
      console.error(`DB connection attempt ${i}/${attempts} failed:`, e.code || e.message);
      if (i === attempts) throw e;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

try {
  await connectWithRetry();

  await pool.query(`CREATE TABLE IF NOT EXISTS people (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    rut VARCHAR(20),
    birthday DATE,
    relation VARCHAR(50),
    photo VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(10) DEFAULT 'medium',
    scheduled_datetime TIMESTAMP,
    due_datetime TIMESTAMP,
    is_completed BOOLEAN DEFAULT FALSE,
    first_step VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS journal (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    mood VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Plain-text mirror of rich content: the searchable/quotable layer.
  // HTML stays the visual source of truth; content_text feeds search + AI.
  await pool.query(`ALTER TABLE journal ADD COLUMN IF NOT EXISTS content_text TEXT`);
  await pool.query(`UPDATE journal SET content_text = regexp_replace(
      regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        coalesce(content, ''),
        '<[^>]*>', ' ', 'g'),
        '&amp;', '&', 'g'),
        '&lt;', '<', 'g'),
        '&gt;', '>', 'g'),
        '&quot;', '"', 'g')
    WHERE content_text IS NULL AND content IS NOT NULL`);
  await pool.query(`ALTER TABLE journal ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(content_text, ''))) STORED`);
  await pool.query(`CREATE INDEX IF NOT EXISTS journal_search_idx ON journal USING GIN (search_vector)`);

  // Pensamientos: mismo diario, distinta intención. Una columna en vez de
  // una tabla paralela, para no duplicar editor, búsqueda ni ánimo.
  await pool.query(`ALTER TABLE journal ADD COLUMN IF NOT EXISTS kind VARCHAR(20) DEFAULT 'nota'`);
  await pool.query(`UPDATE journal SET kind = 'nota' WHERE kind IS NULL`);

  await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    description VARCHAR(255) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    type VARCHAR(10) DEFAULT 'expense',
    category VARCHAR(50),
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50),
    initial_balance NUMERIC(12,2) DEFAULT 0,
    initial_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    category VARCHAR(50) NOT NULL,
    month VARCHAR(7) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category, month)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS readiness_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    label VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    position INTEGER DEFAULT 0,
    source_type VARCHAR(20),
    source_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, label)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS habits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(16),
    active BOOLEAN DEFAULT TRUE,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS habit_completions (
    habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (habit_id, day)
  )`);
  await pool.query(`ALTER TABLE habits ADD COLUMN IF NOT EXISTS freq_type VARCHAR(20) DEFAULT 'daily'`);
  await pool.query(`ALTER TABLE habits ADD COLUMN IF NOT EXISTS freq_days INTEGER[]`);
  await pool.query(`ALTER TABLE habits ADD COLUMN IF NOT EXISTS default_time TIME`);

  await pool.query(`CREATE TABLE IF NOT EXISTS readiness_state (
    day DATE NOT NULL,
    item_id INTEGER REFERENCES readiness_items(id) ON DELETE CASCADE,
    PRIMARY KEY (day, item_id)
  )`);

  // Day close: explicit record of what was NOT done (inverted streak).
  // No scores, no chains: just an honest log per day.
  await pool.query(`CREATE TABLE IF NOT EXISTS day_closures (
    day DATE PRIMARY KEY,
    closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS day_misses (
    day DATE NOT NULL,
    kind VARCHAR(10) NOT NULL,
    ref_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (day, kind, ref_id)
  )`);

  // Manual per-day order for "por orden" planning mode.
  await pool.query(`CREATE TABLE IF NOT EXISTS day_order (
    day DATE NOT NULL,
    kind VARCHAR(10) NOT NULL,
    ref_id INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, kind, ref_id)
  )`);
  // "Solo este día": ese orden no pasa a ser la base de los días siguientes.
  await pool.query(`ALTER TABLE day_order ADD COLUMN IF NOT EXISTS oneoff BOOLEAN DEFAULT FALSE`);

  // Snapshot of what was done before the close: reopening restores
  // exactly that, so a mistaken close can be corrected and re-done.
  await pool.query(`CREATE TABLE IF NOT EXISTS day_close_snapshots (
    day DATE NOT NULL,
    kind VARCHAR(10) NOT NULL,
    ref_id INTEGER NOT NULL,
    was_done BOOLEAN NOT NULL,
    PRIMARY KEY (day, kind, ref_id)
  )`);

  await pool.query(`INSERT INTO readiness_items (user_id, label, position)
    SELECT 1, x.label, x.pos FROM (VALUES
      ('Ducha', 1),
      ('Cama hecha', 2),
      ('Almuerzo pensado', 3)
    ) AS x(label, pos)
    WHERE NOT EXISTS (SELECT 1 FROM readiness_items WHERE user_id = 1 AND label = x.label)`);

  // Default habits: seeded ONCE ever (flagged), so deleting
  // one never resurrects it on the next boot.
  await pool.query(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value BYTEA,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  const seeded = await pool.query("SELECT 1 FROM settings WHERE key = 'habits_seeded'");
  if (seeded.rows.length === 0) {
    await pool.query(`INSERT INTO habits (user_id, name, icon, freq_type, freq_days, position)
      SELECT 1, x.name, x.icon, x.ftype, x.fdays, x.pos FROM (VALUES
        ('Dormir', '😴', 'daily', NULL::int[], 1),
        ('Levantarse', '🌅', 'daily', NULL::int[], 2),
        ('Higiene dental', '🪥', 'custom', ARRAY[0,1,2,3,4,5,6], 3),
        ('Higiene personal / ducha', '🚿', 'custom', ARRAY[0,1,2,3,4,5,6], 4),
        ('Comer comidas principales', '🍽️', 'daily', NULL::int[], 5),
        ('Beber líquidos', '💧', 'daily', NULL::int[], 6),
        ('Usar ropa limpia', '👕', 'daily', NULL::int[], 7),
        ('Orden mínimo del espacio', '🧹', 'daily', NULL::int[], 8),
        ('Ropa / lavado', '🧺', 'custom', ARRAY[1], 9),
        ('Sacar basura', '🗑️', 'custom', ARRAY[3], 10),
        ('Limpieza básica', '🧽', 'custom', ARRAY[6], 11),
        ('Abastecer comida', '🛒', 'custom', ARRAY[5], 12),
        ('Revisar semana', '📅', 'custom', ARRAY[0], 13)
      ) AS x(name, icon, ftype, fdays, pos)
      WHERE NOT EXISTS (SELECT 1 FROM habits WHERE user_id = 1 AND name = x.name)`);
    await pool.query("INSERT INTO settings (key, value) VALUES ('habits_seeded', '1') ON CONFLICT DO NOTHING");
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS imports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    account_id INTEGER REFERENCES accounts(id),
    filename VARCHAR(255),
    file_hash VARCHAR(64),
    imported INTEGER DEFAULT 0,
    duplicates INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    before_initial INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id)`);
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES imports(id)`);
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS linked_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS alias VARCHAR(255)`);
  await pool.query(`ALTER TABLE readiness_items ADD COLUMN IF NOT EXISTS source_type VARCHAR(20)`);
  await pool.query(`ALTER TABLE readiness_items ADD COLUMN IF NOT EXISTS source_id INTEGER`);
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS owner VARCHAR(10) DEFAULT 'mine'`);
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS person_id INTEGER REFERENCES people(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS details TEXT`);
  await pool.query(`CREATE TABLE IF NOT EXISTS event_checklist_templates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    event_phase VARCHAR(20) NOT NULL DEFAULT 'leave',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS shopping_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    description VARCHAR(255) NOT NULL,
    estimated_amount NUMERIC(12,2),
    quantity INTEGER DEFAULT 1,
    category VARCHAR(50),
    is_purchased BOOLEAN DEFAULT FALSE,
    purchased_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    card JSONB
  )`);
  await pool.query(`ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS card JSONB`);
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status VARCHAR(10) DEFAULT 'posted'`);
  await pool.query(`ALTER TABLE people ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMP`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS data_pairs JSONB DEFAULT '[]'::jsonb`);
  await pool.query(`WITH ranked AS (
    SELECT id, user_id, parent_task_id,
      row_number() OVER (PARTITION BY user_id, parent_task_id ORDER BY created_at ASC, id ASC) - 1 AS next_position
    FROM tasks WHERE parent_task_id IS NOT NULL
  ), uninitialized AS (
    SELECT user_id, parent_task_id FROM tasks
    WHERE parent_task_id IS NOT NULL
    GROUP BY user_id, parent_task_id HAVING MAX(position) = 0
  )
  UPDATE tasks t SET position = ranked.next_position
  FROM ranked JOIN uninitialized USING (user_id, parent_task_id)
  WHERE t.id = ranked.id`);

  await pool.query(`CREATE TABLE IF NOT EXISTS entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    raw_text TEXT NOT NULL,
    suggested_type VARCHAR(20),
    status VARCHAR(20) DEFAULT 'inbox',
    target_type VARCHAR(20),
    target_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE journal ADD COLUMN IF NOT EXISTS entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL`);

  await pool.query(`CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start TIMESTAMP NOT NULL,
    "end" TIMESTAMP,
    location VARCHAR(255),
    entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS travel_minutes INTEGER`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS use_departure_checklist BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'local'`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event_phase VARCHAR(20)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS ideas (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open'`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open'`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);
  // Cierre de eventos pasados: cómo salió, en una frase.
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS conclusion TEXT`);
  await pool.query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`);

  // Fase 3 Estudio: local library of exported clips (files live in the clips volume)
  await pool.query(`CREATE TABLE IF NOT EXISTS clips (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    source_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS reminders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    remind_at TIMESTAMP,
    done BOOLEAN DEFAULT FALSE,
    entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS extreme BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP`);

  // Web Push: one row per installed device/browser that accepted notifications.
  await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value BYTEA,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE
  )`);

  // Auth and per-account optional modules.
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email VARCHAR(255) UNIQUE');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_avatar TEXT');
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS enabled_features JSONB NOT NULL DEFAULT '[]'::jsonb");

  // Clips RL se eliminó: queda quitar la bandera de las cuentas que la
  // tuvieran. Idempotente; un registro por migración.
  await pool.query(`CREATE TABLE IF NOT EXISTS brisa_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  const rlFeatureMigration = await pool.query("SELECT 1 FROM brisa_migrations WHERE id = 'remove-rlclips-v1'");
  if (rlFeatureMigration.rowCount === 0) {
    await pool.query(
      `UPDATE users SET enabled_features = (
         SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
         FROM jsonb_array_elements_text(enabled_features) AS x
         WHERE x <> 'rlclips'
       )
       WHERE enabled_features ? 'rlclips'`
    );
    await pool.query("INSERT INTO brisa_migrations (id) VALUES ('remove-rlclips-v1') ON CONFLICT DO NOTHING");
  }

  // Opaque sessions are stored by hash and expire in the database, not as a
  // read/modify/write JSON array in settings.
  await pool.query(`CREATE TABLE IF NOT EXISTS brisa_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS brisa_sessions_expiry_idx ON brisa_sessions (expires_at)');
  await pool.query("DELETE FROM settings WHERE key = 'brisa.sessions'");

  await pool.query(`CREATE TABLE IF NOT EXISTS spotify_tokens (
    user_id INTEGER PRIMARY KEY,
    access_token VARCHAR(500) NOT NULL,
    refresh_token VARCHAR(500) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    spotify_user_id VARCHAR(100),
    spotify_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // --- Multi-usuario: cada quien ve solo lo suyo ---
  // Tablas que aún no tenían dueño. Backfill a 1 (el dueño actual).
  await pool.query(`ALTER TABLE people ADD COLUMN IF NOT EXISTS user_id INTEGER DEFAULT 1`);
  await pool.query(`ALTER TABLE day_closures ADD COLUMN IF NOT EXISTS user_id INTEGER DEFAULT 1`);
  await pool.query(`ALTER TABLE day_misses ADD COLUMN IF NOT EXISTS user_id INTEGER DEFAULT 1`);
  await pool.query(`ALTER TABLE day_order ADD COLUMN IF NOT EXISTS user_id INTEGER DEFAULT 1`);
  await pool.query(`ALTER TABLE day_close_snapshots ADD COLUMN IF NOT EXISTS user_id INTEGER DEFAULT 1`);
  for (const t of ['people', 'day_closures', 'day_misses', 'day_order', 'day_close_snapshots']) {
    await pool.query(`UPDATE ${t} SET user_id = 1 WHERE user_id IS NULL`);
  }

  // day_closures tenía PK(day): dos personas no podían cerrar el mismo día.
  await pool.query(`DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'day_closures'::regclass AND i.indisprimary AND a.attname = 'user_id'
    ) THEN
      ALTER TABLE day_closures DROP CONSTRAINT IF EXISTS day_closures_pkey;
      ALTER TABLE day_closures ADD PRIMARY KEY (user_id, day);
    END IF;
  END $$`);

  // El avatar pasa a ser por usuario (clave 'avatar:<userId>'). Mueve el
  // que ya existía (clave 'avatar') al dueño original.
  await pool.query(`UPDATE settings SET key = 'avatar:1'
    WHERE key = 'avatar'
      AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'avatar:1')`);

  // Backfill: link pre-history movements to a synthetic import record.
  // Idempotent: only touches transactions with import_id IS NULL.
  const orphans = await pool.query(
    `SELECT user_id, account_id, COUNT(*)::int AS count
     FROM transactions WHERE import_id IS NULL GROUP BY user_id, account_id`
  );
  for (const row of orphans.rows) {
    const imp = await pool.query(
      `INSERT INTO imports (user_id, account_id, filename, file_hash)
       VALUES ($1, $2, 'movimientos anteriores', 'backfill') RETURNING id`,
      [row.user_id, row.account_id]
    );
    await pool.query(
      `UPDATE transactions SET import_id = $1
       WHERE import_id IS NULL AND user_id IS NOT DISTINCT FROM $2 AND account_id IS NOT DISTINCT FROM $3`,
      [imp.rows[0].id, row.user_id, row.account_id]
    );
    await pool.query(`UPDATE imports SET imported = $1 WHERE id = $2 AND user_id IS NOT DISTINCT FROM $3`, [row.count, imp.rows[0].id, row.user_id]);
  }

  // Borrar una cuenta se lleva sus movimientos. Con CASCADE es UNA sola
  // operación: cae en la papelera como una camada y se deshace entera.
  const accountFk = await pool.query(
    `SELECT c.conname, c.confdeltype FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'transactions' AND c.contype = 'f' AND c.confrelid = 'accounts'::regclass`
  );
  for (const row of accountFk.rows) {
    if (row.confdeltype !== 'c') {
      await pool.query(`ALTER TABLE transactions DROP CONSTRAINT "${row.conname}"`);
    }
  }
  if (!accountFk.rows.some(r => r.confdeltype === 'c')) {
    await pool.query(`ALTER TABLE transactions ADD CONSTRAINT transactions_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`);
  }

  // --- Papelera: nada se borra del todo ---
  // Un trigger guarda la fila completa (JSONB) antes de cada DELETE. Así el
  // "deshacer" y la papelera funcionan en todas las vistas sin que cada ruta
  // tenga que acordarse, y una fila borrada se puede devolver tal cual estaba.
  await pool.query(`CREATE TABLE IF NOT EXISTS trash (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    table_name TEXT NOT NULL,
    row_id INTEGER,
    label TEXT,
    payload JSONB NOT NULL,
    batch_id BIGINT,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE trash ADD COLUMN IF NOT EXISTS batch_id BIGINT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS trash_user_idx ON trash (user_id, deleted_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS trash_batch_idx ON trash (batch_id)`);

  await pool.query(`CREATE OR REPLACE FUNCTION brisa_trash_row() RETURNS trigger AS $$
  DECLARE
    j JSONB;
  BEGIN
    j := to_jsonb(OLD);
    -- Borrado en cascada: si la importación ya no existe, el movimiento se fue
    -- con ella (deshacer la importación no se ofrece) y no llena la papelera.
    IF TG_TABLE_NAME = 'transactions' THEN
      IF (j->>'import_id') IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM imports WHERE id = (j->>'import_id')::int) THEN
        RETURN OLD;
      END IF;
    END IF;
    INSERT INTO trash (user_id, table_name, row_id, label, payload, batch_id)
    VALUES (
      COALESCE((j->>'user_id')::int, 1),
      TG_TABLE_NAME,
      (j->>'id')::int,
      COALESCE(
        NULLIF(j->>'title', ''), NULLIF(j->>'name', ''), NULLIF(j->>'description', ''),
        NULLIF(j->>'raw_text', ''), NULLIF(j->>'content_text', ''), NULLIF(j->>'filename', '')
      ),
      j,
      txid_current()
    );
    RETURN OLD;
  END $$ LANGUAGE plpgsql`);

  for (const t of ['tasks', 'journal', 'ideas', 'events', 'reminders', 'people',
    'accounts', 'transactions', 'entries', 'shopping_items', 'habits', 'clips']) {
    await pool.query(`DROP TRIGGER IF EXISTS brisa_trash ON ${t}`);
    await pool.query(`CREATE TRIGGER brisa_trash BEFORE DELETE ON ${t} FOR EACH ROW EXECUTE FUNCTION brisa_trash_row()`);
  }

  // Do not let omitted user_id values silently fall back to Leonardo's account.
  // Every user-owned write goes through the authenticated request and supplies
  // its account explicitly; old rows are assigned to the original owner first.
  for (const t of ['people', 'tasks', 'journal', 'transactions', 'accounts', 'budgets',
    'readiness_items', 'habits', 'day_closures', 'day_misses', 'day_order',
    'day_close_snapshots', 'imports', 'event_checklist_templates', 'shopping_items',
    'entries', 'events', 'ideas', 'clips', 'reminders', 'push_subscriptions', 'trash']) {
    await pool.query(`UPDATE ${t} SET user_id = 1 WHERE user_id IS NULL`);
    await pool.query(`ALTER TABLE ${t} ALTER COLUMN user_id DROP DEFAULT`);
    await pool.query(`ALTER TABLE ${t} ALTER COLUMN user_id SET NOT NULL`);
  }

  console.log('All tables created successfully');
  await pool.end();
  process.exit(0);
} catch (e) {
  console.error('Setup error:', e.code || '', e.message || e);
  if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}
