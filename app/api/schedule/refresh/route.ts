export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db } from '@/lib/db/drizzle';
import { games } from '@/lib/db/schema';
import { between, eq } from 'drizzle-orm';
import { fetchScoreboardRange } from '@/lib/espn/scoreboard';
import { redis, keys } from '@/lib/redis';

export async function POST() {
  const now = new Date();
  const windows = [48, 12, 3];
  let updated = 0;
  let deleted = 0;
  for (const hrs of windows) {
    const start = new Date(now);
    const end = new Date(now);
    end.setUTCHours(end.getUTCHours() + hrs);
    console.log('[API][refresh] window', { hrs, from: start.toISOString(), to: end.toISOString() });
    const due = await db.select().from(games).where(between(games.startUtc, start, end));
    if (due.length === 0) continue;
    const list = await fetchScoreboardRange(start, end);
    for (const g of list) {
      await db.update(games).set({
        startUtc: new Date(g.startUtc),
        homeTeam: g.teams.home,
        awayTeam: g.teams.away,
        network: g.network ?? undefined,
        status: g.status,
        updatedAt: new Date(),
      }).where(eq(games.eventId, g.eventId));

      // auto-manage watch set based on game status
      if (g.status === 'live') {
        await redis.sadd(keys.watchSet, g.eventId);
      } else if (g.status === 'final') {
        await redis.srem(keys.watchSet, g.eventId);
      }

      updated++;
    }
  }

  // also refresh recent past windows to capture games that have completed
  const lookbacks = [48, 24];
  for (const hrs of lookbacks) {
    const start = new Date(now);
    start.setUTCHours(start.getUTCHours() - hrs);
    const end = new Date(now);
    console.log('[API][refresh] lookback window', { hrs, from: start.toISOString(), to: end.toISOString() });
    const due = await db.select().from(games).where(between(games.startUtc, start, end));
    if (due.length === 0) continue;
    const list = await fetchScoreboardRange(start, end);
    for (const g of list) {
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
  // remove games that are final based on latest scoreboard status
  const removed = await db.delete(games).where(eq(games.status, 'final')).returning({ id: games.id });
  deleted = removed.length;
  console.log('[API][refresh] done', { updated, deleted });
  return Response.json({ updated, deleted }, { headers: { 'cache-control': 'no-store' } });
}

