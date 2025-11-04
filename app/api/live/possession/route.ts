export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { updateLivePossession } from '@/lib/live/possession';

export async function POST() {
  try {
    const { updated } = await updateLivePossession();
    console.log('[API][live/possession] updated', { updated });
    return Response.json({ updated }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('[API][live/possession] error', (e as Error)?.message);
    return new Response('internal_error', { status: 500 });
  }
}


