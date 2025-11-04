import { db } from '@/lib/db/drizzle';
import { games, teams } from '@/lib/db/schema';
import { inArray, eq } from 'drizzle-orm';
import { redis, keys } from '@/lib/redis';
import { flags } from '@/lib/env';
import { fetchEventSituation } from '@/lib/espn/summary';

export async function updateLivePossession(): Promise<{ updated: number; checked: number }>{
  // Build the set of eventIds we care about: DB live + watch set
  const [dbLive, watchIds] = await Promise.all([
    db.select().from(games).where(eq(games.status, 'live')),
    redis.smembers<string[]>(keys.watchSet).catch(() => [] as string[]),
  ]);
  const targets = new Set<string>();
  for (const g of dbLive) targets.add(g.eventId);
  for (const id of watchIds) targets.add(id);
  const eventIds = Array.from(targets);
  if (eventIds.length === 0) return { updated: 0, checked: 0 };

  // Fetch per-event situations from summary (works even when daily scoreboard is empty)
  type Needed = { eventId: string; offAbbr: string; defAbbr: string };
  const needed: Needed[] = [];
  const situations = await Promise.all(eventIds.map((id) => fetchEventSituation(id)));
  for (const s of situations) {
    if (!s) continue;
    if (!s.possessionEspnTeamId) continue;
    const homeIsOff = s.possessionEspnTeamId === s.home.id;
    const awayIsOff = s.possessionEspnTeamId === s.away.id;
    if (!homeIsOff && !awayIsOff) continue;
    const offAbbr = homeIsOff ? s.home.abbr : s.away.abbr;
    const defAbbr = homeIsOff ? s.away.abbr : s.home.abbr;
    if (!offAbbr || !defAbbr) continue;
    needed.push({ eventId: s.eventId, offAbbr: String(offAbbr).toUpperCase(), defAbbr: String(defAbbr).toUpperCase() });
  }

  if (needed.length === 0) return { updated: 0, checked: eventIds.length };

  // Resolve abbr -> team id from DB
  const abbrSet = new Set<string>();
  for (const n of needed) { abbrSet.add(n.offAbbr); abbrSet.add(n.defAbbr); }
  const abbrList = Array.from(abbrSet);
  const teamRows = await db.select().from(teams).where(inArray(teams.abbr, abbrList));
  const abbrToTeam = new Map(teamRows.map((t) => [t.abbr.toUpperCase(), t]));

  // Write possession to Redis + maintain watch set and mark game live
  let updated = 0;
  const ttl = flags.liveTtlSec;
  await Promise.all(needed.map(async (n) => {
    const offTeam = abbrToTeam.get(n.offAbbr);
    const defTeam = abbrToTeam.get(n.defAbbr);
    if (!offTeam || !defTeam) return;
    const payload = {
      possession_team_id: offTeam.id,
      defense_team_id: defTeam.id,
      last_updated: Date.now(),
      status: 'live' as const,
    };
    try {
      await Promise.all([
        redis.set(keys.possessionState(n.eventId), payload, { ex: ttl }),
        redis.set(keys.teamCurrentGame(offTeam.id), n.eventId, { ex: ttl }),
        redis.set(keys.teamCurrentGame(defTeam.id), n.eventId, { ex: ttl }),
        redis.sadd(keys.watchSet, n.eventId),
        db.update(games).set({ status: 'live', updatedAt: new Date() }).where(eq(games.eventId, n.eventId)),
      ]);
      updated++;
    } catch (e) {
      console.error('[live/possession] write error', { eventId: n.eventId, error: (e as Error)?.message });
    }
  }));

  return { updated, checked: eventIds.length };
}


