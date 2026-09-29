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

  console.log('All tables created successfully');
  await pool.end();
  process.exit(0);
} catch (e) {
  console.error('Setup error:', e.code || '', e.message || e);
  if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}
