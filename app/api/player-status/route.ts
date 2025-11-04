export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { players } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { redis, keys } from '@/lib/redis';

const Body = z.object({
  playerIds: z.array(z.string().min(1)).min(1).max(200),
});

type PlayerStatus = 'In Zone' | 'Out of Zone' | 'Not Currently in Game';

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { playerIds } = parsed.data;

    const rows = await db.select().from(players).where(inArray(players.id, playerIds));
    const playerById = new Map(rows.map((r) => [r.id, r]));

    // Map team -> current game
    const uniqueTeamIds = Array.from(new Set(rows.map((r) => r.teamId)));
    const teamGameEntries = await Promise.all(uniqueTeamIds.map(async (tid) => [tid, await redis.get<string>(keys.teamCurrentGame(tid))] as const));
    const teamToGame = new Map<string, string | null>(teamGameEntries.map(([tid, gid]) => [tid, gid || null]));

    // Map game -> possession state
    const uniqueGameIds = Array.from(new Set(Array.from(teamToGame.values()).filter((v): v is string => Boolean(v))));
    const gameStateEntries = await Promise.all(uniqueGameIds.map(async (gid) => [gid, await redis.get<{ possession_team_id: string; defense_team_id: string }>(keys.possessionState(gid))] as const));
    const gameToState = new Map<string, { possession_team_id: string; defense_team_id: string } | null>(gameStateEntries.map(([gid, st]) => [gid, st || null]));

    const out: Record<string, { status: PlayerStatus; gameId?: string }> = {};
    for (const reqId of playerIds) {
      const p = playerById.get(reqId);
      if (!p) {
        out[reqId] = { status: 'Not Currently in Game' };
        continue;
      }
      const gameId = teamToGame.get(p.teamId) || null;
      if (!gameId) {
        out[reqId] = { status: 'Not Currently in Game' };
        continue;
      }
      const state = gameToState.get(gameId);
      if (!state) {
        out[reqId] = { status: 'Not Currently in Game' };
        continue;
      }

      let status: PlayerStatus = 'Out of Zone';
      if (p.sideOfBall === 'offense' && p.teamId === state.possession_team_id) {
        status = 'In Zone';
      } else if (p.sideOfBall === 'defense' && p.teamId === state.defense_team_id) {
        status = 'In Zone';
      }

      out[reqId] = gameId ? { status, gameId } : { status };
    }

    const resp = { players: out };
    console.log('[API][player-status] resp', { count: playerIds.length });
    return Response.json(resp, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('[API][player-status] error', (e as Error)?.message);
    return new Response('internal_error', { status: 500 });
  }
}


