/* ============================================
   BRISA - Mangos de bloque (estilo Notion)
   Al pasar el cursor sobre una línea del editor
   aparece un mangito ⠿ a la izquierda; al
   arrastrarlo el bloque entero se mueve. Un solo
   par de elementos flotantes compartido por todos
   los editores (solo hay uno visible a la vez).
   ============================================ */

let handle = null;    // mango flotante (⋮⋮)
let dropLine = null;  // marca de inserción
let current = null;   // { quill, line } — bloque bajo el cursor
let dragging = null;  // { quill, srcLine, srcDom, over }
let lastPointer = { x: 0, y: 0 };
let autoTimer = 0;
let lastHoverT = 0;

function ensureUI() {
  if (handle) return;
  handle = document.createElement("div");
  handle.className = "ql-drag-handle";
  handle.setAttribute("aria-hidden", "true");
  handle.innerHTML = "<i></i><i></i><i></i><i></i><i></i><i></i>";
  dropLine = document.createElement("div");
  dropLine.className = "ql-drop-line";
  document.body.append(handle, dropLine);
  handle.addEventListener("pointerdown", onGripDown);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}

function hide() {
  handle?.classList.remove("visible");
  current = null;
}

// Línea Quill (blot) bajo un punto del viewport.
function lineAtPoint(quill, x, y) {
  let el = document.elementFromPoint(x, y);
  if (!el || el === quill.root || !quill.root.contains(el)) return null;
  while (el.parentElement && el.parentElement !== quill.root) el = el.parentElement;
  if (!el.parentElement) return null;
  if (el.tagName === "UL" || el.tagName === "OL") {
    // Sobre el respiro de la lista: elegir el item bajo el cursor.
    el = [...el.children].find(li => {
      const r = li.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    }) || el.firstElementChild;
    if (!el) return null;
  }
  return quill.getLines().find(l => l.domNode === el) || null;
}

function showFor(quill, line) {
  const dom = line?.domNode;
  if (!dom?.isConnected) return hide();
  const r = dom.getBoundingClientRect();
  const rootRect = quill.root.getBoundingClientRect();
  if (r.bottom < rootRect.top + 2 || r.top > rootRect.bottom - 2) return hide();
  handle.style.top = `${Math.max(rootRect.top + 2, Math.min(r.top, rootRect.bottom - 24))}px`;
  handle.style.left = `${rootRect.left + 4}px`;
  handle.classList.add("visible");
}

// Línea más cercana a una altura Y (fallback cuando las referencias
// de Quill quedaron viejas tras un re-render).
function nearestLine(quill, y) {
  let best = null;
  let bestDist = Infinity;
  for (const l of quill.getLines()) {
    const r = l.domNode.getBoundingClientRect();
    if (y >= r.top && y <= r.bottom) return l;
    const d = y < r.top ? r.top - y : y - r.bottom;
    if (d < bestDist) { bestDist = d; best = l; }
  }
  return best;
}

function scrollParentOf(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

function updateDropTarget(x, y) {
  if (!dragging) return;
  const { quill, srcDom } = dragging;
  const line = lineAtPoint(quill, x, y);
  if (!line || line.domNode === srcDom) {
    dragging.over = null;
    dropLine.style.opacity = "0";
    return;
  }
  const r = line.domNode.getBoundingClientRect();
  const after = y > r.top + r.height / 2;
  dragging.over = { line, after };
  dropLine.style.opacity = "1";
  dropLine.style.top = `${(after ? r.bottom : r.top) - 1}px`;
  dropLine.style.left = `${r.left}px`;
  dropLine.style.width = `${r.width}px`;
}

// Seguir scrolleando el editor aunque el mouse quede quieto cerca del borde.
function autoScrollStep() {
  if (!dragging) return;
  const scroller = scrollParentOf(dragging.quill.root);
  if (scroller) {
    const r = scroller.getBoundingClientRect();
    const zone = 48;
    if (lastPointer.y < r.top + zone) scroller.scrollTop -= 14;
    else if (lastPointer.y > r.bottom - zone) scroller.scrollTop += 14;
  }
  updateDropTarget(lastPointer.x, lastPointer.y);
}

function onGripDown(e) {
  if (e.button !== 0 || !current) return;
  const { quill } = current;
  // Resolver la línea origen por la Y VIVA del puntero (si se tomó el
  // mango, la línea visualmente al lado es la que el usuario quiere).
  // Evita referencias viejas del hover y posiciones desfasadas si el
  // contenido/panel se movió (animaciones de apertura) tras el hover.
  const line = nearestLine(quill, e.clientY);
  if (!line?.domNode?.isConnected) return;
  e.preventDefault();
  const srcDom = line.domNode;
  dragging = { quill, srcLine: line, srcDom, over: null };
  srcDom.classList.add("ql-block-dragging");
  handle.classList.add("dragging");
  dropLine.classList.add("on");
  updateDropTarget(e.clientX, e.clientY);
  lastPointer = { x: e.clientX, y: e.clientY };
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragUp);
  window.addEventListener("pointercancel", onDragUp);
  autoTimer = setInterval(autoScrollStep, 60);
}

function onDragMove(e) {
  lastPointer = { x: e.clientX, y: e.clientY };
}

function onDragUp() {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragUp);
  window.removeEventListener("pointercancel", onDragUp);
  clearInterval(autoTimer);
  autoTimer = 0;
  const d = dragging;
  dragging = null;
  d?.srcDom.classList.remove("ql-block-dragging");
  handle.classList.remove("dragging");
  dropLine.classList.remove("on");
  dropLine.style.opacity = "0";
  if (d?.over) {
    // El DOM pudo re-renderizar en medio del arrastre: re-resolver la
    // línea origen por su posición visual antes de mover.
    let src = d.srcLine;
    if (!d.quill.getLines().includes(src)) {
      const r = d.srcDom.getBoundingClientRect();
      src = nearestLine(d.quill, r.top + Math.min(4, r.height / 2));
    }
    if (src) moveLine(d.quill, src, d.over.line, d.over.after);
  }
  hide();
}

// Mover la línea completa (con su formato) al nuevo lugar vía Delta.
function moveLine(quill, srcLine, destLine, after) {
  if (srcLine === destLine) return;
  const lines = quill.getLines();
  const si = lines.indexOf(srcLine);
  const di = lines.indexOf(destLine);
  if (si < 0 || di < 0) return;
  let srcStart = 0;
  for (let i = 0; i < si; i++) srcStart += lines[i].length();
  const srcLen = lines[si].length();
  let destStart = 0;
  for (let i = 0; i < di; i++) destStart += lines[i].length();
  const at = after ? destStart + lines[di].length() : destStart;
  if (at === srcStart || at === srcStart + srcLen) return; // mismo lugar
  const Delta = Quill.import("delta");
  const content = quill.getContents(srcStart, srcLen);
  // Ojo: Delta#insert no acepta arrays de ops — expandir op por op.
  const insertOps = (delta) => {
    content.ops.forEach(op => delta.insert(op.insert, op.attributes));
    return delta;
  };
  let delta;
  if (at > srcStart) {
    // Ojo: Delta#delete ignora el índice — siempre retain + delete.
    delta = new Delta();
    if (srcStart > 0) delta.retain(srcStart);
    delta.delete(srcLen);
    const rest = at - srcStart - srcLen;
    if (rest > 0) delta.retain(rest);
    insertOps(delta);
  } else {
    delta = new Delta();
    if (at > 0) delta.retain(at);
    insertOps(delta).retain(srcStart - at).delete(srcLen);
  }
  try {
    quill.updateContents(delta, "user");
  } catch (e) {
    console.error("Error moviendo bloque:", e);
    return;
  }
  const newStart = at > srcStart ? at - srcLen : at;
  quill.setSelection(newStart, 0, "user"); // foco + scroll-into-view
}

export function installBlockHandles(quill) {
  if (!quill || quill._blockHandles) return;
  quill._blockHandles = true;
  ensureUI();

  quill.root.addEventListener("pointermove", (e) => {
    if (dragging || e.pointerType === "touch") return;
    lastPointer = { x: e.clientX, y: e.clientY };
    const now = performance.now();
    if (now - lastHoverT < 16) return; // throttle: mousemove llega muy seguido
    lastHoverT = now;
    const line = lineAtPoint(quill, lastPointer.x, lastPointer.y);
    if (!line) return hide();
    current = { quill, line };
    showFor(quill, line);
  });
  quill.root.addEventListener("pointerleave", (e) => {
    // relatedTarget = el mango: no ocultar, si no nunca se puede agarrar.
    if (!dragging && e.relatedTarget !== handle) hide();
  });
  // Táctil: al tocar el texto aparece el mango para poder arrastrarlo.
  quill.root.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || dragging) return;
    const line = lineAtPoint(quill, e.clientX, e.clientY);
    if (line) { current = { quill, line }; showFor(quill, line); }
  }, true);
  // Cualquier cambio de contenido invalida el bloque apuntado.
  quill.on("text-change", () => { if (!dragging) hide(); });
}
