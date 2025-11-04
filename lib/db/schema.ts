import { pgTable, serial, text, timestamp, jsonb, uuid, pgEnum } from 'drizzle-orm/pg-core';

export const games = pgTable('games', {
  id: serial('id').primaryKey(),
  eventId: text('event_id').notNull().unique(),
  startUtc: timestamp('start_utc', { withTimezone: true }).notNull(),
  homeTeam: jsonb('home_team').notNull(),
  awayTeam: jsonb('away_team').notNull(),
  network: text('network'),
  status: text('status').notNull(),
  lastPlayId: text('last_play_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type GameRow = typeof games.$inferSelect;
export type NewGameRow = typeof games.$inferInsert;

// side_of_ball enum
export const sideOfBallEnum = pgEnum('side_of_ball', ['offense', 'defense', 'special_teams', 'unknown']);

// Teams
export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  abbr: text('abbr').notNull().unique(),
  name: text('name').notNull(),
});

export type TeamRow = typeof teams.$inferSelect;
export type NewTeamRow = typeof teams.$inferInsert;

// Players
export const players = pgTable('players', {
  id: uuid('id').defaultRandom().primaryKey(),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  fullName: text('full_name').notNull(),
  position: text('position').notNull(),
  sideOfBall: sideOfBallEnum('side_of_ball').notNull().default('unknown'),
});

export type PlayerRow = typeof players.$inferSelect;
export type NewPlayerRow = typeof players.$inferInsert;

