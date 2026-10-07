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

  await pool.query(`CREATE TABLE IF NOT EXISTS readiness_state (
    day DATE NOT NULL,
    item_id INTEGER REFERENCES readiness_items(id) ON DELETE CASCADE,
    PRIMARY KEY (day, item_id)
  )`);

  await pool.query(`INSERT INTO readiness_items (user_id, label, position)
    SELECT 1, x.label, x.pos FROM (VALUES
      ('Ducha', 1),
      ('Cama hecha', 2),
      ('Almuerzo pensado', 3)
    ) AS x(label, pos)
    WHERE NOT EXISTS (SELECT 1 FROM readiness_items WHERE user_id = 1 AND label = x.label)`);

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
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS travel_minutes INTEGER`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE SET NULL`);

  await pool.query(`CREATE TABLE IF NOT EXISTS shopping_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    description VARCHAR(255) NOT NULL,
    estimated_amount NUMERIC(12,2),
    quantity INTEGER DEFAULT 1,
    category VARCHAR(50),
    is_purchased BOOLEAN DEFAULT FALSE,
    purchased_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status VARCHAR(10) DEFAULT 'posted'`);
  await pool.query(`ALTER TABLE people ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'local'`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)`);

  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);

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

  await pool.query(`CREATE TABLE IF NOT EXISTS ideas (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
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

  await pool.query(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value BYTEA,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

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

  // Backfill: link pre-history movements to a synthetic import record.
  // Idempotent: only touches transactions with import_id IS NULL.
  const orphans = await pool.query(
    `SELECT account_id, COUNT(*)::int AS count FROM transactions WHERE import_id IS NULL GROUP BY account_id`
  );
  for (const row of orphans.rows) {
    const imp = await pool.query(
      `INSERT INTO imports (user_id, account_id, filename, file_hash) VALUES (1, $1, 'carga anterior', 'backfill') RETURNING id`,
      [row.account_id]
    );
    await pool.query(
      `UPDATE transactions SET import_id = $1 WHERE import_id IS NULL AND account_id IS NOT DISTINCT FROM $2`,
      [imp.rows[0].id, row.account_id]
    );
    await pool.query(`UPDATE imports SET imported = $1 WHERE id = $2`, [row.count, imp.rows[0].id]);
  }

  console.log('All tables created successfully');
  await pool.end();
  process.exit(0);
} catch (e) {
  console.error('Setup error:', e.code || '', e.message || e);
  if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}
