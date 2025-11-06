export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { fetchWatchSummary } from '@/lib/espn/summary';
import { redis, keys } from '@/lib/redis';
import { getClientIp, watchLimiter } from '@/lib/ratelimit';
import { getDiscoGames, isDiscoEnabled } from '@/lib/disco';

const Query = z.object({ eventId: z.string().min(1) });

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const limited = await watchLimiter.limit(ip || 'unknown');
  if (!limited.success) return new Response('Too Many Requests', { status: 429 });
  const { searchParams } = new URL(req.url);
  const parsed = Query.safeParse({ eventId: searchParams.get('eventId') });
  if (!parsed.success) return new Response('Bad Request', { status: 400 });
  const { eventId } = parsed.data;

  // If Disco is enabled and this eventId is a Disco game, bypass ESPN
  try {
    if (await isDiscoEnabled()) {
      const discoGames = await getDiscoGames();
      if (discoGames.some((g) => g.eventId === eventId)) {
        const [cached, players] = await Promise.all([
          redis.get<any>(keys.gameFlags(eventId)),
          redis.get<string[]>(keys.players(eventId)),
        ]);
        const body = {
          eventId,
          clock: null,
          pos: null,
          down: null,
          rz: Boolean(cached?.inRedZone),
          g2g: Boolean(cached?.goalToGo),
          players: Array.isArray(players) ? players : [],
        };
        console.log('[API][watch][disco] resp', body);
        return Response.json(body, { headers: { 'cache-control': 'no-store' } });
      }
    }
  } catch {
    // fall through to normal behavior
  }

  const [cached, players] = await Promise.all([
    redis.get<any>(keys.gameFlags(eventId)),
    redis.get<string[]>(keys.players(eventId)),
  ]);
  let summary = null as any;
  try {
    summary = await fetchWatchSummary(eventId);
  } catch {
    // fallback to flags only
  }
  const body = {
    eventId,
    clock: summary?.clock ?? null,
    pos: summary?.possession ?? null,
    down: summary?.downAndDistance ?? null,
    rz: Boolean(cached?.inRedZone ?? summary?.redZone),
    g2g: Boolean(cached?.goalToGo ?? summary?.goalToGo),
    players: Array.isArray(players) ? players : [],
  };
  console.log('[API][watch] resp', body);
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
}
