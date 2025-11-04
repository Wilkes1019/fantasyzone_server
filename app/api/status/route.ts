export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { computeGlobalStatus } from '@/lib/status';

export async function GET() {
  const body = await computeGlobalStatus();
  console.log('[API][status] resp', body);
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
}

