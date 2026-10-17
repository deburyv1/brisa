import { Router } from 'express';
import pool from '../db.js';

const router = Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || "http://localhost:3000/api/spotify/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn("WARNING: SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set. Spotify login disabled.");
}

function generateState() {
  return require('crypto').randomBytes(16).toString('hex');
}

router.get('/login', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(503).json({ error: 'Spotify not configured' });
  }
  const state = generateState();
  const scope = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state: state,
    scope: scope,
    show_dialog: true
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'No code provided' });

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Token exchange failed');

    const userRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    const userData = await userRes.json();

    await pool.query(
      `INSERT INTO spotify_tokens (user_id, access_token, refresh_token, expires_at, spotify_user_id, spotify_email)
       VALUES (${req.userId}, $1, $2, NOW() + INTERVAL '1 hour', $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET access_token = $1, refresh_token = $2, expires_at = NOW() + INTERVAL '1 hour'`,
      [tokenData.access_token, tokenData.refresh_token, userData.id, userData.email]
    );

    res.redirect('/');
  } catch (err) {
    console.error('Spotify callback error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const result = await pool.query(`SELECT access_token, expires_at FROM spotify_tokens WHERE user_id = ${req.userId}`);
    if (result.rows.length === 0) return res.json({ authenticated: false });
    const isExpired = new Date(result.rows[0].expires_at) < new Date();
    res.json({ authenticated: !isExpired });
  } catch (err) {
    res.json({ authenticated: false });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const result = await pool.query(`SELECT refresh_token FROM spotify_tokens WHERE user_id = ${req.userId}`);
    if (result.rows.length === 0) return res.status(401).json({ error: 'No refresh token' });

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: result.rows[0].refresh_token })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Token refresh failed');

    await pool.query(
      `UPDATE spotify_tokens SET access_token = $1, expires_at = NOW() + INTERVAL '1 hour' WHERE user_id = ${req.userId}`,
      [tokenData.access_token]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

export default router;
