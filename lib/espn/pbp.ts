import { espnLimiter, jitterMs } from '@/lib/ratelimit';

export type PbpState = {
  lastPlayId: string | null;
  redZone: boolean;
  goalToGo: boolean;
};

async function ratelimitedFetch(url: string, init?: RequestInit) {
  const res = await espnLimiter.limit('espn');
  if (!res.success) await new Promise((r) => setTimeout(r, jitterMs(300)));
  return fetch(url, init);
}

export async function fetchPbp(eventId: string): Promise<PbpState> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(eventId)}`;
  console.log('[ESPN][pbp] GET', url);
  const resp = await ratelimitedFetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`ESPN pbp ${resp.status}`);
  const data = await resp.json();
  const drives = data?.drives?.previous ?? [];
  const last = drives[drives.length - 1];
  const plays = last?.plays ?? [];
  const lastPlay = plays[plays.length - 1];
  const lastPlayId = lastPlay?.id ? String(lastPlay.id) : null;
  const situation = data?.header?.competitions?.[0]?.situation;
  const redZone = Boolean(situation?.isRedZone);
  const goalToGo = Boolean(situation?.isGoalToGo);
  const out = { lastPlayId, redZone, goalToGo };
  console.log('[ESPN][pbp] parsed', { eventId, out });
  return out;
}

