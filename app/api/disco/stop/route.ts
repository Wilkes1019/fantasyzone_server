export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { stopDisco } from '@/lib/disco';

export async function POST() {
  try {
    await stopDisco();
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('[API][disco/stop] error', (e as Error)?.message);
    return new Response('internal_error', { status: 500 });
  }
}


