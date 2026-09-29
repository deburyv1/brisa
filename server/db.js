import pg from 'pg';

// Return DATE columns as 'YYYY-MM-DD' strings instead of JS Dates.
// Otherwise midnight-UTC shifts them a day back in UTC-4 (Chile).
pg.types.setTypeParser(1082, (val) => val);

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:esunsecreto@localhost:5432/brisa';

const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
});

export default pool;
