/* ============================================
   BRISA - Rich Text (Quill, vendored, offline)
   WYSIWYG comfort in editors; plain-text titles
   everywhere else. Old markdown still renders.
   ============================================ */
import { renderMarkdown } from "./markdown.js";
import { installBlockHandles } from "./blockHandles.js?v=20261021rtl9";

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  ["blockquote", "code-block"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link", "image", "clean"],
];

// Downscale any image file to a light JPEG data URL.
export function fileToLightDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => downscale(String(reader.result)).then(resolve, reject);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  // Images: never overflow, click cycles display size.
  // The width persists in the saved HTML.
  const SIZES = ["", "320px", "180px"];
  quill.root.addEventListener("click", (e) => {
    const img = e.target?.closest?.("img");
    if (!img || !quill.root.contains(img)) return;
    const cur = SIZES.indexOf(img.dataset.size || "");
    const next = SIZES[(cur + 1) % SIZES.length];
    img.dataset.size = next;
    img.style.width = next;
    img.style.height = "auto";
    img.style.maxWidth = "100%";
  });
  // Image button: file picker → downscaled embed (never raw megabytes)
  try {
    const toolbar = quill.getModule("toolbar");
    toolbar.addHandler("image", () => {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "image/*";
      picker.onchange = async () => {
        const file = picker.files && picker.files[0];
        if (!file) return;
        try {
          const url = await fileToLightDataURL(file);
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, "image", url, "user");
          quill.setSelection(range.index + 1, 0, "user");
        } catch (e) {
          console.error("Error agregando imagen:", e);
        }
      };
      picker.click();
    });
  } catch {
    // toolbar module missing: paste still works
  }
  // Block handles: reacomodar bloques arrastrando (estilo Notion)
  installBlockHandles(quill);
  container.dataset.quillReady = "1";
  container._quill = quill;
  return quill;
}

export function editorHTML(quill) {
  const html = quill?.root?.innerHTML || "";
  const hasContent = quill?.getText()?.trim() || quill?.root?.querySelector("img, video, audio");
  return hasContent ? html : "";
}

// Pasted photos arrive as huge data URLs. Downscale them in the
// HTML string (never touches the live editor), so saves stop
// failing and entries stay light. Results are cached by source.
const MAX_IMG_DIM = 1200;
const lightCache = new Map();

function downscale(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      try {
        const s = Math.min(1, MAX_IMG_DIM / Math.max(im.width, im.height));
        if (s >= 1) return resolve(src);
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * s);
        c.height = Math.round(im.height * s);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      } catch (e) {
        reject(e);
      }
    };
    im.onerror = reject;
    im.src = src;
  });
}

export async function htmlWithLightImages(html) {
  if (!html || !html.includes("<img")) return html;
  const doc = document.createElement("div");
  doc.innerHTML = html;
  const imgs = [...doc.querySelectorAll("img")].filter(i => (i.src || "").startsWith("data:"));
  for (const img of imgs) {
    const key = img.src.slice(0, 64) + "|" + img.src.length;
    if (!lightCache.has(key)) {
      try {
        lightCache.set(key, await downscale(img.src));
      } catch {
        continue;
      }
      if (lightCache.size > 20) lightCache.delete(lightCache.keys().next().value);
    }
    img.src = lightCache.get(key);
  }
  return doc.innerHTML;
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
