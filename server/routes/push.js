import { Router } from 'express';
import webpush from 'web-push';
import pool from '../db.js';

const router = Router();

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:brisa@localhost';
const ready = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (ready) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
} else {
  console.warn('Web Push apagado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en server/.env');
}

export function pushReady() {
  return ready;
}

/* Send a notification to every device of ONE user. Drops dead
   subscriptions (404/410) so the list stays clean. */
export async function sendToUser(userId, payload) {
  if (!ready) return { sent: 0, failed: 0, total: 0, reason: 'sin-claves' };
  const subs = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
  let sent = 0;
  let failed = 0;
  for (const s of subs.rows) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
      } else {
        console.error('Push error', err.statusCode || '', err.message);
      }
    }
  }
  return { sent, failed, total: subs.rowCount };
}

// Public key for the client to subscribe with.
router.get('/key', (req, res) => {
  res.json({ publicKey: PUBLIC_KEY, enabled: ready });
});

router.get('/status', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT COUNT(*)::int AS devices FROM push_subscriptions WHERE user_id = $1',
      [req.userId]
    );
    res.json({ enabled: ready, devices: r.rows[0].devices });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }
  try {
    // Re-subscribing moves the device to the current user.
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.userId, endpoint, keys.p256dh, keys.auth]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Error guardando suscripción:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'Falta endpoint' });
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Prove the channel works end to end (only this user's devices).
router.post('/test', async (req, res) => {
  try {
    const result = await sendToUser(req.userId, {
      title: 'brisa',
      body: 'Avisos activados. Te aviso cuando algo se acerque.',
      tag: 'brisa-test',
      url: '/',
    });
    res.json(result);
  } catch (err) {
    console.error('Error enviando prueba:', err);
    res.status(500).json({ error: 'Push error' });
  }
});

export default router;
