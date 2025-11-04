-- Enable UUID generation if not available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enum for side of ball
DO $$ BEGIN
  CREATE TYPE side_of_ball AS ENUM ('offense', 'defense', 'special_teams', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  abbr text NOT NULL UNIQUE,
  name text NOT NULL
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  position text NOT NULL,
  side_of_ball side_of_ball NOT NULL DEFAULT 'unknown'
);


