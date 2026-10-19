# Brisa — tu espacio personal

Dashboard personal con estética Frutiger Aero (glassmorphism): tareas, notas,
finanzas, relaciones, clima y línea de tiempo del día.

## Filosofía de producto

Brisa busca entregar el mayor valor posible con la menor interacción. Está
enfocada en personas con disfunción ejecutiva, incluidas personas con TDAH y
TEA, y debe acompañarlas en lo cotidiano desde capturar algo hasta terminarlo.
No basta con guardar información: Brisa debe ayudar a recordar qué importa,
elegir un siguiente movimiento y llevarlo a cabo.

Principios de interacción:

- Usar la información ya disponible en toda la app para sugerir automáticamente
  una forma útil de avanzar. Explicar brevemente la sugerencia y permitir
  cambiarla sin perder datos ni progreso.
- Si falta información para sugerir con confianza, ayudar a elegir o avanzar con
  la pregunta o acción más pequeña posible. No dejar a la persona frente a una
  pantalla vacía ni exigirle que diseñe su propio flujo.
- Reducir pasos, decisiones y carga de memoria. Priorizar una acción clara por
  pantalla, entradas breves, valores predeterminados útiles y estados
  comprensibles; evitar ruido, urgencia artificial y pedir datos que la app
  pueda inferir.
- Acompañar el ciclo completo: capturar, organizar, preparar, empezar, retomar,
  reprogramar y cerrar. Las ayudas deben aparecer cuando hacen falta y conservar
  el contexto entre módulos.
- Las cosas pueden cambiar de tipo. Facilitar moverlas o transformarlas entre
  acciones, eventos, ideas, pensamientos y otros módulos sin duplicar ni perder
  su información.
- Explicar por qué aparecen las sugerencias y mantener visible el panorama de
  tareas vencidas, de hoy y próximas para reducir la incertidumbre de “¿qué se
  me está olvidando?” sin llenar la vista de opciones.
- Los pasos de una acción se muestran dentro de su acción y no como compromisos
  independientes.

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
