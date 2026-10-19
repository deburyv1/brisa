/* ============================================
   BRISA - Rocket League clips
   Lista los clips de gameplay, los reproduce
   con música de fondo y los exporta a una
   carpeta para Shotcut.
   ============================================ */

const API_BASE = "/api";

export async function initRlClips() {
  const section = document.querySelector("#rlclips-section");
  if (!section) return;

  const data = await fetch(`${API_BASE}/rlclips`).then(r => r.json()).catch(() => null);

  if (!data) {
    section.innerHTML = `
      <div class="rl-empty">
        <div class="rl-empty-icon">⚠️</div>
        <div class="rl-empty-text">No se pudo conectar con el servidor.</div>
      </div>
    `;
    return;
  }

  if (!data.watched) {
    section.innerHTML = `
      <div class="rl-empty">
        <div class="rl-empty-icon">📁</div>
        <div class="rl-empty-text">La carpeta de clips no está montada.<br>Monta <code>D:/debury/clips rocket league</code> en <code>/clips-rl</code>.</div>
      </div>
    `;
    return;
  }

  const videos = data.videos || [];
  const music = data.music || [];

  if (videos.length === 0) {
    section.innerHTML = `
      <div class="rl-empty">
        <div class="rl-empty-icon">🎮</div>
        <div class="rl-empty-text">Aún no hay clips.<br>Agrega videos (.mp4, .mkv, .mov…) a la carpeta <code>clips rocket league</code> y recarga.</div>
      </div>
    `;
    return;
  }

  const fmtSize = (n) => {
    if (!n) return "";
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  section.innerHTML = `
    <div class="rl-header">
      <div class="rl-title">Clips de Rocket League</div>
      <div class="rl-sub">${videos.length} clip${videos.length === 1 ? "" : "s"} · ${music.length} canción${music.length === 1 ? "" : "es"}</div>
    </div>

    <div class="rl-toolbar">
      <label class="rl-field">
        <span class="rl-field-label">Música de fondo</span>
        <select id="rl-music" class="rl-select">
          <option value="">Sin música</option>
          ${music.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join("")}
        </select>
      </label>
      <div class="rl-toolbar-btns">
        <button class="rl-btn rl-btn-secondary" id="rl-preview" title="Reproducir el clip seleccionado con la música">▶ Vista previa</button>
        <button class="rl-btn rl-btn-primary" id="rl-export" title="Copiar los clips seleccionados + música a una carpeta para Shotcut">Exportar para Shotcut</button>
      </div>
    </div>

    <div class="rl-list">
      ${videos.map(v => `
        <div class="rl-card" data-name="${escapeHtml(v.name)}">
          <button class="rl-play" data-action="play" title="Reproducir">▶</button>
          <div class="rl-info">
            <div class="rl-name" title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</div>
            <div class="rl-meta">${v.ext.toUpperCase().slice(1)}${v.size ? " · " + fmtSize(v.size) : ""}</div>
          </div>
          <label class="rl-check">
            <input type="checkbox" data-action="select">
            <span>usar</span>
          </label>
        </div>
      `).join("")}
    </div>

    <div class="rl-status" id="rl-status"></div>
  `;

  // Play a single clip in the modal
  section.querySelectorAll('[data-action="play"]').forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".rl-card");
      const name = card?.dataset.name;
      if (name) openPlayer(name);
    });
  });

  // Preview: play the first selected clip (or the last clicked) with music
  let lastClicked = videos[0]?.name || null;
  section.querySelectorAll(".rl-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest('[data-action="play"], [data-action="select"]')) return;
      lastClicked = card.dataset.name;
      section.querySelectorAll(".rl-card").forEach(c => c.classList.toggle("selected", c === card));
    });
  });

  section.querySelector("#rl-preview")?.addEventListener("click", () => {
    const selected = [...section.querySelectorAll('.rl-card input[data-action="select"]:checked')]
      .map(i => i.closest(".rl-card")?.dataset.name).filter(Boolean);
    const name = selected[0] || lastClicked || videos[0]?.name;
    if (!name) return;
    const music = section.querySelector("#rl-music")?.value || "";
    openPlayer(name, music);
  });

  section.querySelector("#rl-export")?.addEventListener("click", async () => {
    const selected = [...section.querySelectorAll('.rl-card input[data-action="select"]:checked')]
      .map(i => i.closest(".rl-card")?.dataset.name).filter(Boolean);
    if (selected.length === 0) {
      setStatus("Selecciona al menos un clip con la casilla 'usar'.");
      return;
    }
    const music = section.querySelector("#rl-music")?.value || null;
    setStatus("Copiando a la carpeta de proyecto…");
    try {
      const res = await fetch(`${API_BASE}/rlclips/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clips: selected, music }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setStatus(`Listo: ${data.files.length} archivo(s) copiados a ${data.folder}. Abre esa carpeta en Shotcut.`);
    } catch (e) {
      setStatus("No se pudo exportar: " + (e.message || e));
    }
  });
}

function setStatus(msg) {
  const el = document.querySelector("#rl-status");
  if (el) el.textContent = msg;
}

// Modal de reproducción (video + música opcional)
let playerOverlay = null;
function ensurePlayer() {
  if (playerOverlay) return playerOverlay;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "rl-player-modal";
  overlay.innerHTML = `
    <div class="modal modal-wide">
      <div class="modal-header">
        <div class="modal-title" id="rl-player-title">Clip</div>
        <button class="modal-close" id="rl-player-close">✕</button>
      </div>
      <div class="modal-form">
        <div class="rl-player-video">
          <video id="rl-video" controls preload="metadata" playsinline></video>
        </div>
        <div class="rl-player-music">
          <label class="rl-field">
            <span class="rl-field-label">Música de fondo</span>
            <select id="rl-player-music" class="rl-select"></select>
          </label>
          <div class="rl-player-music-actions">
            <button class="rl-btn rl-btn-primary" id="rl-play-both">▶ Reproducir ambos</button>
            <button class="rl-btn rl-btn-secondary" id="rl-pause-both">⏸ Pausar</button>
          </div>
          <audio id="rl-audio" preload="metadata"></audio>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    const v = overlay.querySelector("#rl-video");
    const a = overlay.querySelector("#rl-audio");
    if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    overlay.classList.remove("active");
  };
  overlay.querySelector("#rl-player-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });

  const video = overlay.querySelector("#rl-video");
  const audio = overlay.querySelector("#rl-audio");
  overlay.querySelector("#rl-play-both").addEventListener("click", () => {
    if (audio.src) { audio.currentTime = video.currentTime; }
    video.play().catch(() => {});
    if (audio.src) audio.play().catch(() => {});
  });
  overlay.querySelector("#rl-pause-both").addEventListener("click", () => {
    video.pause();
    if (audio.src) audio.pause();
  });
  // Mantener el audio sincronizado al buscar en el video
  video.addEventListener("seeked", () => {
    if (audio.src) audio.currentTime = video.currentTime;
  });

  playerOverlay = overlay;
  return overlay;
}

function openPlayer(name, musicName) {
  const overlay = ensurePlayer();
  const video = overlay.querySelector("#rl-video");
  const audio = overlay.querySelector("#rl-audio");
  const title = overlay.querySelector("#rl-player-title");
  const musicSel = overlay.querySelector("#rl-player-music");

  title.textContent = name;
  video.src = `${API_BASE}/rlclips/stream?name=${encodeURIComponent(name)}&type=video`;
  video.load();

  // poblar música
  const musicList = [...document.querySelectorAll("#rl-music option")]
    .map(o => o.value).filter(Boolean);
  musicSel.innerHTML = `<option value="">Sin música</option>` +
    musicList.map(m => `<option value="${escapeHtml(m)}" ${m === musicName ? "selected" : ""}>${escapeHtml(m)}</option>`).join("");

  function loadAudio() {
    const m = musicSel.value;
    if (m) {
      audio.src = `${API_BASE}/rlclips/stream?name=${encodeURIComponent(m)}&type=music`;
      audio.load();
    } else {
      audio.removeAttribute("src");
      audio.load();
    }
  }
  musicSel.onchange = loadAudio;
  loadAudio();

  overlay.classList.add("active");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
