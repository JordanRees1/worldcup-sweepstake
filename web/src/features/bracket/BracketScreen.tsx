import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { useBracket } from '../../lib/api';

export function BracketScreen() {
  const { data, isLoading, isError, error, refetch } = useBracket();

  if (isLoading) return <LoadingState label="Loading bracket…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || data.rounds.length === 0) return <EmptyState>Bracket not available yet.</EmptyState>;

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Knockout bracket</h2>
      <p className="text-[11px] text-slate-500">
        The full radial visual lands in WP7 — these rounds come straight from the API contract.
      </p>

      {data.rounds.map((round) => (
        <section key={round.stage} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold">{round.stage}</h3>
          <ul className="mt-2 space-y-1.5">
            {round.nodes.map((node) => (
              <li
                key={node.matchId}
                className="flex items-center justify-between text-sm text-slate-300"
              >
                <span>{node.label}</span>
                <span className="text-[11px] text-slate-500">
                  {node.winnerTeamId ? 'decided' : 'tbd'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
