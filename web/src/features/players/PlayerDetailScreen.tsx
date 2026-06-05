import { Link, useParams } from 'react-router-dom';
import { FixtureRow } from '../../components/FixtureRow';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { TeamRow } from '../../components/TeamRow';
import { usePlayerDetail, useTeamMap } from '../../lib/api';
import { sortPlayerTeams } from '../../lib/stages';

export function PlayerDetailScreen() {
  const { id } = useParams();
  const playerId = Number(id);
  const { data, isLoading, isError, error, refetch } = usePlayerDetail(playerId);
  const teamMap = useTeamMap();

  if (isLoading) return <LoadingState label="Loading player…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return <EmptyState>Player not found.</EmptyState>;

  const { player, fixtures } = data;
  const ownTeamIds = new Set(player.teams.map((t) => t.team.id));

  return (
    <div className="space-y-5">
      <Link to="/players" className="inline-flex items-center gap-1 text-sm text-slate-400">
        ← Leaderboard
      </Link>

      <header className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{player.player.name}</h2>
          <span className="text-sm text-slate-400">#{player.rank}</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          <span className="font-semibold text-brand-400">{player.aliveCount}</span> alive ·{' '}
          {player.points} pts · GD {player.goalDifference >= 0 ? '+' : ''}
          {player.goalDifference} · {player.furthestStage}
        </p>
      </header>

      <section>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Teams</h3>
        <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5 px-3">
          {sortPlayerTeams(player.teams).map((t) => (
            <TeamRow key={t.team.id} team={t.team} status={t.status} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Fixtures</h3>
        {fixtures.length === 0 ? (
          <EmptyState>No fixtures.</EmptyState>
        ) : (
          <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
            {fixtures.map((m) => (
              <FixtureRow key={m.id} match={m} teamMap={teamMap} highlightIds={ownTeamIds} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
