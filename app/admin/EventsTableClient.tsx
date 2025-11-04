'use client';

import { useCallback, useMemo, useState } from 'react';
import { ClientDate } from './ClientDate';

type Row = {
  eventId: string;
  startIso: string;
  matchup: string;
  network: string;
  status: string;
};

type SortKey = 'eventId' | 'startIso' | 'matchup' | 'network' | 'status';
type SortDir = 'asc' | 'desc';

export function EventsTableClient({ rows }: { rows: Row[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('startIso');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const onSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = (a[sortKey] ?? '').toString().toLowerCase();
      const vb = (b[sortKey] ?? '').toString().toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function Header({ label, keyName }: { label: string; keyName: SortKey }) {
    const isActive = sortKey === keyName;
    const arrow = !isActive ? '' : sortDir === 'asc' ? '▲' : '▼';
    return (
      <th
        onClick={() => onSort(keyName)}
        aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSort(keyName); }}
        style={{ padding: 8, borderBottom: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none' }}
      >
        {label} {arrow}
      </th>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <Header label="Event ID" keyName="eventId" />
            <Header label="Start (UTC)" keyName="startIso" />
            <Header label="Matchup" keyName="matchup" />
            <Header label="Network" keyName="network" />
            <Header label="Status" keyName="status" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.eventId}>
              <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{r.eventId}</td>
              <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                <ClientDate iso={r.startIso} />
              </td>
              <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{r.matchup}</td>
              <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{r.network}</td>
              <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


