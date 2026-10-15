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
      <div class="finance-breakdown-title"><span>Mis clips</span></div>
      <p class="studio-hint">Aquí vas a escuchar tus renders. Llega en la Fase 3.</p>
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
}
