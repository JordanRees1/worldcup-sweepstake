import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FixtureRow } from '../../components/FixtureRow';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { TeamRow } from '../../components/TeamRow';
import { usePlayerDetail, useTeamMap, useTeamOwnerMap, useVenueMap } from '../../lib/api';
import { sortPlayerTeams } from '../../lib/stages';
import { useSweepstakeCode } from '../../lib/sweepstake';

export function PlayerDetailScreen() {
  const { id } = useParams();
  const playerId = Number(id);
  const code = useSweepstakeCode();
  const { data, isLoading, isError, error, refetch } = usePlayerDetail(playerId);
  const teamMap = useTeamMap();
  const venueMap = useVenueMap();
  const ownerByTeam = useTeamOwnerMap();
  const [showScoring, setShowScoring] = useState(false);

  if (isLoading) return <LoadingState label="Loading player…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return <EmptyState>Player not found.</EmptyState>;

  const { player, fixtures } = data;
  const ownTeamIds = new Set(player.teams.map((t) => t.team.id));

  return (
    <div className="space-y-5">
      <Link to={`/s/${code}`} className="inline-flex items-center gap-1 text-sm text-slate-400">
        ← Leaderboard
      </Link>

      <header className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{player.player.name}</h2>
          <p className="text-right leading-none">
            <span
              className={`text-xl font-bold tabular-nums ${
                player.points < 0 ? 'text-red-400' : 'text-brand-400'
              }`}
            >
              {player.points}
            </span>
            <span className="ml-1 text-xs text-slate-500">pts · #{player.rank}</span>
          </p>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">{player.aliveCount}</span> alive · GD{' '}
          {player.goalDifference >= 0 ? '+' : ''}
          {player.goalDifference} · {player.furthestStage}
        </p>

        <button
          type="button"
          onClick={() => setShowScoring((v) => !v)}
          aria-expanded={showScoring}
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-400 active:text-slate-200 lg:hover:text-slate-200"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-500 text-[9px] font-semibold">
            i
          </span>
          How scoring works
        </button>

        {showScoring && (
          <div className="mt-2 space-y-1 rounded-xl bg-white/5 p-3 text-[11px] text-slate-400">
            <p>
              <span className="font-semibold text-slate-200">Win</span> +3 — group or knockout
            </p>
            <p>
              <span className="font-semibold text-slate-200">Draw</span> +1 — group stage
            </p>
            <p>
              <span className="font-semibold text-slate-200">Loss</span> — minus the goal margin
              (lose 1–3 → −2)
            </p>
            <p>
              <span className="font-semibold text-slate-200">🥄 Wooden spoon</span> — lose every one
              of your games and it&apos;s −50
            </p>
            <p className="pt-1 text-slate-500">
              Ranked by points, then goal difference, then teams still alive.
            </p>
          </div>
        )}
      </header>

      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
        <section>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Teams</h3>
          <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5 px-3">
            {sortPlayerTeams(player.teams).map((t) => (
              <TeamRow key={t.team.id} team={t.team} status={t.status} />
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Fixtures
          </h3>
          {fixtures.length === 0 ? (
            <EmptyState>No fixtures.</EmptyState>
          ) : (
            <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
              {fixtures.map((m) => (
                <FixtureRow
                  key={m.id}
                  match={m}
                  teamMap={teamMap}
                  highlightIds={ownTeamIds}
                  venue={venueMap.get(m.venueId)}
                  ownerByTeam={ownerByTeam}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
