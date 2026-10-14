/* ============================================
   BRISA - Quotes Module
   Famous quotes vendored from The Story Shack
   quote generator (static examples). One per
   page load, offline, no scraping.
   ============================================ */

const QUOTES = [
  { text: "Time flies, whether you're wasting it or not.", author: "Crystal Woods" },
  { text: "To be successful in life what you need is education, not literacy and degrees.", author: "Munshi Premchand" },
  { text: "The world hates change, yet it is the only thing that has brought progress.", author: "Charles Kettering" },
  { text: "You are not a drop in the ocean. You are the entire ocean in a drop.", author: "Rumi" },
  { text: "Be true to who you are.", author: "Anónimo" },
  { text: "Intelligence plus character – that is the goal of true education.", author: "Martin Luther King Jr" },
  { text: "The mind is everything. What you think you become.", author: "Buddha" },
  { text: "Guests, like fish, begin to smell after three days.", author: "Benjamin Franklin" },
  { text: "Failure is success if we learn from it.", author: "Malcolm Forbes" },
  { text: "What is once well done is done forever.", author: "Henry David Thoreau" },
];

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
