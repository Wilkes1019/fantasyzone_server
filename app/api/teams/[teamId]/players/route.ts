export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db } from '@/lib/db/drizzle';
import { players, teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(_req: Request, ctx: { params: { teamId: string } }) {
  try {
    const teamId = ctx.params?.teamId;
    if (!teamId) return new Response('Bad Request', { status: 400 });

    // Validate team exists (optional but helpful)
    const team = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (team.length === 0) return new Response('Not Found', { status: 404 });

    const rows = await db.select().from(players).where(eq(players.teamId, teamId));

    const offense = rows.filter((p) => p.sideOfBall === 'offense');
    const defense = rows.filter((p) => p.sideOfBall === 'defense');
    const specialTeams = rows.filter((p) => p.sideOfBall === 'special_teams');

    return Response.json({ offense, defense, specialTeams }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('[API][teams/:teamId/players] error', (e as Error)?.message);
    return new Response('internal_error', { status: 500 });
  }
}


