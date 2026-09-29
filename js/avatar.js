/* ============================================
   BRISA - Avatar Module
   Profile photo with zoom + pan crop (stored locally)
   ============================================ */
const STORAGE_KEY = "brisa.avatar";
const PREVIEW_SIZE = 220;
const OUTPUT_SIZE = 256;

export function initAvatar() {
  const profile = document.querySelector(".profile");
  if (profile) {
    applyAvatar(profile);
    profile.style.cursor = "pointer";
    profile.title = "Cambiar foto de perfil";
    profile.addEventListener("click", () => openAvatarModal());
  }

  const overlay = document.querySelector("#avatar-modal");
  const closeBtn = document.querySelector("#avatar-modal-close");
  const cancelBtn = document.querySelector("#avatar-modal-cancel");
  const fileInput = document.querySelector("#avatar-file");
  const zoomInput = document.querySelector("#avatar-zoom");
  const preview = document.querySelector("#avatar-preview");
  const saveBtn = document.querySelector("#avatar-save");
  const removeBtn = document.querySelector("#avatar-remove");
  if (!overlay || !fileInput || !preview) return;

  let img = null;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let baseScale = 1;

  function open() {
    overlay.classList.add("active");
  }

  function close() {
    overlay.classList.remove("active");
  }

  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });

  function render() {
    const el = preview.querySelector("img");
    if (!img || !el) return;
    const scale = baseScale * zoom;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.left = `${offsetX}px`;
    el.style.top = `${offsetY}px`;
  }

  function clamp() {
    if (!img) return;
    const scale = baseScale * zoom;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    offsetX = Math.min(0, Math.max(PREVIEW_SIZE - w, offsetX));
    offsetY = Math.min(0, Math.max(PREVIEW_SIZE - h, offsetY));
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      baseScale = Math.max(PREVIEW_SIZE / img.naturalWidth, PREVIEW_SIZE / img.naturalHeight);
      zoom = 1;
      offsetX = (PREVIEW_SIZE - img.naturalWidth * baseScale) / 2;
      offsetY = (PREVIEW_SIZE - img.naturalHeight * baseScale) / 2;
      preview.innerHTML = "";
      const el = document.createElement("img");
      el.src = img.src;
      el.draggable = false;
      preview.appendChild(el);
      if (zoomInput) zoomInput.value = 1;
      render();
    };
    img.src = url;
  });

  zoomInput?.addEventListener("input", () => {
    zoom = Number(zoomInput.value);
    clamp();
    render();
  });

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origX = 0;
  let origY = 0;

  preview.addEventListener("pointerdown", (e) => {
    if (!img) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    origX = offsetX;
    origY = offsetY;
    preview.setPointerCapture(e.pointerId);
  });
  preview.addEventListener("pointermove", (e) => {
    if (!dragging || !img) return;
    offsetX = origX + (e.clientX - startX);
    offsetY = origY + (e.clientY - startY);
    clamp();
    render();
  });
  preview.addEventListener("pointerup", () => { dragging = false; });
  preview.addEventListener("pointercancel", () => { dragging = false; });

  saveBtn?.addEventListener("click", async () => {
    if (!img) return;
    const scale = baseScale * zoom;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    // Map preview coords back to source pixels
    ctx.drawImage(
      img,
      -offsetX / scale, -offsetY / scale,
      PREVIEW_SIZE / scale, PREVIEW_SIZE / scale,
      0, 0, OUTPUT_SIZE, OUTPUT_SIZE
    );
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    try {
      const res = await fetch("/api/settings/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: dataUrl }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error("No se pudo guardar en el servidor, uso local:", e);
    }
    try {
      localStorage.setItem(STORAGE_KEY, dataUrl);
    } catch (e) {
      console.error("No se pudo guardar la foto:", e);
    }
    const profileEl = document.querySelector(".profile");
    if (profileEl) applyAvatar(profileEl);
    close();
  });

  removeBtn?.addEventListener("click", async () => {
    try {
      await fetch("/api/settings/avatar", { method: "DELETE" });
    } catch (e) {
      console.error("Error borrando foto del servidor:", e);
    }
    localStorage.removeItem(STORAGE_KEY);
    const profileEl = document.querySelector(".profile");
    if (profileEl) applyAvatar(profileEl);
    close();
  });

  window.openAvatarModal = open;
}

async function applyAvatar(profileEl) {
  // Fast path: local cache
  let cached = null;
  try {
    cached = localStorage.getItem(STORAGE_KEY);
  } catch {
    cached = null;
  }
  if (cached) {
    paintAvatar(profileEl, cached);
  }
  // Source of truth: server
  try {
    const res = await fetch("/api/settings/avatar");
    if (res.ok) {
      const blob = await res.blob();
      const dataUrl = await blobToDataUrl(blob);
      try {
        localStorage.setItem(STORAGE_KEY, dataUrl);
      } catch {
        // Cache full: server copy is enough
      }
      paintAvatar(profileEl, dataUrl);
      return;
    }
    if (res.status === 404 && !cached) clearAvatar(profileEl);
  } catch {
    if (!cached) clearAvatar(profileEl);
  }
}

function paintAvatar(profileEl, dataUrl) {
  profileEl.style.backgroundImage = `url(${dataUrl})`;
  profileEl.style.backgroundSize = "cover";
  profileEl.style.backgroundPosition = "center";
  profileEl.textContent = "";
}

function clearAvatar(profileEl) {
  profileEl.style.backgroundImage = "";
  if (!profileEl.textContent) profileEl.textContent = "L";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
