export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { redis, keys } from '@/lib/redis';
import { fetchPbp } from '@/lib/espn/pbp';
import { flags } from '@/lib/env';

export async function POST() {
  const watch = await redis.smembers<string>(keys.watchSet);
  const slice = watch.slice(0, flags.scanConcurrency);
  let updated = 0;
  console.log('[API][scan] start', { watchCount: watch.length, processing: slice.length });
  await Promise.all(slice.map(async (eventId) => {
    try {
      const pbp = await fetchPbp(eventId);
      await redis.set(keys.lastPlayId(eventId), pbp.lastPlayId ?? '');
      await redis.set(keys.gameFlags(eventId), { inRedZone: pbp.redZone, goalToGo: pbp.goalToGo });
      updated++;
    } catch (e) {
      console.error('[API][scan] error', { eventId, error: (e as Error)?.message });
    }
  }));
  console.log('[API][scan] done', { updated });
  return Response.json({ updated }, { headers: { 'cache-control': 'no-store' } });
}

