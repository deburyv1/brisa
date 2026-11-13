# BRISA — Tu espacio personal

Dashboard personal con estética **Frutiger Aero** (glassmorphism). Vanilla JS + Express + Postgres en Docker. Sin build tools, sin frameworks.

## Filosofía (no negociable)

1. **Capturar primero, organizar después.** Entrada "¿Qué tienes en mente?" sin fricción → inbox → clasificación reversible (acción, evento, nota, idea, recordatorio).
2. **Siguiente paso, no listas.** Inicio responde "¿qué hago ahora?" con scoring simple y determinista.
3. **Anti-parálisis.** Primer paso físico, zona de aterrizaje pre-decidida, timers acotados (10/15/25).
4. **Dependencia real vs. necesidad de certeza.** Verificación acotada a 10 min; la pregunta es "¿suficiente para actuar?", nunca "¿100% seguro?". No legitimar la procrastinación intelectual.
5. **Cero gamificación y cero culpa.** Sin rachas, puntos, XP ni castigos. Al volver tras días: "Hola de nuevo", no "fallaste".
6. **Chileno neutro** en todos los textos (tú, sin voseo). Sin emojis salvo pedido.
7. **El gráfico del avance del día es sagrado**: no degradarlo; solo sumar markers.

## Perfiles que ayuda (patrones, no diagnósticos)

Disfunción ejecutiva (iniciación), ceguera temporal, perfeccionismo/intolerancia a la incertidumbre, sensibilidad al castigo, saturación por loops abiertos. Andamiaje externo amable: estructura que sostiene sin exigir.

## Arquitectura

```
brisa/
├── index.html          # Shell: sidebar, vistas por sección, modales
├── css/app.css         # Solo @imports; un archivo por componente (_*.css)
├── js/app.js           # Entry: main() async, navegación, expone helpers en window
├── js/state.js         # Store central (tasks, journal, transactions, people, entries, events, ideas, ...)
├── server/index.js     # Express: API + estáticos (public/ en Docker, raíz en local)
├── server/routes/*.js  # Un router por recurso, CRUD estándar
├── server/setup-db.js  # Corre al arrancar: CREATE/ALTER IF NOT EXISTS + backfills idempotentes
├── server/.env         # Secrets (gitignored). Ver .env.example
├── docker-compose.yml  # db (Postgres 16, volumen brisa-data) + app
└── Dockerfile          # CMD: setup-db && index.js
```

**Patrones obligatorios:**
- Frontend: módulos ES, un archivo por vista (`tasks.js` + `taskModal.js`), secciones `<section id="X-section">` toggladas por `data-nav`, estados vacío/error/reintentar en cada vista.
- Modales: overlay `.modal-overlay` + `modalGuard.js` (snapshot al abrir, confirm si hay cambios).
- Backend: `pool.query` con `$1`, errores como `{ error }`, PUT parcial con merge (nunca pisar con NULL).
- Multiusuario: usar siempre `req.userId` en cada lectura y escritura de datos personales; cada alta incluye `user_id` explícito. No confiar en el `DEFAULT 1` para datos nuevos ni consultar/actualizar por `id` sin comprobar dueño.
- Funciones opcionales: registrar módulos personales en `users.enabled_features`; ocultarlos en el cliente y proteger sus rutas con `requireFeature`. Un módulo oculto no es un permiso.
- Postgres DATE llega como string `YYYY-MM-DD` (`pg.types.setTypeParser(1082)` en `db.js`) — no romper esto (zona UTC-4).
- `window.*` para comunicación entre módulos (ej. `window.initTasks`, `window.openFocus`).
- Commits chicos con `node --check` antes. Nunca commitear `server/.env` ni `*.xlsx`.

## Base de datos (Postgres, datos aislados por cuenta)

Las tablas personales se filtran por `user_id = req.userId`. Si una tabla hija
no incluye `user_id`, valida que su recurso padre pertenezca a `req.userId` antes
de consultar o mutar. Los datos históricos de Leonardo se conservan en su
cuenta; Google crea o recupera la cuenta propia de cada persona.
`users.enabled_features` guarda módulos opcionales. Las cuentas nuevas parten
con los módulos generalizables.

- `tasks`: title, description, priority, scheduled_datetime, due_datetime, **estimated_minutes**, is_completed, first_step
- `journal`: title, content, mood, **kind** (`nota` | `pensamiento`: mismo diario, sin tabla paralela)
- `people`: name, nickname, rut, birthday, relation, photo
- `accounts`: name, account_number, initial_balance, initial_date
- `transactions`: description, amount, type, category, date, account_id, import_id, **linked_id** (reembolso→gasto, ON DELETE SET NULL)
- `imports`: filename, file_hash (SHA-256), imported/duplicates/skipped/before_initial
- `entries`: raw_text, suggested_type, status (inbox/processed/archived), target_type, target_id
- `events`: title, start, "end", description, location, entry_id
- `ideas`: title, description, entry_id
- `reminders`: title, description, remind_at, done, entry_id
- `settings`: key/value (avatar JPEG en `avatar`), `spotify_tokens`
- `trash`: user_id, table_name, row_id, label, payload (fila completa en JSONB), batch_id, deleted_at — la llena el trigger `brisa_trash_row` antes de cada DELETE (12 tablas)

## API

`GET/POST /api/{tasks,journal,people,accounts,entries,events,ideas,reminders}` · `GET/PUT/DELETE` + `/:id` · `PATCH /api/entries/:id` (status/target o `raw_text` para editar la captura), `/api/reminders/:id`, `/api/transactions/:id/category` · `POST /api/transactions/import?account_id=&force=` (XLSX Banco de Chile, filtra fecha ≤ saldo inicial, dedupe, hash 409) · `GET /api/transactions?account_id=&uncategorized=` · `GET/DELETE /api/imports` · `GET /api/weather?lat=&lon=` (proxy, key server-side) · `GET/PUT/DELETE /api/settings/avatar` · `GET /api/trash`, `GET /api/trash/last`, `POST /api/trash/restore`, `DELETE /api/trash[/:id]` · `GET /api/shopping/:id/photos` (busca foto: Wikimedia Commons/Openverse/OpenFoodFacts → valida metadatos, sentido del título+categorías y descarga → local y chica en `shopping-photos/`, sharp; responde `{ pool, sources }`; si nada pasa filtros, sin foto) · `GET /api/shopping/:id/places` (tiendas de Santiago: Overpass/OSM con respaldo de cadenas).

## Flujos clave

- **Captura** (`capture.js` + `suggest.js` reglas por keywords): Enter → `entries` → sugerencia reversible → confirma creando el registro destino → entry `processed`. Al tope del input (255) el texto pasa al editor rico ya formateado. La barra del navbar (`quickCapture.js`) captura directo al inbox desde cualquier vista; tecla `C` = foco ahí.
- **Next** (`nextAction.js:pickNextAction`): no completadas → programada hoy → prioridad → duración corta; de noche hunde >30 min. "Empezar" → `openFocus()`.
- **Focus** (`focusMode.js`): fricción (🟢🔎🧩😕▶️) → paso/verificación acotada (tarea `Verificar: …` linkeada en sesión) → "¿suficiente?" → padre o nuevo paso. Timer + "Lo dejo acá" sin culpa.
- **Finanzas**: saldo = inicial + ingresos − gastos; desglose mensual neto (reembolsos vinculados restan); categorizarInline vía PATCH; categorías separadas ingreso/egreso.
- **Compras** (`shopping.js`): cada ítem es una tarjeta con foto local y "En Santiago: …" (lugares). El texto se edita al tocarlo; la foto se elige, se cambia o se quita desde su modal ("No es: buscar otras").
- **Guía** (`guidance.js`): pills clickeables (inbox, sin categorizar, vencidas) con ✕ descartable por sesión.

## Desarrollo local

```powershell
docker compose up -d --build   # primera vez / cambios en Dockerfile, setup-db, package.json
docker compose restart app     # cambios en server/ (volúmenes) — setup-db re-corre
# frontend (css/js/html): solo recargar (Ctrl+F5); ?v= en app.css/app.js para caché
docker logs brisa-app --tail 20
```
Nunca: `down -v`, `volume rm`, `prune --volumes` (borran datos). Tablas: `docker exec brisa-postgres psql -U postgres -d brisa`.

## Diferido

Planificador de regalos y reportes por categoría (excluir Tarjeta/Préstamo/Ahorro).
