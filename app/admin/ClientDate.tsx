'use client';

import { useEffect, useState } from 'react';

export function ClientDate({ iso }: { iso: string }) {
  const [formatted, setFormatted] = useState(iso);

  useEffect(() => {
    let next = iso;
    try {
      next = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC',
        timeZoneName: 'short',
      } as Intl.DateTimeFormatOptions).format(new Date(iso));
    } catch {
      next = iso;
    }
    setFormatted(next);
  }, [iso]);

  return <span title={iso}>{formatted}</span>;
}

