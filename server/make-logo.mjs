/* ============================================
   BRISA - Logo sin fondo (una vez, o cuando cambie brisa.png)
   El fondo es un gradiente gris azulado liso, así que:
   1. modelo el fondo con una interpolación bilineal de las esquinas
   2. marca como frente lo saturado (la burbuja) y rellena huecos
      (los brillos blancos quedan dentro de la burbuja)
   3. alfa suavido + descontaminación de color en el borde
   Sale brisa-icon.png (512) y apple-touch-icon.png (180).
   Uso: node server/make-logo.mjs
   ============================================ */
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "brisa.png");

const img = sharp(SRC);
const meta = await img.metadata();
const W = meta.width, H = meta.height;

const { data } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// ---- 1. Color de fondo por esquina (promedio de un parche) ----
const P = Math.max(8, Math.floor(Math.min(W, H) * 0.03));
function corner(cx, cy) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = cy; y < cy + P; y++) {
    for (let x = cx; x < cx + P; x++) {
      const i = (y * W + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return [r / n, g / n, b / n];
}
const TL = corner(0, 0), TR = corner(W - P, 0), BL = corner(0, H - P), BR = corner(W - P, H - P);
function bgAt(x, y) {
  const u = x / (W - 1), v = y / (H - 1);
  const top = TL.map((c, k) => c + (TR[k] - c) * u);
  const bot = BL.map((c, k) => c + (BR[k] - c) * u);
  return top.map((c, k) => c + (bot[k] - c) * v);
}

// ---- 2. Máscara de frente: saturación (la burbuja) + relleno de huecos ----
const fg = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat > 42) fg[y * W + x] = 1;
  }
}
// Relleno de huecos: todo lo alcanzado desde el borde es fondo.
const reached = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) {
  stack.push([x, 0], [x, H - 1]);
}
for (let y = 0; y < H; y++) {
  stack.push([0, y], [W - 1, y]);
}
while (stack.length) {
  const [x, y] = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const k = y * W + x;
  if (reached[k] || fg[k]) continue;
  reached[k] = 1;
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}
for (let k = 0; k < W * H; k++) if (!fg[k] && !reached[k]) fg[k] = 1;

// ---- 3. Alfa suavizado (blur de la máscara) ----
const blurred = new Float32Array(W * H);
const SIGMA = 1.4;
const KR = Math.ceil(SIGMA * 3);
const kernel = Array.from({ length: KR * 2 + 1 }, (_, i) => {
  const d = i - KR;
  return Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
});
const ksum = kernel.reduce((a, b) => a + b, 0);
const tmp = new Float32Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = -KR; k <= KR; k++) {
      const xx = Math.min(W - 1, Math.max(0, x + k));
      s += fg[y * W + xx] * kernel[k + KR];
    }
    tmp[y * W + x] = s / ksum;
  }
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = -KR; k <= KR; k++) {
      const yy = Math.min(H - 1, Math.max(0, y + k));
      s += tmp[yy * W + x] * kernel[k + KR];
    }
    blurred[y * W + x] = s / ksum;
  }
}

// ---- 4. Descontaminación de color: quitarle el fondo al borde ----
const out = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const k = y * W + x;
    const i = k * 4;
    const a = Math.min(1, Math.max(0, blurred[k]));
    const [br, bgc, bb] = bgAt(x, y);
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (a > 0.02 && a < 0.98) {
      r = Math.min(255, Math.max(0, (r - (1 - a) * br) / a));
      g = Math.min(255, Math.max(0, (g - (1 - a) * bgc) / a));
      b = Math.min(255, Math.max(0, (b - (1 - a) * bb) / a));
    }
    out[i] = Math.round(r);
    out[i + 1] = Math.round(g);
    out[i + 2] = Math.round(b);
    out[i + 3] = Math.round(a * 255);
  }
}

const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toBuffer();
await fs.writeFile(path.join(ROOT, "brisa-icon.png"), png);

await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .resize(180, 180)
  .png({ compressionLevel: 9 })
  .toFile(path.join(ROOT, "apple-touch-icon.png"));

console.log(`brisa-icon.png (${W}x${H}) y apple-touch-icon.png (180x180) listos`);
