/* ============================================
   BRISA - Rocket League clips
   Lista los clips de gameplay (video) y la música
   de fondo, los reproduce en el navegador y
   los exporta a una carpeta para Shotcut.
   ============================================ */
import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { existsSync, mkdirSync } from "fs";

const router = Router();

const CLIPS_DIR = "/clips-rl";
const OUT_DIR = "/clips-rl-out";
const VIDEO_EXT = new Set([".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac"]);

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function safeName(name) {
  return String(name || "").replace(/[^\w.\-() ]/g, "_").slice(0, 120);
}

function validName(name) {
  if (!name || typeof name !== "string") return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  return true;
}

async function listDir(dir, exts) {
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!exts.has(ext)) continue;
    const full = path.join(dir, e.name);
    const st = await fs.stat(full).catch(() => null);
    out.push({ name: e.name, ext, size: st?.size || 0 });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// GET /api/rlclips — lista videos + música
router.get("/", async (req, res) => {
  try {
    const videos = await listDir(CLIPS_DIR, VIDEO_EXT);
    const music = await listDir(CLIPS_DIR, AUDIO_EXT);
    // También música del folder de música si existe
    const musicIn = await listDir("/music-in", AUDIO_EXT);
    const allMusic = [...music, ...musicIn].filter((m, i, arr) =>
      arr.findIndex(x => x.name === m.name) === i);
    res.json({ watched: existsSync(CLIPS_DIR), videos, music: allMusic });
  } catch (err) {
    console.error("Error listando clips RL:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// GET /api/rlclips/stream?name=...&type=video|music — stream con range
router.get("/stream", async (req, res) => {
  const name = String(req.query.name || "");
  const type = String(req.query.type || "video");
  if (!validName(name)) return res.status(400).json({ error: "Invalid name" });
  const ext = path.extname(name).toLowerCase();
  const allowed = type === "music" ? AUDIO_EXT : VIDEO_EXT;
  if (!allowed.has(ext)) return res.status(400).json({ error: "Invalid type" });
  // Buscar en clips-rl y music-in
  let file = path.join(CLIPS_DIR, name);
  if (!existsSync(file)) file = path.join("/music-in", name);
  if (!existsSync(file)) return res.status(404).json({ error: "File not found" });
  res.sendFile(file);
});

// POST /api/rlclips/export — copia los clips + música a una carpeta de proyecto
router.post("/export", async (req, res) => {
  const { clips, music } = req.body || {};
  if (!Array.isArray(clips)) return res.status(400).json({ error: "clips must be an array" });
  const safeClips = clips.filter(validName);
  const safeMusic = (music && validName(music)) ? music : null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const folder = path.join(OUT_DIR, stamp);
  mkdirSync(folder, { recursive: true });
  const copied = [];
  for (const name of safeClips) {
    const ext = path.extname(name).toLowerCase();
    if (!VIDEO_EXT.has(ext)) continue;
    let src = path.join(CLIPS_DIR, name);
    if (!existsSync(src)) continue;
    const dest = path.join(folder, safeName(name));
    await fs.copyFile(src, dest);
    copied.push(path.basename(dest));
  }
  if (safeMusic) {
    const ext = path.extname(safeMusic).toLowerCase();
    if (AUDIO_EXT.has(ext)) {
      let src = path.join(CLIPS_DIR, safeMusic);
      if (!existsSync(src)) src = path.join("/music-in", safeMusic);
      if (existsSync(src)) {
        const dest = path.join(folder, safeName(safeMusic));
        await fs.copyFile(src, dest);
        copied.push(path.basename(dest));
      }
    }
  }
  res.json({ folder: `/clips-rl-out/${stamp}`, files: copied });
});

export default router;