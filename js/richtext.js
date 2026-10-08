/* ============================================
   BRISA - Rich Text (Quill, vendored, offline)
   WYSIWYG comfort in editors; plain-text titles
   everywhere else. Old markdown still renders.
   ============================================ */
import { renderMarkdown } from "./markdown.js";

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  ["blockquote", "code-block"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link", "clean"],
];

export function createEditor(container, { placeholder = "" } = {}) {
  if (!container || container.dataset.quillReady) return container?._quill || null;
  if (typeof Quill === "undefined") {
    console.error("Quill no cargado.");
    return null;
  }
  const quill = new Quill(container, {
    theme: "snow",
    placeholder,
    modules: { toolbar: TOOLBAR },
  });
  container.dataset.quillReady = "1";
  container._quill = quill;
  return quill;
}

export function editorHTML(quill) {
  const html = quill?.root?.innerHTML || "";
  return quill?.getText()?.trim() ? html : "";
}

export function plainText(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return (d.textContent || "").replace(/\s+/g, " ").trim();
}

export function isHTML(s) {
  return /<\s*(p|ul|ol|li|h[1-6]|blockquote|pre|strong|em|u|s)[^>]*>/i.test(s || "");
}

export function sanitizeHTML(html) {
  const t = document.createElement("template");
  t.innerHTML = html || "";
  t.content.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach(n => n.remove());
  t.content.querySelectorAll("*").forEach(n => {
    [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name)) n.removeAttribute(a.name);
      if ((a.name === "href" || a.name === "src") && /^\s*javascript:/i.test(a.value)) {
        n.removeAttribute(a.name);
      }
    });
    const quillUI = (n.getAttribute("class") || "").includes("ql-");
    if (quillUI) n.removeAttribute("class");
  });
  return t.innerHTML;
}

// Stored content may be HTML (new) or markdown/plain (old).
export function renderRich(s) {
  if (!s) return "";
  return isHTML(s) ? sanitizeHTML(s) : renderMarkdown(s);
}
