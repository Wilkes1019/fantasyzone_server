'use client';

import { useEffect, useMemo, useState } from 'react';

type Team = { id: string | null; abbr: string; name: string };
type LiveGame = {
  eventId: string;
  matchup: string;
  home: Team;
  away: Team;
  possessionTeamId: string | null;
  defenseTeamId: string | null;
  possessionAbbr?: string | null;
  defenseAbbr?: string | null;
  lastUpdated: number | null;
  network: string | null;
};

type LiveGamesResp = {
  liveGames: LiveGame[];
  teamsNotInGame: { id: string; abbr: string; name: string }[];
};

type PlayersResp = {
  offense: { id: string; fullName: string; position: string }[];
  defense: { id: string; fullName: string; position: string }[];
  specialTeams: { id: string; fullName: string; position: string }[];
};

export function LiveGamesClient() {
  const [data, setData] = useState<LiveGamesResp | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string>('');
  const [players, setPlayers] = useState<PlayersResp | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // fetch live games + teams not in game
  useEffect(() => {
    let active = true;
    const fetchOnce = async () => {
      try {
        const resp = await fetch('/api/live/games', { cache: 'no-store' });
        if (!resp.ok) return;
        const json = (await resp.json()) as LiveGamesResp;
        if (active) setData(json);
      } catch {
        // ignore
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, 7000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // load players when selected team changes
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!selectedTeamId) { setPlayers(null); return; }
      setLoadingPlayers(true);
      try {
        const resp = await fetch(`/api/teams/${encodeURIComponent(selectedTeamId)}/players`, { cache: 'no-store' });
        if (!resp.ok) return;
        const json = (await resp.json()) as PlayersResp;
        if (active) setPlayers(json);
      } catch {
        // ignore
      } finally {
        if (active) setLoadingPlayers(false);
      }
    };
    run();
    return () => { active = false; };
  }, [selectedTeamId]);

  const onSelectTeam = (team: { id: string | null; name: string; abbr: string }) => {
    if (!team.id) return; // can't fetch without id mapping
    setSelectedTeamId(team.id);
    setSelectedTeamName(team.name || team.abbr);
  };

  const gridStyle = useMemo(() => ({
    display: 'grid',
    gap: 16,
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    alignItems: 'start',
  } as const), []);

  function TeamLabel({ team, highlight }:{ team: Team; highlight: 'offense'|'defense'|'none' }) {
    const color = highlight === 'offense' ? 'var(--accent-2)' : highlight === 'defense' ? 'var(--danger)' : 'inherit';
    return (
      <span
        onClick={() => onSelectTeam(team)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectTeam(team); }}
        style={{ color, cursor: team.id ? 'pointer' : 'default' }}
        title={team.name}
      >
        {team.abbr}
      </span>
    );
  }

  return (
    <div className="stack">
      <div className="muted">Live Games</div>
      <div style={gridStyle}>
        <div className="stack">
          {(!data || data.liveGames.length === 0) ? (
            <div className="muted">No live games</div>
          ) : (
            <ul className="list stack">
              {data.liveGames.map((g) => {
                const offId = g.possessionTeamId;
                const defId = g.defenseTeamId;
                const offAbbr = (g.possessionAbbr || '').toUpperCase();
                const defAbbr = (g.defenseAbbr || '').toUpperCase();
                const awayAbbr = (g.away.abbr || '').toUpperCase();
                const homeAbbr = (g.home.abbr || '').toUpperCase();
                const awayHl: 'offense'|'defense'|'none' = (g.away.id && g.away.id === offId) || (offAbbr && awayAbbr === offAbbr) ? 'offense'
                  : (g.away.id && g.away.id === defId) || (defAbbr && awayAbbr === defAbbr) ? 'defense'
                  : 'none';
                const homeHl: 'offense'|'defense'|'none' = (g.home.id && g.home.id === offId) || (offAbbr && homeAbbr === offAbbr) ? 'offense'
                  : (g.home.id && g.home.id === defId) || (defAbbr && homeAbbr === defAbbr) ? 'defense'
                  : 'none';
                return (
                  <li key={g.eventId}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <TeamLabel team={g.away} highlight={awayHl} />
                        <span className="muted"> @ </span>
                        <TeamLabel team={g.home} highlight={homeHl} />
                      </div>
                      {g.network ? <div className="muted">{g.network}</div> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="muted" style={{ marginTop: 8 }}>Teams Not In Game</div>
          {(!data || data.teamsNotInGame.length === 0) ? (
            <div className="muted">All teams are currently in games</div>
          ) : (
            <ul className="list stack">
              {data.teamsNotInGame.map((t) => (
                <li key={t.id}>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectTeam({ id: t.id, name: t.name, abbr: t.abbr })}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectTeam({ id: t.id, name: t.name, abbr: t.abbr }); }}
                    style={{ cursor: 'pointer' }}
                  >
                    {t.abbr} — <span className="muted">{t.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="stack">
          <div className="muted">Players List {selectedTeamName ? `— ${selectedTeamName}` : ''}</div>
          {!selectedTeamId ? (
            <div className="muted">Select a team to view players</div>
          ) : loadingPlayers ? (
            <div className="muted">Loading…</div>
          ) : players ? (
            <div className="stack">
              {players.offense.length > 0 && (
                <div className="stack">
                  <div style={{ color: 'var(--accent-2)', fontWeight: 600 }}>Offense</div>
                  <ul className="list stack">
                    {players.offense.map((p) => (
                      <li key={p.id}>{p.fullName} <span className="muted">({p.position})</span></li>
                    ))}
                  </ul>
                </div>
              )}

              {players.defense.length > 0 && (
                <div className="stack">
                  <div style={{ color: 'var(--danger)', fontWeight: 600 }}>Defense</div>
                  <ul className="list stack">
                    {players.defense.map((p) => (
                      <li key={p.id}>{p.fullName} <span className="muted">({p.position})</span></li>
                    ))}
                  </ul>
                </div>
              )}

              {players.specialTeams.length > 0 && (
                <div className="stack">
                  <div className="muted" style={{ fontWeight: 600 }}>Special Teams</div>
                  <ul className="list stack">
                    {players.specialTeams.map((p) => (
                      <li key={p.id}>{p.fullName} <span className="muted">({p.position})</span></li>
                    ))}
                  </ul>
                </div>
              )}

              {players.offense.length === 0 && players.defense.length === 0 && players.specialTeams.length === 0 && (
                <div className="muted">No players found for this team</div>
              )}
            </div>
          ) : (
            <div className="muted">No data</div>
          )}
        </div>
      </div>
    </div>
  );
}


