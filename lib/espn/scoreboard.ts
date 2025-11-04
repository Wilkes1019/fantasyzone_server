import { espnLimiter, jitterMs } from '@/lib/ratelimit';

export type TeamInfo = { id: string; name: string; abbr: string };
export type ScoreboardGame = {
  eventId: string;
  startUtc: string;
  teams: { home: TeamInfo; away: TeamInfo };
  network?: string | null;
  status: 'scheduled' | 'live' | 'final';
};

async function ratelimitedFetch(url: string, init?: RequestInit) {
  const res = await espnLimiter.limit('espn');
  if (!res.success) await new Promise((r) => setTimeout(r, jitterMs(300)));
  return fetch(url, init);
}

function toYyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export async function fetchScoreboardDay(dateUtc: Date): Promise<ScoreboardGame[]> {
  const dates = toYyyymmdd(dateUtc);
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}`;
  console.log('[ESPN][scoreboard] GET', url);
  const resp = await ratelimitedFetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`ESPN scoreboard ${resp.status}`);
  const data = await resp.json();
  const events = Array.isArray(data?.events) ? data.events : [];
  const out: ScoreboardGame[] = [];
  for (const ev of events) {
    const eventId = String(ev?.id ?? ev?.uid?.split('~').pop());
    const comp = ev?.competitions?.[0];
    const startUtc = ev?.date ?? comp?.date;
    const competitors = comp?.competitors ?? [];
    const home = competitors.find((c: any) => c.homeAway === 'home');
    const away = competitors.find((c: any) => c.homeAway === 'away');
    const statusType = comp?.status?.type?.state;
    const status: ScoreboardGame['status'] = statusType === 'in' ? 'live' : statusType === 'post' ? 'final' : 'scheduled';
    const network = comp?.broadcasts?.[0]?.names?.[0] ?? null;
    if (!eventId || !home || !away || !startUtc) continue;
    const teamInfo = (c: any): TeamInfo => ({ id: String(c.team?.id), name: String(c.team?.displayName), abbr: String(c.team?.abbreviation) });
    out.push({
      eventId,
      startUtc,
      teams: { home: teamInfo(home), away: teamInfo(away) },
      network,
      status,
    });
  }
  console.log('[ESPN][scoreboard] parsed', { date: dates, count: out.length });
  return out;
}

export async function fetchScoreboardRange(startUtc: Date, endUtc: Date): Promise<ScoreboardGame[]> {
  const out: ScoreboardGame[] = [];
  const d = new Date(Date.UTC(startUtc.getUTCFullYear(), startUtc.getUTCMonth(), startUtc.getUTCDate()));
  while (d <= endUtc) {
    const dayGames = await fetchScoreboardDay(d);
    out.push(...dayGames);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export type ScoreboardSituation = {
  eventId: string;
  possessionEspnTeamId: string | null;
  home: TeamInfo;
  away: TeamInfo;
};

export async function fetchScoreboardSituations(dateUtc: Date): Promise<ScoreboardSituation[]> {
  const dates = toYyyymmdd(dateUtc);
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}`;
  console.log('[ESPN][scoreboard][situations] GET', url);
  const resp = await ratelimitedFetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`ESPN scoreboard ${resp.status}`);
  const data = await resp.json();
  const events = Array.isArray(data?.events) ? data.events : [];
  const out: ScoreboardSituation[] = [];
  for (const ev of events) {
    const eventId = String(ev?.id ?? ev?.uid?.split('~').pop());
    const comp = ev?.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find((c: any) => c.homeAway === 'home');
    const away = competitors.find((c: any) => c.homeAway === 'away');
    if (!eventId || !home || !away) continue;
    const homeInfo: TeamInfo = { id: String(home.team?.id), name: String(home.team?.displayName), abbr: String(home.team?.abbreviation) };
    const awayInfo: TeamInfo = { id: String(away.team?.id), name: String(away.team?.displayName), abbr: String(away.team?.abbreviation) };
    const possessionEspnTeamId = comp?.situation?.possession ? String(comp.situation.possession) : null;
    out.push({ eventId, possessionEspnTeamId, home: homeInfo, away: awayInfo });
  }
  console.log('[ESPN][scoreboard][situations] parsed', { date: dates, count: out.length });
  return out;
}

