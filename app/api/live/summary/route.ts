export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { getClientIp, watchLimiter } from '@/lib/ratelimit';
import { db } from '@/lib/db/drizzle';
import { games, players, teams } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { redis, keys } from '@/lib/redis';
import { getDiscoGames, isDiscoEnabled } from '@/lib/disco';

const Body = z.object({
  playerIds: z.array(z.string().min(1)).min(1).max(200).optional(),
  playerNames: z.array(z.string().min(1)).min(1).max(200).optional(),
}).refine((val) => (Array.isArray(val.playerIds) && val.playerIds.length > 0) || (Array.isArray(val.playerNames) && val.playerNames.length > 0), {
  message: 'playerIds or playerNames is required',
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limited = await watchLimiter.limit(ip || 'unknown');
  if (!limited.success) return new Response('Too Many Requests', { status: 429 });

  let json: unknown = null;
  try {
    json = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const playerIds = Array.isArray(parsed.data.playerIds) ? parsed.data.playerIds : [];
  const playerNames = Array.isArray(parsed.data.playerNames) ? parsed.data.playerNames : [];
  const usingNames = playerNames.length > 0;

  // If Disco is enabled and there are no real live games, serve Disco summary
  try {
    if (await isDiscoEnabled()) {
      const realLive = await db.select().from(games).where(eq(games.status, 'live'));
      const discoGames = await getDiscoGames();
      if (realLive.length === 0 && discoGames.length > 0) {
        const abbrs = new Set<string>();
        for (const g of discoGames) {
          abbrs.add(g.homeAbbr.toUpperCase());
          abbrs.add(g.awayAbbr.toUpperCase());
        }
        const abbrList = Array.from(abbrs);
        const teamRows = abbrList.length > 0 ? await db.select().from(teams).where(inArray(teams.abbr, abbrList)) : [];
        const abbrToEventId = new Map<string, string>();
        for (const g of discoGames) {
          abbrToEventId.set(g.homeAbbr.toUpperCase(), g.eventId);
          abbrToEventId.set(g.awayAbbr.toUpperCase(), g.eventId);
        }

        const gamesOut = discoGames.map((g) => ({
          eventId: g.eventId,
          startUtc: new Date().toISOString(),
          home: { abbr: g.homeAbbr, name: teamRows.find((t) => t.abbr.toUpperCase() === g.homeAbbr.toUpperCase())?.name },
          away: { abbr: g.awayAbbr, name: teamRows.find((t) => t.abbr.toUpperCase() === g.awayAbbr.toUpperCase())?.name },
          network: g.network ?? null,
          status: 'live' as const,
        }));

        const possessionEntries = await Promise.all(
          discoGames.map(async (dg) => [dg.eventId, await redis.get<{ possession_team_id: string; defense_team_id: string; last_updated?: number }>(keys.possessionState(dg.eventId))] as const)
        );
        const gameToPossession = new Map<string, { possession_team_id: string; defense_team_id: string; last_updated?: number } | null>(
          possessionEntries.map(([id, state]) => [id, state || null])
        );

        const playerRows = usingNames
          ? await db.select().from(players).where(inArray(players.fullName, playerNames))
          : await db.select().from(players).where(inArray(players.id, playerIds));
        const teamIds = Array.from(new Set(playerRows.map((p) => p.teamId)));
        const allTeamRows = teamIds.length > 0 ? await db.select().from(teams).where(inArray(teams.id, teamIds)) : [];
        const teamIdToAbbr = new Map(allTeamRows.map((t) => [t.id, (t.abbr || '').toUpperCase()]));

        const playersByGame: Record<string, { inZone: string[]; outOfZone: string[] }> = {};
        const notInGame: string[] = [];

        for (const p of playerRows) {
          const teamAbbr = teamIdToAbbr.get(p.teamId) || '';
          const eventId = teamAbbr ? abbrToEventId.get(teamAbbr) || null : null;
          if (!eventId) {
            notInGame.push(usingNames ? p.fullName : p.id);
            continue;
          }
          const state = gameToPossession.get(eventId);
          if (!state) {
            notInGame.push(usingNames ? p.fullName : p.id);
            continue;
          }
          let inZone = false;
          if (p.sideOfBall === 'offense' && p.teamId === state.possession_team_id) inZone = true;
          if (p.sideOfBall === 'defense' && p.teamId === state.defense_team_id) inZone = true;
          if (!playersByGame[eventId]) playersByGame[eventId] = { inZone: [], outOfZone: [] };
          if (inZone) playersByGame[eventId].inZone.push(usingNames ? p.fullName : p.id);
          else playersByGame[eventId].outOfZone.push(usingNames ? p.fullName : p.id);
        }

        const resolvedKeys = new Set(usingNames ? playerRows.map((p) => p.fullName) : playerRows.map((p) => p.id));
        const requestedKeys = usingNames ? playerNames : playerIds;
        for (const key of requestedKeys) {
          if (!resolvedKeys.has(key) && !notInGame.includes(key)) notInGame.push(key);
        }

        const relevantEventIds = new Set(
          Object.entries(playersByGame)
            .filter(([, grp]) => (grp.inZone.length + grp.outOfZone.length) > 0)
            .map(([eid]) => eid)
        );
        const filteredGames = gamesOut.filter((g) => relevantEventIds.has(g.eventId));

        return Response.json({ games: filteredGames, playersByGame, notInGame }, { headers: { 'cache-control': 'no-store' } });
      }
    }
  } catch {
    // fall through to default behavior
  }

  // 1) Load live games from DB and build abbr -> eventId map
  const liveGames = await db.select().from(games).where(eq(games.status, 'live'));
  const abbrToEventId = new Map<string, string>();
  const gamesOut = liveGames.map((g) => {
    const home = g.homeTeam as any;
    const away = g.awayTeam as any;
    const homeAbbr = String(home?.abbr || '').toUpperCase();
    const awayAbbr = String(away?.abbr || '').toUpperCase();
    if (homeAbbr) abbrToEventId.set(homeAbbr, g.eventId);
    if (awayAbbr) abbrToEventId.set(awayAbbr, g.eventId);
    return {
      eventId: g.eventId,
      startUtc: new Date(g.startUtc as unknown as string).toISOString(),
      home: { abbr: home?.abbr ?? home?.name, name: home?.name },
      away: { abbr: away?.abbr ?? away?.name, name: away?.name },
      network: g.network ?? null,
      status: g.status,
    };
  });

  // 2) Load possession state from Redis for live games
  const eventIds = liveGames.map((g) => g.eventId);
  const possessionEntries = await Promise.all(
    eventIds.map(async (id) => [id, await redis.get<{ possession_team_id: string; defense_team_id: string; last_updated?: number }>(keys.possessionState(id))] as const)
  );
  const gameToPossession = new Map<string, { possession_team_id: string; defense_team_id: string; last_updated?: number } | null>(
    possessionEntries.map(([id, state]) => [id, state || null])
  );

  // 3) Fetch players + teams and compute per-player status grouped by game
  const playerRows = usingNames
    ? await db.select().from(players).where(inArray(players.fullName, playerNames))
    : await db.select().from(players).where(inArray(players.id, playerIds));
  const teamIds = Array.from(new Set(playerRows.map((p) => p.teamId)));
  const teamRows = teamIds.length > 0 ? await db.select().from(teams).where(inArray(teams.id, teamIds)) : [];
  const teamIdToAbbr = new Map(teamRows.map((t) => [t.id, (t.abbr || '').toUpperCase()]));

  const playersByGame: Record<string, { inZone: string[]; outOfZone: string[] }> = {};
  const notInGame: string[] = [];

  for (const p of playerRows) {
    const teamAbbr = teamIdToAbbr.get(p.teamId) || '';
    const eventId = teamAbbr ? abbrToEventId.get(teamAbbr) || null : null;
    if (!eventId) {
      notInGame.push(usingNames ? p.fullName : p.id);
      continue;
    }
    const state = gameToPossession.get(eventId);
    if (!state) {
      notInGame.push(usingNames ? p.fullName : p.id);
      continue;
    }

    let inZone = false;
    if (p.sideOfBall === 'offense' && p.teamId === state.possession_team_id) inZone = true;
    if (p.sideOfBall === 'defense' && p.teamId === state.defense_team_id) inZone = true;

    if (!playersByGame[eventId]) playersByGame[eventId] = { inZone: [], outOfZone: [] };
    if (inZone) playersByGame[eventId].inZone.push(usingNames ? p.fullName : p.id);
    else playersByGame[eventId].outOfZone.push(usingNames ? p.fullName : p.id);
  }

  // Add any requested playerIds that didn't resolve to DB rows as notInGame
  const resolvedKeys = new Set(usingNames ? playerRows.map((p) => p.fullName) : playerRows.map((p) => p.id));
  const requestedKeys = usingNames ? playerNames : playerIds;
  for (const key of requestedKeys) {
    if (!resolvedKeys.has(key) && !notInGame.includes(key)) notInGame.push(key);
  }

  const relevantEventIds = new Set(
    Object.entries(playersByGame)
      .filter(([, grp]) => (grp.inZone.length + grp.outOfZone.length) > 0)
      .map(([eid]) => eid)
  );
  const filteredGames = gamesOut.filter((g) => relevantEventIds.has(g.eventId));

  return Response.json({ games: filteredGames, playersByGame, notInGame }, { headers: { 'cache-control': 'no-store' } });
}


