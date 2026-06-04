import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { TeamRow } from '../../components/TeamRow';
import { useOverview } from '../../lib/api';

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

      {data.leaderboard.map((entry) => (
        <article key={entry.player.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">
                {entry.rank}
              </span>
              <h3 className="font-semibold">{entry.player.name}</h3>
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
            {entry.teams.map((team) => (
              <TeamRow key={team.team.id} team={team.team} status={team.status} />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
