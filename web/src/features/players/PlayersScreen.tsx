import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { TeamRow } from '../../components/TeamRow';
import { useOverview } from '../../lib/api';
import { sortPlayerTeams } from '../../lib/stages';

export function PlayersScreen() {
  const { data, isLoading, isError, error, refetch } = useOverview();

  if (isLoading) return <LoadingState label="Loading leaderboard…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || data.leaderboard.length === 0) return <EmptyState>No players yet.</EmptyState>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Leaderboard</h2>
        <span className="text-[11px] text-slate-500">{data.currentStage}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {data.leaderboard.map((entry) => (
          <Link
            key={entry.player.id}
            to={`/players/${entry.player.id}`}
            className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors active:bg-white/10 lg:hover:bg-white/10"
          >
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">
                  {entry.rank}
                </span>
                <h3 className="font-semibold">{entry.player.name}</h3>
                <span className="text-slate-500" aria-hidden>
                  ›
                </span>
              </div>
              <div className="text-right text-[11px] text-slate-400">
                <p>
                  <span className="font-semibold text-brand-400">{entry.aliveCount}</span> alive ·{' '}
                  {entry.points} pts
                </p>
                <p>
                  {entry.furthestStage} · GD {entry.goalDifference >= 0 ? '+' : ''}
                  {entry.goalDifference}
                </p>
              </div>
            </header>

            <div className="mt-2 divide-y divide-white/5">
              {sortPlayerTeams(entry.teams).map((team) => (
                <TeamRow key={team.team.id} team={team.team} status={team.status} />
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
