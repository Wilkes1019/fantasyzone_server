export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getDiscoState } from '@/lib/disco';

export async function GET() {
  try {
    const state = await getDiscoState();
    return Response.json({ ok: true, ...state }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('[API][disco/state] error', (e as Error)?.message);
    return new Response('internal_error', { status: 500 });
  }
}


