import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';

const router = Router();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';
const ACCESS_KEY = process.env.BRISA_ACCESS_KEY || '';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('WARNING: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set. Google login disabled.');
}
if (!ACCESS_KEY) {
  console.warn('WARNING: BRISA_ACCESS_KEY not set. Solo se puede entrar con Google.');
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

function oauthStateCookieName(state) {
  return /^[a-f0-9]{32}$/.test(String(state || '')) ? `brisa_oauth_state_${state}` : null;
}

function getRequestCookie(req, name) {
  const prefix = `${name}=`;
  const part = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
  if (!part) return null;
  try { return decodeURIComponent(part.slice(prefix.length)); } catch { return null; }
}

function setOAuthStateCookie(req, res, state) {
  const name = oauthStateCookieName(state);
  if (!name) throw new Error('Invalid OAuth state format');
  res.cookie(name, state, {
    httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/api/auth/google/callback', maxAge: 10 * 60 * 1000,
  });
}

function clearOAuthStateCookie(req, res, state) {
  const name = oauthStateCookieName(state);
  if (!name) return;
  res.clearCookie(name, {
    httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/api/auth/google/callback',
  });
}

async function loadGoogleIdentity(idToken) {
  // Google's tokeninfo endpoint verifies the signature and returns the claims.
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw new Error('Google ID token validation failed');
  const claims = await response.json();
  if (claims.aud !== CLIENT_ID || !GOOGLE_ISSUERS.has(claims.iss) || claims.email_verified !== 'true' || Number(claims.exp) * 1000 <= Date.now()) {
    throw new Error('Invalid Google ID token claims');
  }
  return claims;
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
    const sessionResult = await pool.query(
      'SELECT user_id, expires_at FROM brisa_sessions WHERE token_hash = $1 AND expires_at > NOW()',
      [crypto.createHash('sha256').update(token).digest('hex')]
    );
    const s = sessionResult.rows[0];
    if (!s) return { user: null, expires: null };
    const u = await pool.query('SELECT * FROM users WHERE id = $1', [s.user_id]);
    return { user: u.rows[0] || null, expires: new Date(s.expires_at).getTime() };
  } catch {
    return { user: null, expires: null };
  }
}

/* Every /api route except /api/auth goes through here: the login gate
   stops being decorative. Without this, publishing Brisa on a public
   URL would expose everything to anyone who has the link. */
export async function requireAuth(req, res, next) {
  try {
    const { user } = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'No autorizado' });
    req.user = user;
    req.userId = Number(user.id);
    next();
  } catch {
    res.status(401).json({ error: 'No autorizado' });
  }
}

function readEnabledFeatures(user) {
  const value = user?.enabled_features;
  if (Array.isArray(value)) return value.filter(x => typeof x === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
    } catch { return []; }
  }
  return [];
}

export function requireFeature(feature) {
  return (req, res, next) => {
    if (!readEnabledFeatures(req.user).includes(feature)) {
      return res.status(404).json({ error: 'Función no disponible' });
    }
    next();
  };
}

/* La clave es la llave maestra del dueño: entra siempre al primer
   usuario creado (el que tiene los datos), no a un usuario nuevo. */
async function ownerUserId() {
  const existing = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
  if (existing.rows.length) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (google_email, name) VALUES ('local@brisa', 'Leonardo') RETURNING id`
  );
  return created.rows[0].id;
}

async function newSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await pool.query(
    'INSERT INTO brisa_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
    [tokenHash, userId]
  );
  await pool.query('DELETE FROM brisa_sessions WHERE expires_at <= NOW()');
  setSessionCookie(res, token);
}

// POST /api/auth/key → entrar con la clave de Brisa (sirve desde el celular)
router.post('/key', async (req, res) => {
  if (!ACCESS_KEY) return res.status(503).json({ error: 'Clave no configurada' });
  const given = Buffer.from(String(req.body?.key ?? '').trim());
  const expected = Buffer.from(ACCESS_KEY);
  const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!ok) return res.status(401).json({ error: 'Clave incorrecta' });
  try {
    const userId = await ownerUserId();
    const u = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    await newSession(res, userId);
    res.json({ ok: true, user: { id: userId, name: u.rows[0]?.name || 'Brisa' } });
  } catch (err) {
    console.error('Error en login por clave:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// GET /api/auth/google/login → redirect to Google
router.get('/google/login', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(503).json({ error: 'Google login not configured' });
  }
  const state = generateState();
  setOAuthStateCookie(req, res, state);
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

// GET /api/auth/google/callback → verify, create or load this user, set session
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: 'No code provided' });
  const stateCookieName = oauthStateCookieName(state);
  const stateCookie = stateCookieName ? getRequestCookie(req, stateCookieName) : null;
  const stateBuffer = Buffer.from(String(state || ''));
  const cookieBuffer = Buffer.from(stateCookie || '');
  if (!stateCookie || stateBuffer.length !== cookieBuffer.length || !crypto.timingSafeEqual(stateBuffer, cookieBuffer)) {
    clearOAuthStateCookie(req, res, state);
    return res.status(400).json({ error: 'Invalid OAuth state' });
  }
  clearOAuthStateCookie(req, res, state);

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
    const payload = await loadGoogleIdentity(idToken);

    const user = await upsertUser({
      googleEmail: payload.email,
      name: payload.name,
      avatar: payload.picture,
    });

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      'INSERT INTO brisa_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
      [tokenHash, user.id]
    );

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
    key_enabled: Boolean(ACCESS_KEY),
    google_enabled: Boolean(CLIENT_ID && CLIENT_SECRET),
    user: user ? {
      id: user.id,
      name: user.name || user.google_email,
      avatar: user.google_avatar,
      email: user.google_email,
      features: readEnabledFeatures(user),
    } : null,
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
      await pool.query('DELETE FROM brisa_sessions WHERE token_hash = $1', [crypto.createHash('sha256').update(token).digest('hex')]);
    } catch {
      // ignore
    }
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

export default router;
