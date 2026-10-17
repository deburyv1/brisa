import pool from './db.js';
import { sendToAll, pushReady } from './routes/push.js';

/* Server-side notifier: runs even when no Brisa tab is open.
   Every minute it looks for reminders that came due and events
   starting soon, and pushes them to the phone. */

const TICK_MS = 60 * 1000;
const EVENT_LEAD_MIN = 15;

async function tick() {
  if (!pushReady()) return;
  try {
    const dueReminders = await pool.query(
      `SELECT id, title, description FROM reminders
       WHERE done = FALSE AND remind_at IS NOT NULL
         AND remind_at <= now() AND notified_at IS NULL
       ORDER BY remind_at ASC LIMIT 20`
    );
    for (const r of dueReminders.rows) {
      await sendToAll({
        title: 'Recordatorio',
        body: r.title,
        tag: 'rem-' + r.id,
        url: '/',
      });
      await pool.query('UPDATE reminders SET notified_at = now() WHERE id = $1', [r.id]);
    }

    const soonEvents = await pool.query(
      `SELECT id, title, "start" FROM events
       WHERE status = 'open' AND notified_at IS NULL
         AND "start" > now() AND "start" <= now() + ($1 || ' minutes')::interval
       LIMIT 20`,
      [EVENT_LEAD_MIN]
    );
    for (const e of soonEvents.rows) {
      await sendToAll({
        title: `En ${EVENT_LEAD_MIN} min`,
        body: e.title,
        tag: 'ev-' + e.id,
        url: '/',
      });
      await pool.query('UPDATE events SET notified_at = now() WHERE id = $1', [e.id]);
    }
  } catch (err) {
    console.error('Notificador: error en el tick:', err.message);
  }
}

export function startNotifier() {
  if (!pushReady()) {
    console.warn('Notificador en pausa: Web Push sin claves VAPID');
    return;
  }
  setInterval(tick, TICK_MS);
  setTimeout(tick, 8000);
  console.log(`Notificador de push activo (cada ${TICK_MS / 1000} s)`);
}
