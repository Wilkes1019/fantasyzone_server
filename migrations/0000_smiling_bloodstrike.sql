DO $$ BEGIN
 CREATE TYPE "public"."side_of_ball" AS ENUM('offense', 'defense', 'special_teams', 'unknown');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"start_utc" timestamp with time zone NOT NULL,
	"home_team" jsonb NOT NULL,
	"away_team" jsonb NOT NULL,
	"network" text,
	"status" text NOT NULL,
	"last_play_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"position" text NOT NULL,
	"side_of_ball" "side_of_ball" DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"abbr" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "teams_abbr_unique" UNIQUE("abbr")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
