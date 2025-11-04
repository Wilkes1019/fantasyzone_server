CREATE TABLE IF NOT EXISTS "games" (
  "id" serial PRIMARY KEY,
  "event_id" text NOT NULL UNIQUE,
  "start_utc" timestamptz NOT NULL,
  "home_team" jsonb NOT NULL,
  "away_team" jsonb NOT NULL,
  "network" text,
  "status" text NOT NULL,
  "last_play_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_games_start_utc ON "games" ("start_utc");

