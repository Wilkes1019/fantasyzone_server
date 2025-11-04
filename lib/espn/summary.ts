import { espnLimiter, jitterMs } from '@/lib/ratelimit';
import type { TeamInfo } from '@/lib/espn/scoreboard';

export type WatchSummary = {
  eventId: string;
  clock?: string | null;
  possession?: string | null;
  downAndDistance?: string | null;
  redZone?: boolean;
  goalToGo?: boolean;
};

async function ratelimitedFetch(url: string, init?: RequestInit) {
  const res = await espnLimiter.limit('espn');
  if (!res.success) await new Promise((r) => setTimeout(r, jitterMs(300)));
  return fetch(url, init);
}

export async function fetchWatchSummary(eventId: string): Promise<WatchSummary> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(eventId)}`;
  console.log('[ESPN][summary] GET', url);
  const resp = await ratelimitedFetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`ESPN summary ${resp.status}`);
  const data = await resp.json();
  const situation = data?.header?.competitions?.[0]?.situation ?? {};
  const clock = situation?.clock != null && situation?.period != null ? `${Math.floor(situation.clock / 60).toString().padStart(2, '0')}:${Math.floor(situation.clock % 60).toString().padStart(2, '0')} Q${situation.period}` : null;
  const possession = situation?.possessionText ?? null;
  const downAndDistance = situation?.shortDownDistanceText ?? situation?.downDistanceText ?? null;
  const redZone = Boolean(situation?.isRedZone);
  const goalToGo = Boolean(situation?.isGoalToGo);
  const out = { eventId, clock, possession, downAndDistance, redZone, goalToGo };
  console.log('[ESPN][summary] parsed', out);
  return out;
}


export type EventSituation = {
  eventId: string;
  possessionEspnTeamId: string | null;
  home: TeamInfo;
  away: TeamInfo;
};

export async function fetchEventSituation(eventId: string): Promise<EventSituation | null> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(eventId)}`;
  console.log('[ESPN][summary][situation] GET', url);
  const resp = await ratelimitedFetch(url, { cache: 'no-store' });
  if (!resp.ok) {
    console.warn('[ESPN][summary][situation] non-200', { eventId, status: resp.status });
    return null;
  }
  const data = await resp.json();
  const comp = data?.header?.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const home = competitors.find((c: any) => c.homeAway === 'home');
  const away = competitors.find((c: any) => c.homeAway === 'away');
  if (!home || !away) return null;
  const homeInfo: TeamInfo = { id: String(home.team?.id), name: String(home.team?.displayName), abbr: String(home.team?.abbreviation) };
  const awayInfo: TeamInfo = { id: String(away.team?.id), name: String(away.team?.displayName), abbr: String(away.team?.abbreviation) };
  let possessionEspnTeamId = comp?.situation?.possession ? String(comp.situation.possession) : null;

  // Fallback 1: drives.current.team.id
  if (!possessionEspnTeamId) {
    const currentDriveTeamId = data?.drives?.current?.team?.id ?? data?.drives?.current?.teamId;
    if (currentDriveTeamId) possessionEspnTeamId = String(currentDriveTeamId);
  }

  // Fallback 2: parse situation.possessionText (prefix like "DAL 1st & 10 …")
  if (!possessionEspnTeamId) {
    const txt: string | undefined = comp?.situation?.possessionText || comp?.situation?.shortDownDistanceText || comp?.situation?.downDistanceText;
    if (txt && typeof txt === 'string') {
      const token = txt.trim().split(/\s+/)[0]?.toUpperCase();
      const tokenToId = new Map<string, string>([
        [homeInfo.abbr?.toUpperCase(), homeInfo.id],
        [awayInfo.abbr?.toUpperCase(), awayInfo.id],
      ]);
      const mapped = token ? tokenToId.get(token) : undefined;
      if (mapped) possessionEspnTeamId = String(mapped);
    }
  }

  const out: EventSituation = { eventId, possessionEspnTeamId: possessionEspnTeamId ?? null, home: homeInfo, away: awayInfo };
  console.log('[ESPN][summary][situation] parsed', out);
  return out;
}

