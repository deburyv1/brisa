import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import peopleRouter from './routes/people.js';
import tasksRouter from './routes/tasks.js';
import spotifyRouter from './routes/spotify.js';
import journalRouter from './routes/journal.js';
import transactionsRouter from './routes/transactions.js';
import accountsRouter from './routes/accounts.js';
import importsRouter from './routes/imports.js';
import weatherRouter from './routes/weather.js';
import entriesRouter from './routes/entries.js';
import settingsRouter from './routes/settings.js';
import eventsRouter from './routes/events.js';
import ideasRouter from './routes/ideas.js';
import remindersRouter from './routes/reminders.js';
import budgetsRouter from './routes/budgets.js';
import shoppingRouter from './routes/shopping.js';
import readinessRouter from './routes/readiness.js';
import habitsRouter from './routes/habits.js';
import wallpapersRouter from './routes/wallpapers.js';
import aiRouter from './routes/ai.js';
import daysRouter from './routes/days.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Pasted photos travel as data URLs: allow them, they get
// downscaled client-side before storage (richtext.js)
app.use(express.json({ limit: "15mb" }));

// API routes
app.use('/api/people', peopleRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/journal', journalRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/imports', importsRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/shopping', shoppingRouter);
app.use('/api/readiness', readinessRouter);
app.use('/api/habits', habitsRouter);
app.use('/api/wallpapers', wallpapersRouter);
app.use('/api/ai', aiRouter);
app.use('/api/days', daysRouter);

// Serve static files (frontend)
// Docker: server/public | Local dev: repo root
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '..')));

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) res.sendFile(path.join(__dirname, '..', 'index.html'));
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
