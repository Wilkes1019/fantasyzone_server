export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db } from '@/lib/db/drizzle';
import { games, teams } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { redis, keys } from '@/lib/redis';
import { updateLivePossession } from '@/lib/live/possession';
import { getDiscoGames, isDiscoEnabled } from '@/lib/disco';

type LiveGameOut = {
  eventId: string;
  matchup: string;
  home: { id: string | null; abbr: string; name: string };
  away: { id: string | null; abbr: string; name: string };
  possessionTeamId: string | null;
  defenseTeamId: string | null;
  possessionAbbr?: string | null;
  defenseAbbr?: string | null;
  lastUpdated: number | null;
  network: string | null;
};

export async function GET() {
  try {
    // Load live games from DB and also include any games currently in the watch set
    const dbLive = await db.select().from(games).where(eq(games.status, 'live'));
    const watchIds = await redis.smembers<string[]>(keys.watchSet).catch(() => [] as string[]);
    const extraByWatch = watchIds.length > 0
      ? await db.select().from(games).where(inArray(games.eventId, watchIds))
      : [] as typeof dbLive;
    const seen = new Set<string>();
    const live = [...dbLive, ...extraByWatch].filter((g) => {
      if (seen.has(g.eventId)) return false;
      seen.add(g.eventId);
      return true;
    });

    // If no real live games and Disco is enabled, return Disco games
    if (live.length === 0 && (await isDiscoEnabled())) {
      const discoGames = await getDiscoGames();
      if (discoGames.length > 0) {
        const abbrs = new Set<string>();
        for (const g of discoGames) {
          if (g.homeAbbr) abbrs.add(g.homeAbbr.toUpperCase());
          if (g.awayAbbr) abbrs.add(g.awayAbbr.toUpperCase());
        }

        const abbrList = Array.from(abbrs).filter(Boolean);
        const teamRows = abbrList.length > 0 ? await db.select().from(teams).where(inArray(teams.abbr, abbrList)) : [];
        const abbrToTeam = new Map<string, { id: string; abbr: string; name: string }>(
          teamRows.map((t) => [t.abbr.toUpperCase(), { id: t.id, abbr: t.abbr, name: t.name }])
        );

        const possessionEntries = await Promise.all(
          discoGames.map(async (g) => [g.eventId, await redis.get<{ possession_team_id?: string; defense_team_id?: string; last_updated?: number }>(keys.possessionState(g.eventId))] as const)
        );
        const posByEvent = new Map<string, { possession_team_id?: string; defense_team_id?: string; last_updated?: number } | null>(
          possessionEntries.map(([id, st]) => [id, st || null])
        );

        const liveGames = discoGames.map((g) => {
          const homeTeam = abbrToTeam.get(g.homeAbbr.toUpperCase()) || null;
          const awayTeam = abbrToTeam.get(g.awayAbbr.toUpperCase()) || null;
          const pos = posByEvent.get(g.eventId) || null;
          const possessionAbbr = pos?.possession_team_id && homeTeam?.id === pos.possession_team_id ? g.homeAbbr
            : pos?.possession_team_id && awayTeam?.id === pos.possession_team_id ? g.awayAbbr
            : null;
          const defenseAbbr = pos?.defense_team_id && homeTeam?.id === pos.defense_team_id ? g.homeAbbr
            : pos?.defense_team_id && awayTeam?.id === pos.defense_team_id ? g.awayAbbr
            : null;
          return {
            eventId: g.eventId,
            matchup: `${g.awayAbbr} @ ${g.homeAbbr}`,
            home: { id: homeTeam?.id ?? null, abbr: g.homeAbbr, name: homeTeam?.name ?? g.homeAbbr },
            away: { id: awayTeam?.id ?? null, abbr: g.awayAbbr, name: awayTeam?.name ?? g.awayAbbr },
            possessionTeamId: (pos?.possession_team_id as string | undefined) ?? null,
            defenseTeamId: (pos?.defense_team_id as string | undefined) ?? null,
            possessionAbbr,
            defenseAbbr,
            lastUpdated: (pos?.last_updated as number | undefined) ?? null,
            network: g.network ?? null,
          } as LiveGameOut;
        });

        const allTeams = await db.select().from(teams);
        const liveAbbrs = new Set(liveGames.flatMap((g) => [g.home.abbr.toUpperCase(), g.away.abbr.toUpperCase()]));
        const teamsNotInGame = allTeams
          .filter((t) => !liveAbbrs.has((t.abbr || '').toUpperCase()))
          .map((t) => ({ id: t.id, abbr: t.abbr, name: t.name }));

        return Response.json({ liveGames, teamsNotInGame }, { headers: { 'cache-control': 'no-store' } });
      }
    }

    // Collect team abbrs from games
    const abbrs = new Set<string>();
    const parsed = live.map((g) => {
      const home = (g.homeTeam as any) || {};
      const away = (g.awayTeam as any) || {};
      const homeAbbr = String(home?.abbr || home?.name || '').toUpperCase();
      const awayAbbr = String(away?.abbr || away?.name || '').toUpperCase();
      if (homeAbbr) abbrs.add(homeAbbr);
      if (awayAbbr) abbrs.add(awayAbbr);
      return {
        eventId: g.eventId,
        network: g.network ?? null,
        home: { abbr: homeAbbr, name: String(home?.name || homeAbbr || '') },
        away: { abbr: awayAbbr, name: String(away?.name || awayAbbr || '') },
      };
    });

    // Map abbr -> team row (id)
    const abbrList = Array.from(abbrs).filter(Boolean);
    const teamRows = abbrList.length > 0 ? await db.select().from(teams).where(inArray(teams.abbr, abbrList)) : [];
    const abbrToTeam = new Map<string, { id: string; abbr: string; name: string }>(
      teamRows.map((t) => [t.abbr.toUpperCase(), { id: t.id, abbr: t.abbr, name: t.name }])
    );

    // Load possession states; if any missing, opportunistically refresh from ESPN once
    const possessionEntries = await Promise.all(
      live.map(async (g) => [g.eventId, await redis.get<{ possession_team_id?: string; defense_team_id?: string; last_updated?: number }>(keys.possessionState(g.eventId))] as const)
    );
    let posByEvent = new Map<string, { possession_team_id?: string; defense_team_id?: string; last_updated?: number } | null>(
      possessionEntries.map(([id, st]) => [id, st || null])
    );
    const anyMissing = Array.from(posByEvent.values()).some((v) => !v || !v.possession_team_id || !v.defense_team_id);
    if (anyMissing) {
      try {
        await updateLivePossession();
        const second = await Promise.all(
          live.map(async (g) => [g.eventId, await redis.get<{ possession_team_id?: string; defense_team_id?: string; last_updated?: number }>(keys.possessionState(g.eventId))] as const)
        );
        posByEvent = new Map<string, { possession_team_id?: string; defense_team_id?: string; last_updated?: number } | null>(
          second.map(([id, st]) => [id, st || null])
        );
      } catch {
        // ignore; best-effort
      }
    }

    const liveGames: LiveGameOut[] = parsed.map((g) => {
      const pos = posByEvent.get(g.eventId) || null;
      const homeTeam = abbrToTeam.get(g.home.abbr) || null;
      const awayTeam = abbrToTeam.get(g.away.abbr) || null;
      const possessionAbbr = pos?.possession_team_id && homeTeam?.id === pos.possession_team_id ? g.home.abbr
        : pos?.possession_team_id && awayTeam?.id === pos.possession_team_id ? g.away.abbr
        : null;
      const defenseAbbr = pos?.defense_team_id && homeTeam?.id === pos.defense_team_id ? g.home.abbr
        : pos?.defense_team_id && awayTeam?.id === pos.defense_team_id ? g.away.abbr
        : null;
      return {
        eventId: g.eventId,
        matchup: `${g.away.abbr} @ ${g.home.abbr}`,
        home: { id: homeTeam?.id ?? null, abbr: g.home.abbr, name: g.home.name },
        away: { id: awayTeam?.id ?? null, abbr: g.away.abbr, name: g.away.name },
        possessionTeamId: (pos?.possession_team_id as string | undefined) ?? null,
        defenseTeamId: (pos?.defense_team_id as string | undefined) ?? null,
        possessionAbbr,
        defenseAbbr,
        lastUpdated: (pos?.last_updated as number | undefined) ?? null,
        network: g.network,
      };
    });

    // Teams not currently in any live game
    const allTeams = await db.select().from(teams);
    const liveAbbrs = new Set(liveGames.flatMap((g) => [g.home.abbr.toUpperCase(), g.away.abbr.toUpperCase()]));
    const teamsNotInGame = allTeams
      .filter((t) => !liveAbbrs.has((t.abbr || '').toUpperCase()))
      .map((t) => ({ id: t.id, abbr: t.abbr, name: t.name }));

    return Response.json({ liveGames, teamsNotInGame }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('[API][live/games] error', (e as Error)?.message);
    return new Response('internal_error', { status: 500 });
  }
}


