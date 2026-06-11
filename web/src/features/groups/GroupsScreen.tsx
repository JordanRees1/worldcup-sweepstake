import { Crest } from '../../components/Crest';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { useGroups, useTeamMap } from '../../lib/api';

export function GroupsScreen() {
  const { data, isLoading, isError, error, refetch } = useGroups();
  const teamMap = useTeamMap();

  if (isLoading) return <LoadingState label="Loading standings…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || data.groups.length === 0) return <EmptyState>No standings yet.</EmptyState>;

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Group standings
      </h2>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.groups.map((group) => (
          <section
            key={group.group}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
          >
            <h3 className="border-b border-white/10 px-4 py-2 text-sm font-semibold">
              Group {group.group}
            </h3>

            <div className="p-1.5">
              <div className="flex items-center gap-2 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">
                <span className="w-4 text-center">#</span>
                <span className="flex-1">Team</span>
                <span className="w-6 text-center">P</span>
                <span className="w-9 text-center">GD</span>
                <span className="w-8 text-center">Pts</span>
              </div>

              {group.rows.map((row) => {
                const team = teamMap.get(row.teamId);
                const top2 = row.rank <= 2;
                return (
                  <div
                    key={row.teamId}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      top2 ? 'bg-emerald-500/[0.07]' : ''
                    }`}
                  >
                    <span
                      className={`w-4 text-center text-xs ${top2 ? 'text-emerald-400' : 'text-slate-500'}`}
                    >
                      {row.rank}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {team ? <Crest team={team} size={20} /> : <span className="h-5 w-5" />}
                      <span className="truncate">{team?.name ?? `#${row.teamId}`}</span>
                    </span>
                    <span className="w-6 text-center tabular-nums text-slate-400">
                      {row.played}
                    </span>
                    <span className="w-9 text-center tabular-nums text-slate-400">
                      {row.goalDifference >= 0 ? '+' : ''}
                      {row.goalDifference}
                    </span>
                    <span className="w-8 text-center font-semibold tabular-nums">{row.points}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="text-center text-[11px] text-slate-500">
        Top 2 (highlighted) advance, plus the 8 best third-placed teams.
      </p>
    </div>
  );
}
