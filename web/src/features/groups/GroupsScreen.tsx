import { Crest } from '../../components/Crest';
import { LiveBadge } from '../../components/LiveBadge';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { useGroups, useTeamMap } from '../../lib/api';

export function GroupsScreen() {
  const { data, isLoading, isError, error, refetch } = useGroups();
  const teamMap = useTeamMap();

  if (isLoading) return <LoadingState label="Loading standings…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || data.groups.length === 0) return <EmptyState>No standings yet.</EmptyState>;

  // Teams currently inside the top-8 best-third places — highlighted in their group table.
  const qualifyingThirds = new Set(
    (data.thirdPlace ?? []).filter((t) => t.qualifying).map((t) => t.teamId),
  );

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
            <h3 className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-sm font-semibold">
              <span>Group {group.group}</span>
              {group.live && <LiveBadge />}
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
                const qualThird = row.rank === 3 && qualifyingThirds.has(row.teamId);
                const advancing = top2 || qualThird;
                return (
                  <div
                    key={row.teamId}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      advancing ? 'bg-emerald-500/[0.07]' : ''
                    }`}
                  >
                    <span
                      className={`w-4 text-center text-xs ${advancing ? 'text-emerald-400' : 'text-slate-500'}`}
                    >
                      {row.rank}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {team ? <Crest team={team} size={20} /> : <span className="h-5 w-5" />}
                      <span
                        className={`truncate ${qualThird ? 'italic text-emerald-400' : ''}`}
                        title={qualThird ? 'Currently a qualifying best third' : undefined}
                      >
                        {team?.name ?? `#${row.teamId}`}
                      </span>
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

      {data.thirdPlace && data.thirdPlace.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Best third-placed teams
          </h2>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-500">
              <span className="w-4 text-center">#</span>
              <span className="flex-1">Team</span>
              <span className="w-8 text-center">Grp</span>
              <span className="w-6 text-center">P</span>
              <span className="w-9 text-center">GD</span>
              <span className="w-8 text-center">Pts</span>
            </div>
            {data.thirdPlace.map((t, i) => {
              const team = teamMap.get(t.teamId);
              return (
                <div key={t.teamId}>
                  {i === 8 && (
                    <div className="flex items-center gap-2 px-3 py-1">
                      <span className="h-px flex-1 bg-red-500/40" />
                      <span className="text-[9px] uppercase tracking-wide text-red-400/80">
                        qualification line
                      </span>
                      <span className="h-px flex-1 bg-red-500/40" />
                    </div>
                  )}
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
                      t.qualifying ? 'bg-emerald-500/[0.07]' : 'opacity-60'
                    }`}
                  >
                    <span
                      className={`w-4 text-center text-xs ${t.qualifying ? 'text-emerald-400' : 'text-slate-500'}`}
                    >
                      {t.rank}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {team ? <Crest team={team} size={20} /> : <span className="h-5 w-5" />}
                      <span className={`truncate ${t.qualifying ? 'text-emerald-400' : ''}`}>
                        {team?.name ?? `#${t.teamId}`}
                      </span>
                    </span>
                    <span className="w-8 text-center text-xs text-slate-400">{t.group}</span>
                    <span className="w-6 text-center tabular-nums text-slate-400">{t.played}</span>
                    <span className="w-9 text-center tabular-nums text-slate-400">
                      {t.goalDifference >= 0 ? '+' : ''}
                      {t.goalDifference}
                    </span>
                    <span className="w-8 text-center font-semibold tabular-nums">{t.points}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-center text-[11px] text-slate-500">
            The 8 best third-placed teams (above the line) advance to the Round of 32.
          </p>
        </section>
      )}

      <p className="text-center text-[11px] text-slate-500">
        Top 2 (highlighted) advance, plus the 8 best third-placed teams.
      </p>
    </div>
  );
}
