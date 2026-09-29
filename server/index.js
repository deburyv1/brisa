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
import weatherRouter from './routes/weather.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/people', peopleRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/journal', journalRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/weather', weatherRouter);

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
