export type SideOfBall = 'offense' | 'defense' | 'special_teams' | 'unknown';

export function inferSideOfBall(position: string): SideOfBall {
  const p = (position || '').toUpperCase();
  const offense = new Set(['QB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'OL']);
  const defense = new Set(['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'ILB', 'OLB', 'CB', 'DB', 'FS', 'SS', 'S']);
  const special = new Set(['K', 'P', 'LS', 'KR', 'PR']);
  if (offense.has(p)) return 'offense';
  if (defense.has(p)) return 'defense';
  if (special.has(p)) return 'special_teams';
  return 'unknown';
}


