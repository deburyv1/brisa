import { Router } from 'express';

const router = Router();

const API_KEY = process.env.OPENWEATHER_API_KEY;

// GET /api/weather?lat=..&lon=..
// Proxies OpenWeatherMap so the API key never leaves the server.
router.get('/', async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({ error: 'Weather not configured' });
  }
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }
  try {
    const weatherRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=es`
    );
    if (!weatherRes.ok) {
      return res.status(502).json({ error: 'Weather provider error' });
    }
    const data = await weatherRes.json();

    let city = data.name;
    try {
      const geoRes = await fetch(
        `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.length > 0) city = geoData[0].name;
      }
    } catch {
      // Fall back to weather station name
    }

    res.json({
      city,
      temp: Math.round(data.main.temp),
      description: data.weather[0].description,
      icon: data.weather[0].icon,
    });
  } catch (err) {
    console.error('Error fetching weather:', err);
    res.status(502).json({ error: 'Weather provider error' });
  }
});

export default router;
