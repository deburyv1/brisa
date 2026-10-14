/* ============================================
   BRISA - Quotes Module
   Famous quotes in Spanish, vendored from The Story
   Shack quote generator (?locale=es). One per
   page load, offline, no scraping.
   ============================================ */

const RAW = [
  "Justo y suavemente llega lejos. - Miguel de Cervantes",
  "Todo tiene belleza, pero no todos la ven. - Confucio",
  "El tiempo es lo que más deseamos, pero lo que peor utilizamos. - William Penn",
  "Ésos son mis principios, y si no te gustan. bueno, tengo otros. - Groucho Marx",
  "El placer más noble es la alegría de comprender. - Leonardo da Vinci",
  "La vida es frágil. No tenemos un mañana garantizado, así que dalo todo. - Tim Cook",
  "No es posible tener un mapa porque la vida sigue cambiando. - Osho",
  "Conquistar el miedo es el comienzo de la sabiduría. - Bertrand Russell",
  "Lo único que debemos temer es al miedo mismo. Franklin D. Roosevelt",
  "Vive tu vida, haz tu trabajo y luego quítate el sombrero. - Henry David Thoreau",
  "Solo tienes que escribir una oración verdadera. Escribe la oración más verdadera que conozcas. - Ernest Hemingway",
  "En el amor verdadero, alcanzas la libertad. - Thich Nhat Hanh",
  "Deja que la belleza de lo que amas sea lo que haces. - Rumi",
  "La originalidad no es más que una imitación juiciosa. - Voltaire",
  "El miedo es destructivo; el amor es una energía creativa. - Osho",
  "Para curar las preocupaciones, el trabajo es mejor que el whisky. Thomas A. Edison",
  "Dejar de fumar es fácil. Lo he hecho cientos de veces. - Mark Twain",
  "Vive tus creencias y podrás cambiar el mundo. - Henry David Thoreau",
  "Guarda tus miedos para ti, pero comparte tu coraje con los demás. - Robert Louis Stevenson",
  "Nunca soñé con el éxito. Trabajé para conseguirlo. - Estée Lauder",
  "Tú eres tus elecciones. - Lucio Anneo Séneca",
  "Nuestros muertos nunca están muertos para nosotros hasta que los olvidamos. - George Eliot",
  "El pájaro un nido, la araña una tela, el hombre amistad. - William Blake",
  "Los tiempos difíciles nunca duran, pero la gente difícil sí.",
  "Nunca seas un imitador, sé siempre original. No te conviertas en una copia al carbón. - Osho",
];

function parse(raw) {
  const i = raw.lastIndexOf(" - ");
  if (i < 0) return { text: raw.trim(), author: "Anónimo" };
  return { text: raw.slice(0, i).trim(), author: raw.slice(i + 3).trim() || "Anónimo" };
}

const QUOTES = RAW.map(parse);

function format(q) {
  return `\u201C${q.text}\u201D — ${q.author}`;
}

export function pickQuote() {
  let last = -1;
  try {
    last = Number(sessionStorage.getItem("brisa.quoteIdx") ?? -1);
  } catch {
    last = -1;
  }
  let i = Math.floor(Math.random() * QUOTES.length);
  if (QUOTES.length > 1 && i === last) i = (i + 1) % QUOTES.length;
  try {
    sessionStorage.setItem("brisa.quoteIdx", String(i));
  } catch {
    // ignore
  }
  return format(QUOTES[i]);
}
