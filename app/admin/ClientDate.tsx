'use client';

export function ClientDate({ iso }: { iso: string }) {
  const date = new Date(iso);
  let formatted = iso;
  try {
    formatted = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    } as Intl.DateTimeFormatOptions).format(date);
  } catch {}
  return <span title={iso}>{formatted}</span>;
}

