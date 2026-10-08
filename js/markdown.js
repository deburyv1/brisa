/* ============================================
   BRISA - Tiny Markdown
   Escape-first inline renderer: bold, italic,
   strike, code, lists, quotes. No dependencies.
   ============================================ */

export function renderMarkdown(src) {
  const lines = String(src ?? "").split("\n");
  let html = "";
  let inList = false;

  const closeList = () => {
    if (inList) { html += "</ul>"; inList = false; }
  };

  for (const line of lines) {
    if (/^\s*-\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.replace(/^\s*-\s+/, ""))}</li>`;
    } else if (/^\s*>\s?/.test(line)) {
      closeList();
      html += `<blockquote>${inline(line.replace(/^\s*>\s?/, ""))}</blockquote>`;
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

function inline(s) {
  let out = String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return out;
}
