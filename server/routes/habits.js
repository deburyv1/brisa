import { Router } from 'express';
import pool from '../db.js';

const router = Router();

function mondayOf(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Due on a given date? freq_type 'daily' (default) = every day;
// 'custom' = only the JS weekdays in freq_days (0=dom … 6=sáb).
function isDue(freqType, freqDays, anchor) {
  if (freqType !== 'custom' || !Array.isArray(freqDays) || freqDays.length === 0) return true;
  const dow = new Date(anchor + 'T12:00:00').getDay();
  return freqDays.map(Number).includes(dow);
}

// GET /api/habits?date=YYYY-MM-DD — habits with done state + neutral week
router.get('/', async (req, res) => {
  try {
    const anchor = req.query.date || dateKey(new Date());
    const habits = await pool.query(
      'SELECT * FROM habits WHERE user_id = 1 AND active = TRUE ORDER BY position ASC, id ASC'
    );
    const monday = mondayOf(anchor);
    const weekKeys = [...Array(7)].map((_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return dateKey(d);
    });
    const done = await pool.query(
      'SELECT habit_id, day FROM habit_completions WHERE habit_id = ANY($1) AND day = ANY($2)',
      [habits.rows.map(h => h.id), weekKeys]
    );
    const doneSet = new Set(done.rows.map(r => `${r.habit_id}|${String(r.day).slice(0, 10)}`));
    res.json(habits.rows.map(h => ({
      ...h,
      done_today: doneSet.has(`${h.id}|${anchor}`),
      due_today: isDue(h.freq_type, h.freq_days, anchor),
      week: weekKeys.map(k => doneSet.has(`${h.id}|${k}`)),
    })));
  } catch (err) {
    console.error('Error fetching habits:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/habits
router.post('/', async (req, res) => {
  const { name, description, icon } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO habits (user_id, name, description, icon) VALUES (1, $1, $2, $3) RETURNING *',
      [name.trim().slice(0, 100), description?.trim() || null, icon?.trim().slice(0, 16) || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating habit:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/habits/:id
router.put('/:id', async (req, res) => {
  const { name, description, icon, active, freq_type, freq_days } = req.body;
  const days = Array.isArray(freq_days)
    ? freq_days.map(Number).filter(n => n >= 0 && n <= 6)
    : null;
  try {
    const result = await pool.query(
      `UPDATE habits SET name = COALESCE($1, name), description = $2, icon = $3,
        active = COALESCE($4, active),
        freq_type = COALESCE($5, freq_type),
        freq_days = COALESCE($6, freq_days)
        WHERE id = $7 AND user_id = 1 RETURNING *`,
      [name?.trim() || null, description?.trim() || null, icon?.trim().slice(0, 16) || null,
       active == null ? null : !!active,
       freq_type === 'daily' || freq_type === 'custom' ? freq_type : null,
       days, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Habit not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating habit:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/habits/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM habits WHERE id = $1 AND user_id = 1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting habit:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/habits/:id/check {done, date?} — marks today (or given day);
// completing auto-checks linked readiness conditions (manual state wins)
router.post('/:id/check', async (req, res) => {
  const done = !!req.body.done;
  const day = req.body.date || dateKey(new Date());
  try {
    if (done) {
      await pool.query(
        'INSERT INTO habit_completions (habit_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.id, day]
      );
      await pool.query(
        `INSERT INTO readiness_state (day, item_id)
         SELECT $2, id FROM readiness_items
         WHERE source_type = 'habit' AND source_id = $1
         ON CONFLICT DO NOTHING`,
        [req.params.id, day]
      ).catch(e => console.error('Error syncing readiness:', e));
    } else {
      await pool.query('DELETE FROM habit_completions WHERE habit_id = $1 AND day = $2', [req.params.id, day]);
    }
    res.json({ success: true, done });
  } catch (err) {
    console.error('Error toggling habit:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
