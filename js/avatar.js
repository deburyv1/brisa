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
    applyStored(profile);
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

  saveBtn?.addEventListener("click", () => {
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
    try {
      localStorage.setItem(STORAGE_KEY, canvas.toDataURL("image/jpeg", 0.85));
    } catch (e) {
      console.error("No se pudo guardar la foto:", e);
      alert("No se pudo guardar la foto en este navegador.");
      return;
    }
    const profileEl = document.querySelector(".profile");
    if (profileEl) applyStored(profileEl);
    close();
  });

  removeBtn?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    const profileEl = document.querySelector(".profile");
    if (profileEl) applyStored(profileEl);
    close();
  });

  window.openAvatarModal = open;
}

function applyStored(profileEl) {
  let data = null;
  try {
    data = localStorage.getItem(STORAGE_KEY);
  } catch {
    data = null;
  }
  if (data) {
    profileEl.style.backgroundImage = `url(${data})`;
    profileEl.style.backgroundSize = "cover";
    profileEl.style.backgroundPosition = "center";
    profileEl.textContent = "";
  } else {
    profileEl.style.backgroundImage = "";
    if (!profileEl.textContent) profileEl.textContent = "L";
  }
}
