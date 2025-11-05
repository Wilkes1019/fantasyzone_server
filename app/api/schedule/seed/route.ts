export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fetchScoreboardRange } from '@/lib/espn/scoreboard';
import { db } from '@/lib/db/drizzle';
import { games } from '@/lib/db/schema';
import { eq, lt } from 'drizzle-orm';
import { redis, keys } from '@/lib/redis';

export async function POST() {
  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 7);
  console.log('[API][seed] range', { from: now.toISOString(), to: end.toISOString() });
  const list = await fetchScoreboardRange(now, end);

  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  for (const g of list) {
    const existing = await db.select().from(games).where(eq(games.eventId, g.eventId)).limit(1);
    if (existing.length === 0) {
      await db.insert(games).values({
        eventId: g.eventId,
        startUtc: new Date(g.startUtc),
        homeTeam: g.teams.home,
        awayTeam: g.teams.away,
        network: g.network ?? undefined,
        status: g.status,
      });
      // auto-manage watch set on insert
      if (g.status === 'live') {
        await redis.sadd(keys.watchSet, g.eventId);
      } else if (g.status === 'final') {
        await redis.srem(keys.watchSet, g.eventId);
      }
      inserted++;
    } else {
      await db.update(games).set({
        startUtc: new Date(g.startUtc),
        homeTeam: g.teams.home,
        awayTeam: g.teams.away,
        network: g.network ?? undefined,
        status: g.status,
        updatedAt: new Date(),
      }).where(eq(games.eventId, g.eventId));
      // auto-manage watch set on update
      if (g.status === 'live') {
        await redis.sadd(keys.watchSet, g.eventId);
      } else if (g.status === 'final') {
        await redis.srem(keys.watchSet, g.eventId);
      }
      updated++;
    }
  }

  // Lookback phase: refresh historical days that already exist in DB (all startUtc < today UTC)
  const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const historical = await db.select().from(games).where(lt(games.startUtc, startOfTodayUtc));
  if (historical.length > 0) {
    const dayKey = (d: Date) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}${m}${day}`;
    };
    const uniqueDays = Array.from(new Set(historical.map((r) => dayKey(new Date(r.startUtc as unknown as string)))));
    for (const key of uniqueDays) {
      const y = Number(key.slice(0, 4));
      const m = Number(key.slice(4, 6)) - 1;
      const d = Number(key.slice(6, 8));
      const dayDate = new Date(Date.UTC(y, m, d));
      const { fetchScoreboardDay } = await import('@/lib/espn/scoreboard');
      const dayGames = await fetchScoreboardDay(dayDate);
      for (const g of dayGames) {
        const exists = await db.select().from(games).where(eq(games.eventId, g.eventId)).limit(1);
        if (exists.length === 0) continue; // do not insert during lookback
        await db.update(games).set({
          startUtc: new Date(g.startUtc),
          homeTeam: g.teams.home,
          awayTeam: g.teams.away,
          network: g.network ?? undefined,
          status: g.status,
          updatedAt: new Date(),
        }).where(eq(games.eventId, g.eventId));
        if (g.status === 'live') {
          await redis.sadd(keys.watchSet, g.eventId);
        } else if (g.status === 'final') {
          await redis.srem(keys.watchSet, g.eventId);
        }
        updated++;
      }
    }
  }

  // Cleanup: remove games that are final
  const removed = await db.delete(games).where(eq(games.status, 'final')).returning({ id: games.id });
  deleted = removed.length;

  console.log('[API][seed] done', { future: list.length, inserted, updated, deleted });
  return Response.json({ inserted, updated, deleted }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET() {
  return POST();
}

