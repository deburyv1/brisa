/* ============================================
   BRISA - Studio Module (Fase 1: volver)
   Daily 2-minute rap-loop nudge + FL Studio launcher.
   No backend yet: challenge rotates by date, clips
   section arrives in Fase 3.
   ============================================ */

const CHALLENGES = [
  "Batería boom-bap a 90 BPM + 1 sample vocal cortado.",
  "Solo 808 + hi-hats: 2 minutos de groove a 140 BPM.",
  "Samplea lo primero que suene en tu pieza y hazlo loop.",
  "Un loop con un solo bajo + palmas. Nada más.",
  "Batería estilo trap + un pad oscuro de fondo.",
  "Rehace de memoria un beat que te guste, sin escucharlo.",
  "4 compases iguales y cambia solo el último.",
];

function todayChallenge() {
  const now = new Date();
  const day = Math.floor(now.getTime() / 86400000);
  return CHALLENGES[((day % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length];
}

export function initStudio() {
  const section = document.querySelector("#studio-section");
  if (!section) return;

  section.innerHTML = `
    <div class="studio-header">
      <div class="studio-title">Estudio</div>
      <div class="studio-sub">Volver a la producción, de a un loop.</div>
    </div>
    <div class="finance-breakdown">
      <div class="finance-breakdown-title"><span>Loop de hoy · 2 minutos estilo rap</span></div>
      <p class="studio-challenge">${todayChallenge()}</p>
      <div class="studio-row">
        <button class="modal-btn modal-btn-primary" id="studio-start">Partir 2:00</button>
        <button class="modal-btn modal-btn-secondary" id="studio-open-fl" title="Abre FL Studio en tu PC">Abrir FL Studio</button>
      </div>
      <p class="studio-hint" id="studio-fl-hint" style="display:none">Si no se abrió nada, falta instalar el protocolo en tu Windows (un clic, te guío).</p>
    </div>
    <div class="finance-breakdown">
      <div class="finance-breakdown-title">
        <span>Mis clips</span>
        <span class="finance-breakdown-actions">
          <button class="finance-mini-btn" id="studio-scan">Buscar nuevos</button>
        </span>
      </div>
      <div id="studio-clips"><p class="studio-hint">Cargando…</p></div>
      <div id="studio-new"></div>
    </div>
  `;

  section.querySelector("#studio-start")?.addEventListener("click", () => {
    if (!window.brisaTimer) return;
    window.brisaTimer.setMinutes(2);
    window.brisaTimer.start();
  });

  section.querySelector("#studio-open-fl")?.addEventListener("click", () => {
    const hint = section.querySelector("#studio-fl-hint");
    try {
      window.location.href = "brisa-fl://open";
    } catch {
      // ignore
    }
    if (hint) hint.style.display = "";
  });

  renderClips(section);
  section.querySelector("#studio-scan")?.addEventListener("click", () => scanNew(section));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderClips(section) {
  const box = section.querySelector("#studio-clips");
  if (!box) return;
  let clips = null;
  try {
    const res = await fetch("/api/clips");
    if (res.ok) clips = await res.json();
  } catch {
    clips = null;
  }
  if (!clips) {
    box.innerHTML = `<p class="studio-hint">No se pudo conectar con el servidor.</p>`;
    return;
  }
  if (clips.length === 0) {
    box.innerHTML = `<p class="studio-hint">Sin clips todavía. Aprieta “Buscar nuevos” para traer tus renders.</p>`;
    return;
  }
  box.innerHTML = clips.map(c => `
    <div class="clip-row">
      <div class="clip-title">${escapeHtml(c.title)}</div>
      <audio controls preload="none" src="/api/clips/${c.id}/audio"></audio>
      <button class="tx-btn tx-btn-delete" data-clip-del="${c.id}" title="Eliminar clip">✕</button>
    </div>`).join("");
  box.querySelectorAll("[data-clip-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`¿Eliminar "${btn.closest(".clip-row")?.querySelector(".clip-title")?.textContent || ""}" de Brisa? Tu archivo original no se toca.`)) return;
      try {
        await fetch(`/api/clips/${btn.dataset.clipDel}`, { method: "DELETE" });
      } catch (e) {
        console.error("Error eliminando clip:", e);
      }
      await renderClips(section);
    });
  });
}

async function scanNew(section) {
  const box = section.querySelector("#studio-new");
  if (!box) return;
  box.innerHTML = `<p class="studio-hint">Buscando…</p>`;
  let scan = null;
  try {
    const res = await fetch("/api/clips/scan");
    if (res.ok) scan = await res.json();
  } catch {
    scan = null;
  }
  if (!scan) {
    box.innerHTML = `<p class="studio-hint">No se pudo escanear. Intenta de nuevo.</p>`;
    return;
  }
  if (!scan.watched) {
    box.innerHTML = `<p class="studio-hint">Carpeta no conectada al servidor.</p>`;
    return;
  }
  if (scan.files.length === 0) {
    box.innerHTML = `<p class="studio-hint">Nada nuevo. Todo lo de tu carpeta ya está aquí.</p>`;
    return;
  }
  box.innerHTML = scan.files.map(f => `
    <div class="clip-row">
      <div class="clip-title">${escapeHtml(f.title)}</div>
      <button class="tx-btn tx-btn-edit" data-clip-add="${escapeHtml(f.name)}">Traer a Brisa</button>
    </div>`).join("");
  box.querySelectorAll("[data-clip-add]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const res = await fetch("/api/clips/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: btn.dataset.clipAdd }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        console.error("Error importando clip:", e);
        btn.disabled = false;
        return;
      }
      await renderClips(section);
      await scanNew(section);
    });
  });
}
