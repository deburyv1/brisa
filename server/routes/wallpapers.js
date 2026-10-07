import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// GET /api/wallpapers — day backgrounds (night excluded, it's automatic)
router.get('/', async (req, res) => {
  try {
    const candidates = [
      path.join(__dirname, '..', 'public', 'aero-backgrounds'),
      path.join(__dirname, '..', '..', 'aero-backgrounds'),
    ];
    let files = [];
    for (const dir of candidates) {
      try {
        files = await fs.promises.readdir(dir);
        break;
      } catch {
        // try next candidate
      }
    }
    const list = files
      .filter(f => IMAGE_EXT.has(path.extname(f).toLowerCase()) && !f.toLowerCase().includes('night'))
      .sort()
      .map(f => ({ file: f, url: `aero-backgrounds/${f}` }));
    res.json(list);
  } catch (err) {
    console.error('Error listing wallpapers:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
