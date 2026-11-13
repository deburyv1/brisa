/* ============================================
   BRISA - Datos útiles (pares campo/valor)
   "Link trámite", "RUT asociado"... info que
   se pega al procesar una captura y acompaña
   a la acción mientras la realizas.
   Vista: link abre en pestaña, el resto se
   copia al clic. Editor: filas campo/valor.
   ============================================ */

export const PAIR_SUGGESTIONS = [
  "Link trámite", "RUT asociado", "Teléfono", "Correo", "Folio", "Código de seguimiento", "Dirección",
];

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function normalizePairs(pairs) {
  if (!Array.isArray(pairs)) return [];
  return pairs
    .slice(0, 20)
    .map((p) => ({
      label: String(p?.label ?? "").trim().slice(0, 60),
      value: String(p?.value ?? "").trim().slice(0, 600),
    }))
    .filter((p) => p.label || p.value);
}

function isURL(value) {
  return /^https?:\/\//i.test(value) || /^www\./i.test(value);
}

// ---- Vista (solo lectura) ----
export function pairsHTML(pairs, { title = "Datos útiles" } = {}) {
  const list = normalizePairs(pairs);
  if (!list.length) return "";
  return `
    <div class="task-pairs" role="group" aria-label="${esc(title)}">
      <div class="task-pairs-head">${esc(title)}</div>
      ${list.map((p) => {
        let val = "";
        if (p.value && isURL(p.value)) {
          const href = /^www\./i.test(p.value) ? `https://${p.value}` : p.value;
          val = `<a class="task-pair-val task-pair-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="Abrir en otra pestaña">${esc(p.value)}</a>`;
        } else if (p.value) {
          val = `<button type="button" class="task-pair-val task-pair-copy" data-pair-val="${esc(p.value)}" title="Clic para copiar">${esc(p.value)}</button>`;
        }
        return `<div class="task-pair"><span class="task-pair-label">${esc(p.label || "Dato")}</span>${val}</div>`;
      }).join("")}
    </div>`;
}

// Copiar al clic: un solo listener global para todas las vistas.
if (typeof document !== "undefined") {
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest?.(".task-pair-copy");
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.pairVal || btn.textContent);
      const prev = btn.textContent;
      btn.textContent = "copiado";
      window.setTimeout(() => { btn.textContent = prev; }, 900);
    } catch {
      // sin portapapeles: el texto queda visible para copiarlo a mano
    }
  });
}

// ---- Editor (filas campo/valor) ----

function rowHTML(pair = { label: "", value: "" }, index = 0) {
  return `
    <div class="task-pair-row">
      <input type="text" class="task-pair-in-label" list="task-pair-labels" name="pair_label_${index}"
        placeholder="Link trámite" autocomplete="off" maxlength="60" value="${esc(pair.label)}">
      <input type="text" class="task-pair-in-value" name="pair_value_${index}"
        placeholder="Pega el link o dato" autocomplete="off" maxlength="600" value="${esc(pair.value)}">
      <button type="button" class="task-pair-del" title="Quitar este dato">✕</button>
    </div>`;
}

export function pairsEditorHTML(pairs = null) {
  const rows = normalizePairs(pairs);
  const list = rows.length ? rows : [{ label: "", value: "" }];
  return `
    <div class="task-pairs-edit">
      <div class="task-pairs-edit-head">Datos útiles <span>link, RUT, folio… a mano al actuar</span></div>
      <datalist id="task-pair-labels">${PAIR_SUGGESTIONS.map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
      <div class="task-pairs-rows">${list.map(rowHTML).join("")}</div>
      <button type="button" class="task-pairs-add">+ Agregar dato</button>
    </div>`;
}

// El contenedor debe ser recién renderizado (se descarta con sus listeners).
export function wirePairsEditor(container, { max = 8 } = {}) {
  if (!container || container.dataset.wired === "1") return;
  container.dataset.wired = "1";
  const rowsBox = container.querySelector(".task-pairs-rows");
  const renumber = () => {
    rowsBox?.querySelectorAll(".task-pair-row").forEach((row, i) => {
      const label = row.querySelector(".task-pair-in-label");
      const value = row.querySelector(".task-pair-in-value");
      if (label) label.name = `pair_label_${i}`;
      if (value) value.name = `pair_value_${i}`;
    });
  };
  container.querySelector(".task-pairs-add")?.addEventListener("click", () => {
    if (!rowsBox || rowsBox.querySelectorAll(".task-pair-row").length >= max) return;
    rowsBox.insertAdjacentHTML("beforeend", rowHTML({ label: "", value: "" }, rowsBox.children.length));
    renumber();
    rowsBox.lastElementChild?.querySelector(".task-pair-in-label")?.focus();
  });
  container.addEventListener("click", (e) => {
    const del = e.target.closest?.(".task-pair-del");
    if (!del || !container.contains(del)) return;
    del.closest(".task-pair-row")?.remove();
    renumber();
  });
}

export function collectPairs(container) {
  if (!container) return [];
  return normalizePairs(
    [...container.querySelectorAll(".task-pair-row")].map((row) => ({
      label: row.querySelector(".task-pair-in-label")?.value || "",
      value: row.querySelector(".task-pair-in-value")?.value || "",
    }))
  );
}
