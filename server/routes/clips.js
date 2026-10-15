import { Router } from 'express';
import pool from '../db.js';
import fs from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

const router = Router();

const MUSIC_IN = '/music-in';
const CLIPS_DIR = '/app/clips';
if (!existsSync(CLIPS_DIR)) mkdirSync(CLIPS_DIR, { recursive: true });

const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac']);

function baseTitle(file) {
  return path.basename(file, path.extname(file));
}

function safeName(file) {
  const base = path.basename(file).replace(/[^\wáéíóúñüÁÉÍÓÚÑÜ .()-]/gi, '_');
  return `${Date.now()}-${base}`;
}

// GET /api/clips — library
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clips ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching clips:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/clips/scan — audio files in the watched folder not yet imported
router.get('/scan', async (req, res) => {
  try {
    if (!existsSync(MUSIC_IN)) return res.json({ watched: false, files: [] });
    const entries = await fs.readdir(MUSIC_IN, { withFileTypes: true });
    const audio = entries
      .filter(e => e.isFile() && AUDIO_EXT.has(path.extname(e.name).toLowerCase()))
      .map(e => e.name)
      .sort();
    const imported = await pool.query('SELECT source_path FROM clips');
    const known = new Set(imported.rows.map(r => r.source_path));
    res.json({
      watched: true,
      files: audio
        .filter(f => !known.has(path.join(MUSIC_IN, f)))
        .map(f => ({ name: f, title: baseTitle(f) })),
    });
  } catch (err) {
    console.error('Error scanning clips:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/clips/import { name } — copy into Brisa, register row
router.post('/import', async (req, res) => {
  const { name } = req.body;
  if (!name || String(name).includes('/') || String(name).includes('\\')) {
    return res.status(400).json({ error: 'Invalid name' });
  }
  try {
    const src = path.join(MUSIC_IN, String(name));
    await fs.access(src);
    const filename = safeName(String(name));
    await fs.copyFile(src, path.join(CLIPS_DIR, filename));
    const result = await pool.query(
      'INSERT INTO clips (user_id, title, filename, source_path) VALUES (1, $1, $2, $3) RETURNING *',
      [baseTitle(String(name)), filename, src]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error importing clip:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/clips/:id/audio — stream the stored copy
router.get('/:id/audio', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clips WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Clip not found' });
    const file = path.join(CLIPS_DIR, path.basename(result.rows[0].filename));
    if (!existsSync(file)) return res.status(404).json({ error: 'File missing' });
    res.sendFile(file);
  } catch (err) {
    console.error('Error streaming clip:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/clips/:id — row + stored copy
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clips WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Clip not found' });
    await pool.query('DELETE FROM clips WHERE id = $1', [req.params.id]);
    try {
      await fs.unlink(path.join(CLIPS_DIR, path.basename(result.rows[0].filename)));
    } catch {
      // file already gone: row deletion is what matters
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting clip:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
