/* ============================================
   BRISA - Shopping card
   Foto local del producto y lugares de compra
   en Santiago (OpenStreetMap vía Overpass).
   Sin claves ni scraping de Google: fuentes
   gratuitas (DuckDuckGo, Wikimedia Commons y
   OpenFoodFacts para lo comestible). Las fotos
   se descargan, se achican y viven en
   shopping-photos/: nunca hotlink, siempre local.
   ============================================ */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pool from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTO_DIR = path.join(__dirname, "..", "shopping-photos");
const PHOTO_BASE = "/shopping-photos";
const UA = "Mozilla/5.0 (brisa personal dashboard)";
const MAX_REMOTE_BYTES = 5_000_000;

fs.mkdir(PHOTO_DIR, { recursive: true }).catch(() => {});

// Cada búsqueda deja hasta 4 fotos por item: al arrancar se borran
// las que ninguna tarjeta referencia (las viejas de búsquedas anteriores).
async function prunePhotos() {
  try {
    const { rows } = await pool.query(`SELECT card FROM shopping_items`);
    const keep = new Set();
    for (const r of rows) {
      const c = r.card || {};
      if (typeof c.photo === "string") keep.add(c.photo);
      for (const p of c.pool || []) keep.add(p);
    }
    const files = await fs.readdir(PHOTO_DIR);
    for (const f of files) {
      if (!keep.has(`${PHOTO_BASE}/${f}`)) {
        await fs.unlink(path.join(PHOTO_DIR, f)).catch(() => {});
      }
    }
  } catch (e) {
    console.warn("Limpieza de fotos:", e?.message || e);
  }
}
prunePhotos();

// ---- Descarga + downscale a un JPEG chico y liviano ----
async function toLocal(url, itemId) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200 || buf.length > MAX_REMOTE_BYTES) return null;
    const out = await sharp(buf)
      .flatten({ background: "#ffffff" })
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
    const mine = (await fs.readdir(PHOTO_DIR).catch(() => []))
      .filter(f => f.startsWith(`${itemId}-`)).length;
    const name = `${itemId}-${mine + 1}.jpg`;
    await fs.writeFile(path.join(PHOTO_DIR, name), out);
    return `${PHOTO_BASE}/${name}`;
  } catch (e) {
    console.warn("Foto descartada:", url, e?.message || e);
    return null;
  }
}

function cleanQuery(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/^(comprar|compra|necesito|necesitamos)\s+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 5)
    .join(" ") || "producto";
}

async function fromDuckDuckGo(q) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    const j = await res.json();
    const out = [];
    if (typeof j?.Image === "string" && /^https?:\/\//.test(j.Image)) out.push(j.Image);
    for (const rt of j?.RelatedTopics || []) {
      const u = rt?.Icon?.URL;
      if (typeof u === "string" && /^https?:\/\//.test(u)) out.push(u);
      if (out.length >= 2) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function fromCommons(q) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=4&prop=imageinfo&iiprop=url&iiurlwidth=480`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    const j = await res.json();
    return Object.values(j?.query?.pages || {})
      .map(p => p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url)
      .filter(u => typeof u === "string" && /^https?:\/\//.test(u))
      .slice(0, 4);
  } catch {
    return [];
  }
}

async function fromOpenFoodFacts(q) {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=2&fields=image_front_small_url`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    const j = await res.json();
    return (j?.products || [])
      .map(p => p?.image_front_small_url)
      .filter(u => typeof u === "string" && /^https?:\/\//.test(u))
      .slice(0, 2);
  } catch {
    return [];
  }
}

// Fotos de ejemplo para el item: paths locales listos para <img>.
export async function searchPhotos(itemId, text) {
  const q = cleanQuery(text);
  const found = [];
  for (const list of [await fromDuckDuckGo(q), await fromCommons(q), await fromOpenFoodFacts(q)]) {
    for (const u of list) {
      if (!found.includes(u)) found.push(u);
    }
  }
  const local = [];
  for (const u of found.slice(0, 4)) {
    const p = await toLocal(u, itemId);
    if (p) local.push(p);
  }
  return local;
}

// ---- Dónde comprar en Santiago ----
const SHOP_HINTS = [
  [["ferreter", "clavo", "tornillo", "malla", "cerradura", "llave", "herramienta", "pintura", "taladro",
    "martillo", "cable", "enchufe", "constru", "gasfiter", "sanitario", "desague", "desagüe", "tuberia",
    "tubería", "cocina", "lavaplatos", "estufa", "calefon", "calefón", "termo", "ducha", "inodoro",
    "lavamanos", "griferia", "grifería", "manguera", "bomba"], ["hardware", "doityourself"]],
  [["lampara", "lámpara", "mesa", "silla", "mueble", "sofa", "sofá", "cama", "cortina", "alfombra",
    "espejo", "estanteria", "estantería", "sillon", "sillón", "puf", "textil", "colchon", "colchón",
    "almohada", "sabana", "sábana", "manta", "velador", "librero", "escritorio", "madera"], ["furniture", "houseware"]],
  [["televisor", "tele", "celular", "cargador", "audifono", "audífono", "auricular", "control remoto",
    "electronico", "electrónico", "computador", "impresora", "laptop", "parlante", "microondas",
    "licuadora", "cafetera", "tostador", "refrigerador"], ["electronics", "appliance"]],
  [["comida", "bebida", "pan", "leche", "huevo", "fruta", "verdura", "carne", "pescado", "arroz",
    "fideo", "pasta", "sopa", "azucar", "azúcar", "sal", "cafe", "café", "aceite", "snack", "galleta",
    "jugo", "cerveza", "vino", "agua", "papas", "pollo", "harina", "mermelada", "atun", "atún",
    "conserva", "congelado", "queso", "mantequilla"], ["supermarket", "convenience"]],
  [["mochila", "cartera", "zapato", "zapatilla", "chaqueta", "polera", "poleron", "polerón", "pantalon",
    "pantalón", "camisa", "vestido", "calcetin", "calcetín", "toalla", "cobija", "termo", "botella"], ["department_store", "mall", "clothes"]],
  [["papel", "lapiz", "lápiz", "cuaderno", "boligrafo", "bolígrafo", "tijera", "pegamento", "cola",
    "cartulina", "block", "carpeta", "lapicera"], ["stationery", "department_store"]],
  [["shampoo", "jabon", "jabón", "pasta dental", "cepillo", "desodorante", "toalla higienica",
    "papel higienico", "pañuelo", "pañuelo", "crema", "maquillaje"], ["chemist", "beauty", "pharmacy"]],
  [["planta", "macota", "tierra", "semilla", "pala", "jardineria", "jardinería", "macetero", "flor"], ["garden_center", "garden"]],
  [["neumatico", "neumático", "aceite de motor", "bateria", "batería", "parabrisas", "escobilla",
    "limpiaparabrisas", "auto", "moto"], ["car_parts", "car_repair"]],
];

function shopTypesFor(text) {
  const t = String(text || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const types = new Set();
  for (const [words, shops] of SHOP_HINTS) {
    if (words.some(w => t.includes(w))) shops.forEach(s => types.add(s));
  }
  return types.size ? [...types] : ["department_store", "mall"];
}

// Santiago y alrededores
const STAGUE_BOX = [-33.65, -70.95, -33.30, -70.50];

// Respaldo si Overpass no responde (está inestable según la red): cadenas
// reales de Santiago por rubro. El usuario siempre ve algo útil.
const FALLBACK_PLACES = {
  hardware: ["Sodimac", "Easy", "Homecenter", "Abcdin", "Ferretería San Pedro", "Construmart"],
  doityourself: ["Sodimac", "Easy", "Homecenter", "Abcdin"],
  furniture: ["Falabella", "Paris", "Ripley", "La Polar", "Homy", "Mueblería Casa Nueva"],
  houseware: ["Falabella", "Paris", "Ripley", "La Polar", "Sodimac", "Easy"],
  electronics: ["Falabella", "Paris", "Ripley", "La Polar", "PC Factory", "Abcdin"],
  appliance: ["Falabella", "Paris", "Ripley", "La Polar", "Abcdin", "Sodimac"],
  supermarket: ["Jumbo", "Tottus", "Líder", "Santa Isabel", "Unimarc", "Mayorista 10"],
  convenience: ["Unimarc", "Santa Isabel", "Líder", "Tottus", "Jumbo", "Lo Valledor (feria)"],
  mall: ["Parque Arauco", "Alto Las Condes", "Costanera Center", "Mall Plaza", "Falabella", "Paris"],
  department_store: ["Falabella", "Paris", "Ripley", "La Polar", "Sodimac", "Easy"],
  clothes: ["Falabella", "Paris", "Ripley", "La Polar", "H&M", "Basement"],
  stationery: ["Librería Inglesa", "Artel", "Falabella (librería)", "Sodimac", "Easy"],
  chemist: ["Farmacias Ahumada", "Cruz Verde", "SalcoBrand", "Maicao"],
  beauty: ["Maicao", "Falabella belleza", "Sephora (Parque Arauco)", "Ripley belleza"],
  pharmacy: ["Farmacias Ahumada", "Cruz Verde", "SalcoBrand"],
  garden_center: ["Sodimac", "Easy", "Vivero Primavera", "Vivero Los Olivos"],
  garden: ["Sodimac", "Easy", "Vivero Primavera", "Homecenter"],
  car_parts: ["Sodimac", "Easy", "Autorepuestos Kallfurura", "Neumáticos Pirelli (Lo Ovalle)"],
  car_repair: ["Chevrolet Servicio (Vitacura)", "Auto Repuestos Delta", "Sodimac", "Easy"],
};

export async function searchPlaces(text) {
  const types = shopTypesFor(text);
  const rx = types.join("|");
  const bbox = STAGUE_BOX.join(",");
  const q = `[out:json][timeout:25];(node["shop"~"${rx}"](${bbox});way["shop"~"${rx}"](${bbox}););out tags 18;`;
  const endpoints = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "brisa-dashboard/1.0 (contact: leonardo.carvajal.d@gmail.com)",
        },
        body: `data=${encodeURIComponent(q)}`,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const j = await res.json();
      const names = new Set();
      for (const el of j.elements || []) {
        const n = el?.tags?.name?.trim();
        if (n && n.length >= 3 && !/^\d+$/.test(n)) names.add(n);
      }
      if (names.size) return [...names].slice(0, 6);
    } catch (e) {
      console.warn("Overpass falló en", url, e?.message || e);
    }
  }
  // Red inestable o sin resultado: las cadenas del rubro, que nunca fallan.
  const base = types.flatMap(t => FALLBACK_PLACES[t] || []);
  return [...new Set(base)].slice(0, 6);
}
