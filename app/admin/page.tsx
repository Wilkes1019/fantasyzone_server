export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { games } from '@/lib/db/schema';
import { ControlsClient } from './ControlsClient';
import { EventsTableClient } from './EventsTableClient';
import { AdminTabsClient } from './AdminTabsClient';

async function trigger(path: string) {
  'use server';
  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || 'http';
  const base = `${proto}://${host}`;
  await fetch(`${base}${path}`, { method: 'POST', cache: 'no-store' });
  revalidatePath('/admin');
}

export default async function AdminPage() {
  const rows = await db.select().from(games);
  const eventRows = rows.map((r) => {
    const home = r.homeTeam as any;
    const away = r.awayTeam as any;
    const startIso = new Date(r.startUtc as unknown as string).toISOString();
    return {
      eventId: String(r.eventId),
      startIso,
      matchup: `${away?.abbr ?? away?.name} @ ${home?.abbr ?? home?.name}`,
      network: String(r.network ?? ''),
      status: String(r.status),
    };
  });
  return (
    <main className="stack">
      <div className="grid">
        <ControlsClient
          seed={async (_prev, _fd) => { 'use server'; await trigger('/api/schedule/seed'); return 'Added next 7 days of Games to database'; }}
          disco={async (_prev, _fd) => {
            'use server';
            const h = headers();
            const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
            const proto = h.get('x-forwarded-proto') || 'http';
            const base = `${proto}://${host}`;
            // Check current state
            const stateResp = await fetch(`${base}/api/disco/state`, { cache: 'no-store' });
            const state = stateResp.ok ? await stateResp.json() : { enabled: false };
            if (state?.enabled) {
              await fetch(`${base}/api/disco/stop`, { method: 'POST', cache: 'no-store' });
              revalidatePath('/admin');
              return 'Disco stopped';
            }
            await fetch(`${base}/api/disco/start`, { method: 'POST', cache: 'no-store' });
            revalidatePath('/admin');
            return 'Disco started';
          }}
        />
      </div>
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <AdminTabsClient eventRows={eventRows} />
      </div>
    </main>
  );
}

