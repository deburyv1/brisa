/* ============================================
   BRISA - PWA
   Installable app: service worker + share target
   + home-screen shortcuts. No build tools.
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
