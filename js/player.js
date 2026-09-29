/* ============================================
   BRISA - Player Module
   Webamp panel + Spotify Web Playback SDK
   ============================================ */
const SPOTIFY_CLIENT_ID = "ddac298140d84f2cb3ae71478a522058";
const SPOTIFY_REDIRECT_URI = "https://dull-pillows-say.loca.lt/api/spotify/callback";

export function initPlayer() {
  const panel = document.querySelector("#player-panel");
  if (!panel) return;

  const toggle = panel.querySelector(".player-toggle");
  const content = panel.querySelector(".player-content");

  if (toggle) {
    toggle.addEventListener("click", () => {
      panel.classList.toggle("open");
    });
  }

  // Spotify disabled for now - show placeholder
  renderPlaceholder();
}

function renderPlaceholder() {
  const inner = document.querySelector(".player-inner");
  if (!inner) return;

  inner.innerHTML = `
    <div class="spotify-connect">
      <div class="spotify-connect-text">Reproductor de música próximamente</div>
    </div>
  `;
}

async function checkSpotifyAuth() {
  try {
    const res = await fetch("/api/spotify/status");
    const data = await res.json();

    if (data.authenticated) {
      renderSpotifyPlayer();
    } else {
      renderSpotifyConnect();
    }
  } catch (e) {
    renderSpotifyConnect();
  }
}

function renderSpotifyConnect() {
  const inner = document.querySelector(".player-inner");
  if (!inner) return;

  inner.innerHTML = `
    <div class="spotify-connect">
      <div class="spotify-connect-text">Conectá tu cuenta de Spotify para escuchar música</div>
      <button class="spotify-connect-btn" id="spotify-login">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.381 4.26-1.2 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.56.3z"/></svg>
        Conectar Spotify
      </button>
      <div class="spotify-status">Requiere Spotify Premium</div>
    </div>
  `;

  const loginBtn = inner.querySelector("#spotify-login");
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      window.location.href = `/api/spotify/login`;
    });
  }
}

function renderSpotifyPlayer() {
  const inner = document.querySelector(".player-inner");
  if (!inner) return;

  inner.innerHTML = `
    <div class="webamp-container" id="webamp-container"></div>
  `;

  loadWebamp();
}

function loadWebamp() {
  const container = document.querySelector("#webamp-container");
  if (!container) return;

  const iframe = document.createElement("iframe");
  iframe.src = "https://webamp.org/";
  iframe.allow = "autoplay; clipboard-write";
  container.appendChild(iframe);
}
