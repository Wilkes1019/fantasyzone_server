export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { hasRealLiveGames, seedGames } from '@/lib/disco';

export async function POST() {
  try {
    if (await hasRealLiveGames()) {
      return Response.json({ ok: false, reason: 'real_live_games_present' }, { headers: { 'cache-control': 'no-store' } });
    }
    const games = await seedGames();
    return Response.json({ ok: true, games }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('[API][disco/start] error', (e as Error)?.message);
    return new Response('internal_error', { status: 500 });
  }
}


