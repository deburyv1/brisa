import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:esunsecreto@localhost:5432/brisa';

const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
});

export default pool;
