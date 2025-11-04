# Fantasy Zone Server

A Next.js 14 (App Router) TypeScript service providing APIs and an admin UI for Fantasy Zone features like live game scanning, in-zone events, schedules, and system status. It uses Drizzle ORM with Neon (Postgres) and Upstash Redis for rate limiting and caching.

## Tech Stack
- **Framework**: Next.js 14 (App Router), React 18, TypeScript
- **ORM/DB**: Drizzle ORM + Neon Postgres
- **Cache/Rate Limit**: Upstash Redis + @upstash/ratelimit
- **Validation**: Zod
- **Hosting**: Vercel (with Cron Jobs)

## Features
- Live scanning of events and in-zone calculations
- Scheduled seeding and refresh of game schedules (via Vercel Cron)
- Admin UI under `/admin` protected by Basic Auth
- Typed environment validation with Zod

## Getting Started

### Prerequisites
- Node.js 18.17+ (recommended 20+)
- A Neon Postgres database URL
- Upstash Redis REST URL and Token

### Installation
```bash
npm install
```

### Environment Variables
Create a `.env.local` for local dev (preferred) or `.env` for general usage.

```bash
# Database (Neon Postgres)
NEON_DATABASE_URL="postgres://USER:PASSWORD@HOST/db?sslmode=require"

# Upstash Redis (for rate limiting and caching)
UPSTASH_REDIS_REST_URL="https://us1-your-upstash-url"
UPSTASH_REDIS_REST_TOKEN="your-upstash-token"

# Admin Basic Auth for /admin
ADMIN_USER="admin"
ADMIN_PASS="strong-password"

# Tuning flags (defaults shown)
FZ_POLL_MS_STATUS="1000"
FZ_WATCH_WINDOW_SEC="20"
FZ_SCAN_CONCURRENCY="3"
FZ_ESPN_MAX_RPS="3"
FZ_INZONE_TTL_SEC="30"
FZ_LIVE_TTL_SEC="120" # TTL for live possession/team mappings
```

Notes:
- `drizzle.config.ts` loads `.env.local` first, then `.env`.
- All variables are validated in `lib/env.ts`.

### Database (Drizzle + Neon)
- Generate SQL (if you change schema):
```bash
npm run db:generate
```
- Push schema/migrations to the database:
```bash
npm run db:push
```

### Seed Schedules (optional for local dev)
Use the Admin UI or a direct request to add upcoming games to the database.

```bash
# via Admin UI: visit /admin and click "Seed Games"

# or via HTTP directly:
curl -X POST http://localhost:3000/api/schedule/seed
```

### Run Locally
```bash
npm run dev
```
App will start at `http://localhost:3000`.

Background poller (possession, ~1s):
```bash
npm run poller
```
Run alongside the app (e.g., with a process manager in prod).

### Build & Start (Production)
```bash
npm run build
npm start
```

## Scripts
- `dev`: Start Next.js dev server
- `build`: Build for production
- `start`: Start production server
- `lint`: Run ESLint
- `db:generate`: Generate Drizzle migrations from the schema
- `db:push`: Apply migrations to the target DB
- `poller`: Run the live possession poller loop (calls ESPN every ~1s)

## API Routes
All routes are under `app/api`:

- `GET /api/status` — Service status/health
- `GET /api/live/games` — Current live games, possession, and teams not in game
- `POST /api/live/possession` — Poll ESPN and update possession for live games
- `POST /api/player-status` — Given player IDs, return per-player status
- `POST /api/live/summary` — Given player names or IDs, return relevant live games and in-zone status
- `GET /api/teams/:teamId/players` — Team roster grouped by side of ball
- `POST /api/schedule/seed` — Seed schedules (cron)
- `POST /api/schedule/refresh` — Refresh schedules (cron daily)
- `POST /api/live/scan` — Trigger live scan (cron minutely)
- `GET /api/watch` — Watch window data for a specific `eventId`

Route handlers live in `app/api/**/route.ts`.

### Live Possession Poller
- Path: `POST /api/live/possession`
- Body: none
- Effect: For games marked live or in the watch set, fetch ESPN scoreboard once and update Redis possession mapping for each game with current offense/defense. TTL controlled by `FZ_LIVE_TTL_SEC`.
 - Background option: run `npm run poller` to execute the same logic every ~1s without needing an external scheduler.

### Player Status
- Path: `POST /api/player-status`
- Body:
```json
{ "playerIds": ["uuid-1", "uuid-2"] }
```
- Response:
```json
{
  "players": {
    "uuid-1": { "status": "In Zone", "gameId": "1234567890" },
    "uuid-2": { "status": "Not Currently in Game" }
  }
}
```

### Live Games
- Path: `GET /api/live/games`
- Response:
```json
{
  "liveGames": [
    {
      "eventId": "1234567890",
      "matchup": "PHI @ DAL",
      "home": { "id": "uuid-home", "abbr": "DAL", "name": "Dallas Cowboys" },
      "away": { "id": "uuid-away", "abbr": "PHI", "name": "Philadelphia Eagles" },
      "possessionTeamId": "uuid-home",
      "defenseTeamId": "uuid-away",
      "possessionAbbr": "DAL",
      "defenseAbbr": "PHI",
      "lastUpdated": 1730736000000,
      "network": "FOX"
    }
  ],
  "teamsNotInGame": [
    { "id": "uuid-1", "abbr": "BUF", "name": "Buffalo Bills" }
  ]
}
```

### Watch (rate limited)
- Path: `GET /api/watch?eventId=1234567890`
- Notes: Requests are rate limited and may return `429 Too Many Requests`.
- Response:
```json
{
  "eventId": "1234567890",
  "clock": "07:12 Q2",
  "pos": "DAL 42",
  "down": "1st & 10",
  "rz": true,
  "g2g": false,
  "players": ["CeeDee Lamb", "Jalen Hurts"]
}
```

### Live Summary (mobile)
- Path: `POST /api/live/summary`
- Body (either `playerNames` or `playerIds` must be provided):
```json
{ "playerNames": ["CeeDee Lamb", "Jalen Hurts"] }
```
or
```json
{ "playerIds": ["uuid-1", "uuid-2"] }
```
- Response (only games relevant to submitted players are returned):
```json
{
  "games": [
    {
      "eventId": "1234567890",
      "startUtc": "2025-11-04T18:25:43.511Z",
      "home": { "abbr": "DAL", "name": "Dallas Cowboys" },
      "away": { "abbr": "PHI", "name": "Philadelphia Eagles" },
      "network": "FOX",
      "status": "live"
    }
  ],
  "playersByGame": {
    "1234567890": {
      "inZone": ["CeeDee Lamb"],
      "outOfZone": ["Jalen Hurts"]
    }
  },
  "notInGame": ["Some Other Player"]
}
```

## Admin UI
- Path: `/admin`
- Protection: Basic Auth via `middleware.ts`
- Credentials from `ADMIN_USER` and `ADMIN_PASS`

## Disco Simulation Mode
When no real live games are available, Disco can simulate live games so clients have data to render and test against.

- Admin toggle: Use the "Disco" button in `/admin` to start/stop
- Endpoints:
  - `POST /api/disco/start` — Seed simulated games (no-op if real games are live)
  - `POST /api/disco/stop` — Stop simulation and clear state
  - `GET /api/disco/state` — Inspect current Disco state
  - `POST /api/disco/step` — Advance simulation one tick (admin UI triggers this every ~1s while Disco is on)
- Behavior: API routes such as `GET /api/live/games`, `POST /api/live/summary`, and `GET /api/watch` will transparently serve Disco data if enabled and there are no real live games.

## Vercel Cron Jobs
Defined in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/schedule/seed", "schedule": "0 9 * * MON" },
    { "path": "/api/schedule/refresh", "schedule": "0 9 * * *" },
    { "path": "/api/live/scan", "schedule": "*/1 * * * *" }
  ]
}
```

In Vercel, ensure Cron Jobs are enabled for the project.

## Project Structure (high level)
```
app/
  admin/                 # Admin UI (Basic Auth protected)
  api/
    live/                # live scan + in-zone
    schedule/            # seed + refresh
    status/              # status endpoint
    watch/               # watch window
lib/
  db/                    # Drizzle + Neon setup and schema
  espn/                  # Data sources (scoreboard, summary, pbp)
  env.ts                 # Zod env validation + flags
migrations/              # Drizzle migrations output
drizzle.config.ts        # Drizzle config (reads .env.local/.env)
vercel.json              # Cron jobs
```

## Deployment
- Recommended: Vercel
- Set all environment variables in the Vercel project settings
- Ensure Neon connection string uses SSL (e.g., `sslmode=require`)
- Upstash Redis REST URL/Token must be set
- Cron Jobs are taken from `vercel.json`

## Troubleshooting
- Env validation errors: verify variables against `lib/env.ts`
- DB connection issues: confirm `NEON_DATABASE_URL` and SSL options
- Rate limiting: check Upstash credentials and quotas
- Admin access: verify `ADMIN_USER`/`ADMIN_PASS` and that requests send `Authorization: Basic ...`

---

Made with Next.js, Drizzle, Neon, and Upstash.


