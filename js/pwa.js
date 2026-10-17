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

  const keyRes = await fetch("/api/push/key").then((r) => r.json());
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

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });

  await fetch("/api/push/test", { method: "POST" });
  refreshPushButton();
  return { ok: true };
}

async function disablePush() {
  const sub = await getSubscription();
  if (sub) {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe().catch(() => {});
  }
  refreshPushButton();
  return { ok: true };
}

let pushBusy = false;

function refreshPushButton() {
  const btn = document.querySelector("#push-btn");
  if (!btn) return;
  if (!pushSupported()) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  getSubscription().then((sub) => {
    const on = !!sub && Notification.permission === "granted";
    btn.classList.toggle("on", on);
    btn.textContent = on ? "Avisos activados · toca para probar" : "Avisar a mi teléfono";
  }).catch(() => {
    btn.textContent = "Avisar a mi teléfono";
  });
}

function initPushUi() {
  const btn = document.querySelector("#push-btn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (pushBusy) return;
    pushBusy = true;
    btn.disabled = true;
    try {
      const sub = await getSubscription();
      if (sub && Notification.permission === "granted") {
        const r = await fetch("/api/push/test", { method: "POST" }).then((x) => x.json());
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

  refreshPushButton();

  // iOS needs the PWA installed for notifications: say so, gently.
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;
  if (ios && !standalone) {
    btn.textContent = "Instala Brisa para recibir avisos";
  }
}

window.brisaPush = { enable: enablePush, disable: disablePush, status: refreshPushButton };
