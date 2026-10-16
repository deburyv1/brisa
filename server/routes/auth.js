import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';

const router = Router();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';
const SESSIONS_KEY = 'brisa.sessions';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('WARNING: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set. Google login disabled.');
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

async function getUserByGoogleEmail(email) {
  const r = await pool.query('SELECT * FROM users WHERE google_email = $1', [email]);
  return r.rows[0] || null;
}

async function upsertUser({ googleEmail, name, avatar }) {
  const r = await pool.query(
    `INSERT INTO users (google_email, name, google_avatar) VALUES ($1, $2, $3)
     ON CONFLICT (google_email) DO UPDATE SET name = $2, google_avatar = $3
     RETURNING *`,
    [googleEmail, name || null, avatar || null]
  );
  return r.rows[0];
}

function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', [
    `brisa_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${isProd ? '; Secure' : ''}`
  ]);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'brisa_session=; HttpOnly; Path=/; Max-Age=0');
}

async function getSessionUser(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)brisa_session=([^;]+)/);
  if (!match) return { user: null, expires: null };
  const token = decodeURIComponent(match[1]);
  try {
    const sessions = JSON.parse(await pool.query(
      `SELECT value FROM settings WHERE key = '${SESSIONS_KEY}'`
    ).then(r => r.rows[0]?.value?.toString() || '[]'));
    const s = sessions.find(s => s.token === token);
    if (!s || s.expires < Date.now()) return { user: null, expires: null };
    const u = await pool.query('SELECT * FROM users WHERE id = $1', [s.user_id]);
    return { user: u.rows[0] || null, expires: s.expires };
  } catch {
    return { user: null, expires: null };
  }
}

async function putSessions(sessions) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('${SESSIONS_KEY}', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
    [Buffer.from(JSON.stringify(sessions))]
  );
}

// GET /api/auth/google/login → redirect to Google
router.get('/google/login', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(503).json({ error: 'Google login not configured' });
  }
  const state = generateState();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/google/callback → verify, upsert user, set session
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: 'No code provided' });

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Token exchange failed');

    const idToken = tokenData.id_token;
    const parts = idToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    const user = await upsertUser({
      googleEmail: payload.email,
      name: payload.name,
      avatar: payload.picture,
    });

    const token = crypto.randomBytes(32).toString('base64url');
    const sessions = JSON.parse(await pool.query(
      `SELECT value FROM settings WHERE key = '${SESSIONS_KEY}'`
    ).then(r => r.rows[0]?.value?.toString() || '[]'));
    sessions.push({ token, user_id: user.id, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    await putSessions(sessions);

    setSessionCookie(res, token);
    res.redirect('/');
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// GET /api/auth/status → current session user or null
router.get('/status', async (req, res) => {
  const { user, expires } = await getSessionUser(req);
  res.json({
    authenticated: !!user,
    user: user ? { id: user.id, name: user.name || user.google_email, avatar: user.google_avatar, email: user.google_email } : null,
    expires: expires || null,
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)brisa_session=([^;]+)/);
  if (match) {
    const token = decodeURIComponent(match[1]);
    try {
      const sessions = JSON.parse(await pool.query(
        `SELECT value FROM settings WHERE key = '${SESSIONS_KEY}'`
      ).then(r => r.rows[0]?.value?.toString() || '[]'));
      await putSessions(sessions.filter(s => s.token !== token));
    } catch {
      // ignore
    }
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

export default router;
