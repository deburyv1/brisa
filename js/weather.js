/* ============================================
   BRISA - Weather Module
   Uses the backend /api/weather proxy (key stays server-side)
   ============================================ */

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject("Geolocation no soportado"); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: false });
  });
}

export async function initWeather() {
  const cityEl = document.querySelector(".weather-city");
  const tempEl = document.querySelector(".temp");
  const labelEl = document.querySelector(".weather-label");
  const iconEl = document.querySelector(".weather-icon");
  if (!cityEl || !tempEl || !labelEl || !iconEl) return;

  cityEl.textContent = "";
  tempEl.textContent = "";
  labelEl.textContent = "Cargando...";

  try {
    const pos = await getLocation();
    const { latitude: lat, longitude: lon } = pos.coords;
    const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("Weather error:", res.status, err.error);
      cityEl.textContent = "—";
      tempEl.textContent = "—";
      labelEl.textContent = res.status === 503 ? "No configurado" : "Sin conexión";
      return;
    }
    const data = await res.json();
    cityEl.textContent = data.city;
    tempEl.textContent = data.temp + "°C";
    const label = data.description.charAt(0).toUpperCase() + data.description.slice(1);
    labelEl.textContent = label;
    iconEl.innerHTML = `<img src="https://openweathermap.org/img/wn/${data.icon}@2x.png" alt="${label}" style="width:64px;height:64px">`;
  } catch (e) {
    console.error("Error clima:", e);
    cityEl.textContent = "—";
    tempEl.textContent = "—";
    labelEl.textContent = "Sin conexión";
  }
}
