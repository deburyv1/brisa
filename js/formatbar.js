/* ============================================
   BRISA - Format Bar
   Keyboard-first markdown formatting for any textarea.
   Click the buttons or use the shortcuts; Tab still
   moves focus, Enter behavior stays with the host.
   ============================================ */

const ACTIONS = [
  { kind: "bold", label: "B", cls: "b", title: "Negrita (Ctrl+B)" },
  { kind: "italic", label: "I", cls: "i", title: "Cursiva (Ctrl+I)" },
  { kind: "strike", label: "S", cls: "s", title: "Tachado (Ctrl+Shift+X)" },
  { kind: "code", label: "‹›", cls: "", title: "Código (Ctrl+E)" },
  { kind: "list", label: "•", cls: "", title: "Lista (Ctrl+L)" },
  { kind: "quote", label: "❝", cls: "", title: "Cita (Ctrl+Q)" },
];

const SHORTCUTS = {
  b: "bold",
  i: "italic",
  e: "code",
  l: "list",
  q: "quote",
};

export function attachFormatbar(textarea, barEl) {
  if (!textarea || !barEl || barEl.dataset.fmtReady) return;
  barEl.dataset.fmtReady = "1";
  barEl.classList.add("fmt-bar");
  barEl.innerHTML = ACTIONS.map(a =>
    `<button type="button" class="fmt-btn ${a.cls}" data-fmt="${a.kind}" title="${a.title}">${a.label}</button>`
  ).join("");

  barEl.querySelectorAll("[data-fmt]").forEach(btn => {
    // mousedown: format without stealing focus from the textarea
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      applyFormat(textarea, btn.dataset.fmt);
    });
  });

  textarea.addEventListener("keydown", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const key = e.key.toLowerCase();
    if (e.shiftKey && key === "x") {
      e.preventDefault();
      applyFormat(textarea, "strike");
      return;
    }
    if (e.shiftKey || !SHORTCUTS[key]) return;
    e.preventDefault();
    applyFormat(textarea, SHORTCUTS[key]);
  });
}

export function applyFormat(el, kind) {
  if (kind === "list" || kind === "quote") {
    prefixLines(el, kind === "list" ? "- " : "> ");
    return;
  }
  const marks = { bold: "**", italic: "*", strike: "~~", code: "`" };
  const m = marks[kind];
  if (m) wrapSelection(el, m, m);
}

function wrapSelection(el, before, after) {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? el.value.length;
  const sel = el.value.slice(s, e);
  if (sel) {
    el.setRangeText(`${before}${sel}${after}`, s, e, "end");
  } else {
    el.setRangeText(`${before}texto${after}`, s, e, "end");
    el.setSelectionRange(s + before.length, s + before.length + 5);
  }
  el.focus();
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function prefixLines(el, prefix) {
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? 0;
  const startLine = el.value.lastIndexOf("\n", s - 1) + 1;
  let endLine = el.value.indexOf("\n", e);
  if (endLine === -1) endLine = el.value.length;
  const block = el.value.slice(startLine, endLine);
  const lines = block.split("\n").map(line =>
    line.startsWith(prefix) ? line : prefix + line);
  el.setRangeText(lines.join("\n"), startLine, endLine, "end");
  el.focus();
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
