import { db } from '@/lib/db/drizzle';
import { games as gamesTable, teams as teamsTable } from '@/lib/db/schema';
import type { GameRow } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { redis, keys } from '@/lib/redis';
import { flags } from '@/lib/env';

export const DISCO_NETWORKS = ['ABC', 'CBS', 'ESPN', 'FOX', 'NBC', 'NFLN'] as const;
export type DiscoNetwork = typeof DISCO_NETWORKS[number];

export type DiscoGame = { eventId: string; homeAbbr: string; awayAbbr: string; network: DiscoNetwork };

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function randInt(minInclusive: number, maxInclusive: number): number {
  const min = Math.ceil(minInclusive);
  const max = Math.floor(maxInclusive);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomDiscoNetwork(): DiscoNetwork {
  const idx = randInt(0, DISCO_NETWORKS.length - 1);
  return DISCO_NETWORKS[idx];
}

function coerceDiscoNetwork(n: unknown): DiscoNetwork {
  const s = typeof n === 'string' ? n.toUpperCase() : '';
  if ((DISCO_NETWORKS as readonly string[]).includes(s)) {
    return s as DiscoNetwork;
  }
  return getRandomDiscoNetwork();
}

const LIVE_ROW_STALE_MS = Math.max(flags.liveTtlSec, 60) * 1000;

export function isGameRowLive(row: GameRow | null | undefined): boolean {
  if (!row || row.status !== 'live') return false;
  const updated = row.updatedAt ? new Date(row.updatedAt).getTime() : null;
  if (!updated) return true;
  return Date.now() - updated <= LIVE_ROW_STALE_MS;
}

export async function hasRealLiveGames(): Promise<boolean> {
  const live = await db.select().from(gamesTable).where(eq(gamesTable.status, 'live'));
  return live.some((row) => isGameRowLive(row));
}

export async function getDiscoGames(): Promise<DiscoGame[]> {
  const arr = (await redis.get<unknown>(keys.discoGames)) as unknown;
  const raw = Array.isArray(arr) ? (arr as any[]) : [];
  const cleaned = raw.map((g) => ({
    ...g,
    network: coerceDiscoNetwork(g?.network),
  })) as DiscoGame[];
  return cleaned;
}

export async function isDiscoEnabled(): Promise<boolean> {
  return Boolean(await redis.get(keys.discoEnabled));
}

export async function shouldUseDisco(): Promise<boolean> {
  const enabled = await isDiscoEnabled();
  if (!enabled) return false;
  const realLive = await hasRealLiveGames();
  return !realLive;
}

export async function seedGames(): Promise<DiscoGame[]> {
  // safeguard: only seed when there are no real live games
  if (await hasRealLiveGames()) return [];

  const allTeams = await db.select().from(teamsTable);
  const available = [...allTeams];
  if (available.length < 18) throw new Error('Not enough teams to seed Disco');

  shuffleInPlace(available);
  const chosen = available.slice(0, 18);
  const matchups: DiscoGame[] = [];
  for (let i = 0; i < 9; i += 1) {
    const away = chosen[i * 2];
    const home = chosen[i * 2 + 1];
    const eventId = `DISCO-${i + 1}`;
    matchups.push({ eventId, homeAbbr: home.abbr, awayAbbr: away.abbr, network: getRandomDiscoNetwork() });
  }

  const now = Date.now();
  // initialize possession for each disco game
  for (const g of matchups) {
    const homeRow = allTeams.find((t) => t.abbr.toUpperCase() === g.homeAbbr.toUpperCase());
    const awayRow = allTeams.find((t) => t.abbr.toUpperCase() === g.awayAbbr.toUpperCase());
    const offenseIsHome = Math.random() < 0.5;
    const possession_team_id = offenseIsHome ? (homeRow?.id ?? '') : (awayRow?.id ?? '');
    const defense_team_id = offenseIsHome ? (awayRow?.id ?? '') : (homeRow?.id ?? '');
    const state = {
      possession_team_id,
      defense_team_id,
      last_updated: now,
      next_swap_at: now + randInt(1000, 5000),
      disco: true,
    } as Record<string, any>;
    await redis.set(keys.possessionState(g.eventId), state);
    await redis.expire(keys.possessionState(g.eventId), 120);
  }

  await redis.set(keys.discoGames, matchups);
  await redis.set(keys.discoEnabled, true);
  await redis.set(keys.discoCycleUntil, now + 60_000);
  await redis.set(keys.discoLastHeartbeat, now);
  return matchups;
}

export async function stepSimulation(): Promise<void> {
  const enabled = await isDiscoEnabled();
  const now = Date.now();

  if (!enabled) return;

  // if real games appear, stop disco
  if (await hasRealLiveGames()) {
    await stopDisco();
    return;
  }

  const last = Number(await redis.get<number | null>(keys.discoLastHeartbeat)) || 0;
  if (last && now - last > 15_000) {
    await stopDisco();
    return;
  }

  await redis.set(keys.discoLastHeartbeat, now);

  const games = await getDiscoGames();
  if (games.length === 0) {
    await seedGames();
    return;
  }

  // swap possessions when due
  for (const g of games) {
    const key = keys.possessionState(g.eventId);
    const state = (await redis.get<Record<string, any> | null>(key)) || null;
    if (!state) {
      // re-init if missing
      const allTeams = await db.select().from(teamsTable);
      const homeRow = allTeams.find((t) => t.abbr.toUpperCase() === g.homeAbbr.toUpperCase());
      const awayRow = allTeams.find((t) => t.abbr.toUpperCase() === g.awayAbbr.toUpperCase());
      const offenseIsHome = Math.random() < 0.5;
      const possession_team_id = offenseIsHome ? (homeRow?.id ?? '') : (awayRow?.id ?? '');
      const defense_team_id = offenseIsHome ? (awayRow?.id ?? '') : (homeRow?.id ?? '');
      const initState = {
        possession_team_id,
        defense_team_id,
        last_updated: now,
        next_swap_at: now + randInt(1000, 5000),
        disco: true,
      } as Record<string, any>;
      await redis.set(key, initState);
      await redis.expire(key, 120);
      continue;
    }
    const nextSwapAt = Number(state.next_swap_at) || 0;
    if (now >= nextSwapAt) {
      const newState = {
        possession_team_id: state.defense_team_id,
        defense_team_id: state.possession_team_id,
        last_updated: now,
        next_swap_at: now + randInt(1000, 5000),
        disco: true,
      } as Record<string, any>;
      await redis.set(key, newState);
    }
    await redis.expire(key, 120);
  }

  // reseed cycle
  const cycleUntil = Number(await redis.get<number | null>(keys.discoCycleUntil)) || 0;
  if (cycleUntil && now >= cycleUntil) {
    await reseedGames();
  }
}

export async function reseedGames(): Promise<void> {
  const prev = await getDiscoGames();
  // clean old per-game keys
  for (const g of prev) {
    await redis.del(keys.possessionState(g.eventId));
    await redis.del(keys.gameFlags(g.eventId));
  }
  await seedGames();
}

export async function stopDisco(): Promise<void> {
  const games = await getDiscoGames();
  for (const g of games) {
    await redis.del(keys.possessionState(g.eventId));
    await redis.del(keys.gameFlags(g.eventId));
  }
  await redis.del(keys.discoGames);
  await redis.del(keys.discoEnabled);
  await redis.del(keys.discoCycleUntil);
  await redis.del(keys.discoLastHeartbeat);
}

export async function getDiscoState(): Promise<{ enabled: boolean; lastHeartbeat: number | null; cycleUntil: number | null; games: DiscoGame[] }>{
  const [enabled, lastHeartbeat, cycleUntil, games] = await Promise.all([
    isDiscoEnabled(),
    redis.get<number | null>(keys.discoLastHeartbeat),
    redis.get<number | null>(keys.discoCycleUntil),
    getDiscoGames(),
  ]);
  return {
    enabled,
    lastHeartbeat: lastHeartbeat ?? null,
    cycleUntil: cycleUntil ?? null,
    games,
  };
}


