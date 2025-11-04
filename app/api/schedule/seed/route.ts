export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fetchScoreboardRange } from '@/lib/espn/scoreboard';
import { db } from '@/lib/db/drizzle';
import { games } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { redis, keys } from '@/lib/redis';

export async function POST() {
  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 7);
  console.log('[API][seed] range', { from: now.toISOString(), to: end.toISOString() });
  const list = await fetchScoreboardRange(now, end);

  let inserted = 0;
  let updated = 0;
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
  console.log('[API][seed] done', { total: list.length, inserted, updated });
  return Response.json({ inserted, updated }, { headers: { 'cache-control': 'no-store' } });
}

