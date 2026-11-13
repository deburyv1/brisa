/* ============================================
   BRISA - Shopping card
   Foto local del producto y lugares de compra
   en Santiago (OpenStreetMap vía Overpass).
   Sin claves ni scraping de Google: fuentes
   gratuitas (Wikimedia Commons, OpenFoodFacts
   para lo comestible y Openverse). Nada de
   confiar a ciegas: candidato con metadatos
   sanos (tamaño, aspecto, sin iconos ni
   documentos) y descarga verificada antes de
   guardarla. Las fotos se descargan, se
   achican y viven en shopping-photos/: nunca
   hotlink, siempre local. Si no hay nada
   bueno, no se muestra foto.
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
// La descarga también se verifica: un mini-icono o un documento
// escaneado pueden colarse en los metadatos, así que el archivo
// real tiene que pasar los mismos filtros antes de guardarse.
async function toLocal(url, itemId) {
  try {
    if (/\.svg(\?|#|$)/i.test(url)) return null;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200 || buf.length > MAX_REMOTE_BYTES) return null;
    const meta = await sharp(buf).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (!w || !h) return null;
    const minSide = Math.min(w, h);
    const aspect = Math.max(w, h) / minSide;
    if (minSide < 300 || aspect > 2.2 || (meta.pages || 1) > 1) return null;
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

// Palabras sin objeto propio ("regalo aniversario javi"): si la frase
// completa no rinde nada, se busca solo el sustantivo concreto.
const STOPWORDS = new Set([
  "comprar", "compra", "necesito", "necesitamos", "quiero", "busco", "para", "por",
  "con", "sin", "los", "las", "del", "que", "este", "esta", "nuevo", "nueva",
  "bueno", "buena", "mio", "favor", "favorito",
]);

function fallbackQuery(text) {
  const words = cleanQuery(text).split(" ")
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));
  return words[0] || "";
}

// Los títulos de las fotos suelen estar en inglés (Commons) o en otro
// idioma: "cortina" también vive en "curtain". Sin esta puente, una
// búsqueda en español no encuentra nada con sentido.
const EN_WORDS = {
  lampara: ["lamp"], luz: ["light"], mesa: ["table"], silla: ["chair"], cortina: ["curtain"],
  rallador: ["grater"], taper: ["container", "tupper"], contenedor: ["container"],
  malla: ["net", "mesh"], ducha: ["shower"], grifo: ["tap", "faucet"],
  toalla: ["towel"], sabana: ["sheet"], colchon: ["mattress"], almohada: ["pillow"],
  cama: ["bed"], sofa: ["sofa"], espejo: ["mirror"], alfombra: ["carpet", "rug"],
  computador: ["computer"], celular: ["phone"], auricular: ["headphone"], cargador: ["charger"],
  regalo: ["gift"], mochila: ["backpack"], cartera: ["wallet"], zapato: ["shoe"],
  camisa: ["shirt"], vestido: ["dress"], lapiz: ["pencil"], cuaderno: ["notebook"],
  jabon: ["soap"], planta: ["plant"], maceta: ["planter"], botella: ["bottle"],
  libro: ["book"], reloj: ["clock", "watch"], microondas: ["microwave"],
  refrigerador: ["refrigerator", "fridge"], nevera: ["fridge"], cafetera: ["coffee"],
  tostador: ["toaster"], licuadora: ["blender"], televisor: ["television"],
  tijera: ["scissors"], pegamento: ["glue"], papel: ["paper"], cortinas: ["curtain"],
  tapers: ["container", "tupper"], persiana: ["blind"], cortinado: ["curtain"],
  mallas: ["net", "mesh"], lavaplatos: ["dishwasher", "sink"], fregadero: ["sink"],
  desague: ["strainer", "drain", "grate"], bombilla: ["bulb"], velador: ["lamp"], aplique: ["light"],
};

function expandWords(qWords) {
  const set = new Set(qWords.filter(w => w.length >= 4));
  for (const w of qWords) {
    for (const en of EN_WORDS[w] || []) set.add(en);
  }
  return [...set];
}

// Los sinónimos en inglés también se BUSCAN, no solo se puntuan: los
// títulos de las fotos de Commons viven en inglés ("curtain" encuentra
// cortinas de verdad; "cortina" encuentra un auto Lotus y un barco).
// Van primero los términos más específicos del producto.
function buildQueries(text) {
  const q = cleanQuery(text);
  const qWords = q.split(" ");
  const alt = fallbackQuery(text);
  const enBySource = [];
  for (const w of qWords) {
    for (const en of EN_WORDS[w] || []) enBySource.push({ en, len: w.length });
  }
  enBySource.sort((a, b) => b.len - a.len);
  const enWords = [...new Set(enBySource.map(x => x.en))];
  return [...new Set([q, alt, ...enWords].filter(Boolean))].slice(0, 4);
}

// Comestible solo entonces OpenFoodFacts: buscar "lámpara" ahí
// devuelve alimentos al azar.
const FOOD_WORDS = [
  "comida", "bebida", "pan", "leche", "huevo", "fruta", "verdura", "carne", "pescado",
  "arroz", "fideo", "pasta", "sopa", "azucar", "cafe", "aceite", "snack", "galleta",
  "jugo", "cerveza", "vino", "agua", "papas", "pollo", "harina", "mermelada", "atun",
  "conserva", "congelado", "queso", "mantequilla", "yogurt", "chocolate", "cereal",
  "jamon", "helado", "salsa", "postre", "dulce", "té", "infusion",
];

function isFoodish(q) {
  return FOOD_WORDS.some(w => q.includes(w));
}

// Nada de iconos de sitios, mapas, diagramas ni documentos escaneados:
// son la fuente de las fotos "que no tienen nada que ver".
const JUNK_RX = /(logo|icon|icono|mapa|map |diagram|esquema|schema|screenshot|captura de pantalla|scan |escaneo|documento|document |letter|carta |página|pagina|page |sello|seal |bandera|flag |escudo|coat of arms|fuente|font |banner|afiche|poster|clipart)/i;
const ART_RX = /(painting|pintura|drawing|dibujo|sketch|boceto|illustration|ilustraci|artwork)/i;
// Homónimos: un barco llamado "Regalo", la familia "Mallas", el auto
// "Lotus Cortina", la red de pesca "Lampara net". El título solo miente;
// las categorías de Commons cuentan de qué va la foto de verdad.
const WRONG_SENSE_RX = /\b(ships?|vessels?|boats?|sailing|steamships?|fishing|fishnets?|nets?|candles?|velas?|cottages?|cabañas?|furnaces?|furnace|boilers?|stokers?|incinerators?|locomotives?|railways?|railroads?|trains?|stations?|metro|battles?|warships?|military|army|navy|aircraft|airplanes?|airports?|automobiles?|cars?|racing|shipping|cargo|freight|portraits?|people|persons?|funerals?|deaths?|aerial|landscapes?|localities|locality|hamlets?|settlements?|estaciones?|estación|barcos?|buques?|trenes?|ferrocarril|guerra|aviones?)\b|\bENI \d{4}/i;
// Categorías con dos o más palabras en mayúscula: "John Cortinas" (una
// persona), "Lotus Cortina MkI" (un auto). El nombre de un barco o de
// una familia no es el producto que estoy buscando.
const PERSON_CAT_RX = /^[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑ]+)+$/;
// "(Lisbon)", "Malla (India)", "Container (PSF)": un paréntesis con
// nombre propio es una referencia a un lugar o persona, no al objeto
// de la foto. Vale para categorías y también para el título.
const PAREN_PLACE_RX = /\([A-ZÁÉÍÓÚÑ][^)]*\)/;
// "Drain, Oregon": "Ciudad, País" en cualquier parte del título o las
// categorías es el pueblo homónimo, no el producto que busco.
const PLACE_RX = /[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑ]+,\s*[A-ZÁÉÍÓÚÑ]/;

// Filtra y ordena candidatos con metadatos. Sin ninguna palabra de lo
// pedido en el título, la foto no sirve (ese era el "cortinas" que
// devolvía un templo): mejor sin foto. El tamaño y el aspecto solo
// ordenan entre las que sí tienen relación.
function scoreCandidate(cand, matchWords) {
  const text = `${cand.title || ""} ${cand.cats || ""}`.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, " ");
  if (JUNK_RX.test(text) || WRONG_SENSE_RX.test(text)) return -1;
  if (PAREN_PLACE_RX.test(cand.title || "") || PLACE_RX.test(cand.title || "")) return -1;
  let overlap = 0;
  for (const w of matchWords) {
    if (w.length >= 4 && text.includes(w)) overlap++;
  }
  if (!overlap) return -1;
  if (ART_RX.test(text)) return -1;
  for (const cat of String(cand.cats || "").split("|")) {
    const t = cat.trim();
    if (PERSON_CAT_RX.test(t) || PAREN_PLACE_RX.test(t) || PLACE_RX.test(t)) return -1;
  }
  let score = Math.min(overlap * 2, 6);
  const w = cand.w || 0;
  const h = cand.h || 0;
  if (w && h) {
    const minSide = Math.min(w, h);
    const aspect = Math.max(w, h) / minSide;
    if (minSide < 360 || aspect > 2.0) return -1;
    if (minSide >= 800) score += 1;
    if (aspect > 1.6) score -= 2;
  }
  return score;
}

async function fromCommons(q) {
  try {
    const search = `${q} filetype:bitmap -filemime:svg`;
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(search)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo|categories&iiprop=url|size&iiurlwidth=480&cllimit=500&clshow=!hidden`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    const j = await res.json();
    return Object.values(j?.query?.pages || {})
      .map(p => {
        const info = p?.imageinfo?.[0];
        const u = info?.thumburl || info?.url;
        if (typeof u !== "string" || !/^https?:\/\//.test(u)) return null;
        const cats = (p.categories || [])
          .map(c => String(c.title || "").replace(/^Category:/, ""))
          .join(" | ");
        return { url: u, w: info.width || 0, h: info.height || 0, title: p.title || "", cats };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fromOpenverse(q) {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&mature=false&page_size=10`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const j = await res.json();
    return (j?.results || [])
      .map(r => {
        if (typeof r?.url !== "string" || !/^https?:\/\//.test(r.url)) return null;
        return { url: r.url, w: r.width || 0, h: r.height || 0, title: r.title || "" };
      })
      .filter(Boolean);
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
      .map(u => ({ url: u, title: q, off: true }));
  } catch {
    return [];
  }
}

async function gatherCandidates(query, matchWords) {
  const lists = [];
  if (isFoodish(query)) lists.push(await fromOpenFoodFacts(query));
  lists.push(await fromCommons(query));
  lists.push(await fromOpenverse(query));
  const seen = new Set();
  const scored = [];
  for (const cand of lists.flat()) {
    if (!cand?.url || seen.has(cand.url)) continue;
    seen.add(cand.url);
    // OpenFoodFacts ya es la base de datos del producto: su propio
    // match de búsqueda es la relación, no hace falta título.
    const score = cand.off ? 1 : scoreCandidate(cand, matchWords);
    if (score >= 0) scored.push({ ...cand, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// Fotos de ejemplo para el item: paths locales listos para <img>.
// Si ninguna supera los filtros, no hay foto (mejor un "Buscar
// foto" que una imagen que nada que ver). Devuelve también los
// títulos de origen, para poder auditar de dónde salió cada foto.
export async function searchPhotos(itemId, text) {
  const matchWords = expandWords(cleanQuery(text).split(" "));
  const queries = buildQueries(text);
  let candidates = [];
  for (const query of queries) {
    candidates = await gatherCandidates(query, matchWords);
    if (candidates.length) break;
  }
  const local = [];
  const sources = [];
  for (const cand of candidates.slice(0, 6)) {
    const p = await toLocal(cand.url, itemId);
    if (p) {
      local.push(p);
      sources.push(cand.title || "");
    }
    if (local.length >= 4) break;
  }
  return { pool: local, sources };
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
