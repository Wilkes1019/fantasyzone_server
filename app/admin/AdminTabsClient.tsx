'use client';

import { useMemo, useState } from 'react';
import { LiveGamesClient } from './LiveGamesClient';
import { EventsTableClient } from './EventsTableClient';

type Row = {
  eventId: string;
  startIso: string;
  matchup: string;
  network: string;
  status: string;
};

export function AdminTabsClient({ eventRows }: { eventRows: Row[] }) {
  const tabs = useMemo(() => ([
    { key: 'events' as const, label: 'Database Events' },
    { key: 'live' as const, label: 'Live Games' },
  ]), []);

  const [active, setActive] = useState<'live' | 'events'>('events');
  const title = active === 'events' ? 'Database Events' : 'Live Games';

  return (
    <div className="stack">
      <h2>{title}</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn ${active === t.key ? 'primary' : ''}`}
            type="button"
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === 'events' ? (
        <EventsTableClient rows={eventRows} />
      ) : (
        <LiveGamesClient />
      )}
    </div>
  );
}


