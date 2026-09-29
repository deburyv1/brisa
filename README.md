# Brisa — tu espacio personal

Dashboard personal con estética Frutiger Aero (glassmorphism): tareas, notas,
finanzas, relaciones, clima y línea de tiempo del día.

## Requisitos

- Docker + Docker Compose (desarrollo local recomendado), o
- Node.js 22 + PostgreSQL 16

## Desarrollo local (recomendado)

```bash
# 1. Configurar variables de entorno
cp server/.env.example server/.env
# Completar OPENWEATHER_API_KEY (https://openweathermap.org/api)

# 2. Levantar todo (BD + app)
docker compose up -d --build

# 3. Abrir
http://localhost:3000
```

Las tablas se crean solas al arrancar (`server/setup-db.js`).
Los cambios en `css/`, `js/` e `index.html` se reflejan recargando el navegador
(volúmenes de desarrollo). Para cambios en el backend: `docker compose restart app`.

Sin Docker:

```bash
# Postgres local en 5432 con BD "brisa"
cd server && npm install && npm run setup-db && npm start
```

## Variables de entorno (`server/.env`)

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión Postgres |
| `OPENWEATHER_API_KEY` | Clima (vía proxy `/api/weather`, la key nunca sale del servidor) |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Login Spotify (opcional, funcionalidad oculta) |
| `SPOTIFY_REDIRECT_URI` | Callback OAuth |
| `PORT` | Puerto del servidor (Render lo inyecta solo) |

## Estructura

- `css/` — estilos por componente (`app.css` los importa)
- `js/` — módulos ES (`app.js` es el entry point)
- `server/` — Express + Postgres (`routes/`, `db.js`, `setup-db.js`)
- `aero-backgrounds/`, `icons/`, `brisa-icons/` — assets

## API

- `GET/POST /api/tasks` · `GET/PUT/DELETE /api/tasks/:id`
- `GET/POST /api/journal` · `GET/PUT/DELETE /api/journal/:id`
- `GET/POST /api/transactions` · `GET/PUT/DELETE /api/transactions/:id`
- `GET/POST /api/people` · `GET/PUT/DELETE /api/people/:id`
- `GET /api/weather?lat=&lon=` (requiere `OPENWEATHER_API_KEY`)
