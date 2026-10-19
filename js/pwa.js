/* ============================================
   BRISA - PWA + Web Push
   Installable app: service worker, share target,
   home-screen shortcuts and phone notifications.
   No build tools, no third parties.
   ============================================ */

export function initPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker no registrado:", err);
      });
    });
  }
  handleLaunchParams();
  initPushUi();
}

/* When Brisa is launched from the phone (shared text, a shortcut
   or a notification) the intent arrives as query params. Route it
   to the quick capture and clean the URL so a reload is normal. */
function handleLaunchParams() {
  const params = new URLSearchParams(location.search);
  const isShare = params.has("share");
  const isCapture = params.has("capture");
  if (!isShare && !isCapture) return;

  const text = [params.get("title"), params.get("text"), params.get("url")]
    .filter(Boolean)
    .join(" ")
    .trim();

  history.replaceState(null, "", location.pathname + location.hash);

  const open = () => {
    if (window.openQuickCapture) window.openQuickCapture(isShare ? text : "");
  };

  if (document.readyState === "complete") setTimeout(open, 350);
  else window.addEventListener("load", () => setTimeout(open, 350));
}

/* ---------------- Web Push ---------------- */

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function enablePush() {
  if (!pushSupported()) {
    return { ok: false, error: "Este navegador no permite avisos." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Sin permiso de avisos no te puedo avisar." };
  }

  const keyResponse = await fetch("/api/push/key");
  if (!keyResponse.ok) return { ok: false, error: "No se pudo revisar la configuración de avisos." };
  const keyRes = await keyResponse.json();
  if (!keyRes.enabled || !keyRes.publicKey) {
    return { ok: false, error: "El servidor no tiene los avisos configurados." };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
    });
  }

  const subscribeRes = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!subscribeRes.ok) throw new Error("No se pudo registrar este dispositivo.");

  const testRes = await fetch("/api/push/test", { method: "POST" });
  if (!testRes.ok) throw new Error("El dispositivo quedó registrado, pero no se pudo enviar la prueba.");
  refreshPushButton();
  return { ok: true };
}

async function disablePush() {
  const sub = await getSubscription();
  if (sub) {
    const res = await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    if (!res.ok) throw new Error("No se pudo desactivar el dispositivo en el servidor.");
    await sub.unsubscribe().catch(() => {});
  }
  refreshPushButton();
  return { ok: true };
}

let pushBusy = false;

function refreshPushButton() {
  const btn = document.querySelector("#push-btn");
  const disableBtn = document.querySelector("#push-disable-btn");
  if (!btn) return;
  if (!pushSupported()) {
    btn.hidden = true;
    if (disableBtn) disableBtn.hidden = true;
    return;
  }
  btn.hidden = false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;
  if (ios && !standalone) {
    btn.disabled = true;
    btn.textContent = "Instala Brisa para recibir avisos";
    if (disableBtn) disableBtn.hidden = true;
    return;
  }
  getSubscription().then((sub) => {
    const on = !!sub && Notification.permission === "granted";
    btn.classList.toggle("on", on);
    btn.textContent = on ? "Avisos activados · toca para probar" : "Avisar a mi teléfono";
    if (disableBtn) disableBtn.hidden = !on;
  }).catch(() => {
    btn.textContent = "Avisar a mi teléfono";
    if (disableBtn) disableBtn.hidden = true;
  });
}

function initPushUi() {
  const btn = document.querySelector("#push-btn");
  const disableBtn = document.querySelector("#push-disable-btn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (pushBusy) return;
    pushBusy = true;
    btn.disabled = true;
    try {
      const sub = await getSubscription();
      if (sub && Notification.permission === "granted") {
        const testRes = await fetch("/api/push/test", { method: "POST" });
        if (!testRes.ok) throw new Error("No se pudo enviar el aviso de prueba.");
        const r = await testRes.json();
        btn.textContent = r.sent > 0 ? "Enviado ✓" : "Sin dispositivos";
        setTimeout(refreshPushButton, 1600);
      } else {
        const res = await enablePush();
        if (!res.ok) {
          btn.textContent = res.error;
          setTimeout(refreshPushButton, 2600);
        }
      }
    } catch (err) {
      console.error("Error con los avisos:", err);
      btn.textContent = "No se pudo activar";
      setTimeout(refreshPushButton, 2600);
    } finally {
      btn.disabled = false;
      pushBusy = false;
    }
  });

  disableBtn?.addEventListener("click", async () => {
    if (pushBusy) return;
    pushBusy = true;
    disableBtn.disabled = true;
    disableBtn.textContent = "Desactivando…";
    try {
      await disablePush();
      btn.textContent = "Avisos desactivados";
      setTimeout(refreshPushButton, 1600);
    } catch (err) {
      console.error("Error desactivando avisos:", err);
      disableBtn.textContent = "No se pudo desactivar";
      setTimeout(refreshPushButton, 2600);
    } finally {
      pushBusy = false;
      disableBtn.disabled = false;
    }
  });

  refreshPushButton();
}

window.brisaPush = { enable: enablePush, disable: disablePush, status: refreshPushButton };
