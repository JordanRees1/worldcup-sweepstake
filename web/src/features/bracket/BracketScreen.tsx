import { useEffect, useMemo, useState } from 'react';
import type { BracketResponse } from '@sweepstake/shared';
import { BracketMatchCard } from '../../components/BracketMatchCard';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { useBracket, useMatchMap, usePlayers, useTeamMap } from '../../lib/api';

const ROUND_SHORT: Record<string, string> = {
  'Round of 32': 'R32',
  'Round of 16': 'R16',
  'Quarterfinals': 'QF',
  'Semifinals': 'SF',
  'Third Place Playoff': '3rd',
  'Final': '🏆 Final',
};

type Round = BracketResponse['rounds'][number];

/** First round that still has an unresolved match (winnerTeamId === null). */
function findActiveStage(rounds: Round[]): string | null {
  return rounds.find((r) => r.nodes.some((n) => n.winnerTeamId === null))?.stage ?? null;
}

/** True when every match in the round has a decided winner. */
function isRoundComplete(round: Round): boolean {
  return round.nodes.length > 0 && round.nodes.every((n) => n.winnerTeamId !== null);
}

export function BracketScreen() {
  const { data: bracket, isLoading, isError, error, refetch } = useBracket();
  const matchMap = useMatchMap();
  const teamMap = useTeamMap();
  const { data: playersData } = usePlayers();

  // Stage selection — null until bracket data loads, then set to the active stage.
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  const activeStage = useMemo(
    () => (bracket ? (findActiveStage(bracket.rounds) ?? bracket.rounds.at(-1)?.stage ?? null) : null),
    [bracket],
  );

  // Jump to the active stage once on first load (never override a manual selection).
  useEffect(() => {
    if (activeStage !== null && selectedStage === null) {
      setSelectedStage(activeStage);
    }
  }, [activeStage, selectedStage]);

  // playerId → set of their teamIds — for bracket highlighting
  const playerTeamIds = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const p of playersData?.players ?? []) {
      map.set(p.player.id, new Set(p.teams.map((t) => t.team.id)));
    }
    return map;
  }, [playersData]);

  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const highlightIds: Set<number> =
    selectedPlayerId !== null ? (playerTeamIds.get(selectedPlayerId) ?? new Set()) : new Set();

  if (isLoading) return <LoadingState label="Loading bracket…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!bracket || bracket.rounds.length === 0)
    return <EmptyState>Bracket not available yet.</EmptyState>;

  const currentStage = selectedStage ?? activeStage;
  const currentRound = bracket.rounds.find((r) => r.stage === currentStage) ?? bracket.rounds[0];

  // Players sorted: those with teams still alive first, then by rank, eliminated last.
  const sortedPlayers = [...(playersData?.players ?? [])].sort((a, b) => {
    if (a.aliveCount !== b.aliveCount) return b.aliveCount - a.aliveCount;
    return a.rank - b.rank;
  });

  return (
    <div className="space-y-4">
      {/* ── Round selector ── */}
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {bracket.rounds.map((r) => {
          const isPast = isRoundComplete(r) && r.stage !== currentStage;
          const isActive = r.stage === currentStage;
          return (
            <button
              key={r.stage}
              onClick={() => setSelectedStage(r.stage)}
              className={`relative shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-500 text-white'
                  : isPast
                    ? 'bg-white/5 text-slate-500 line-through decoration-slate-600 active:bg-white/10'
                    : 'bg-white/10 text-slate-300 active:bg-white/20'
              }`}
            >
              {ROUND_SHORT[r.stage] ?? r.stage}
              {isPast && (
                <span className="ml-1 text-[10px] text-slate-600" aria-hidden>
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Player filter ── */}
      {playersData && (
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          <button
            onClick={() => setSelectedPlayerId(null)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedPlayerId === null
                ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                : 'bg-white/5 text-slate-400'
            }`}
          >
            All
          </button>
          {sortedPlayers.map((p) => {
            const isOut = p.aliveCount === 0;
            const isSelected = selectedPlayerId === p.player.id;
            return (
              <button
                key={p.player.id}
                onClick={() =>
                  setSelectedPlayerId((prev) => (prev === p.player.id ? null : p.player.id))
                }
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                    : isOut
                      ? 'bg-white/5 text-slate-600 line-through decoration-slate-700'
                      : 'bg-white/5 text-slate-400 active:bg-white/10'
                }`}
                title={isOut ? `${p.player.name} — eliminated` : undefined}
              >
                {p.player.name}
                {isSelected && p.aliveCount > 0 && (
                  <span className="ml-1 text-emerald-400">{p.aliveCount}</span>
                )}
                {isOut && !isSelected && (
                  <span className="ml-1 text-slate-600" aria-label="out">✗</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Match list ── */}
      {currentRound && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {currentRound.stage}
            </h2>
            <span className="text-[11px] text-slate-500">{currentRound.nodes.length} matches</span>
          </div>

          <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            {currentRound.nodes.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                Matches not yet scheduled.
              </div>
            ) : (
              currentRound.nodes.map((node) => (
                <BracketMatchCard
                  key={node.matchId}
                  node={node}
                  match={matchMap.get(node.matchId)}
                  teamMap={teamMap}
                  highlightIds={highlightIds}
                />
              ))
            )}
          </div>

          {selectedPlayerId !== null && highlightIds.size > 0 && (
            <p className="mt-2 text-center text-[11px] text-slate-500">
              <span className="text-emerald-400">Green</span> ={' '}
              {playersData?.players.find((p) => p.player.id === selectedPlayerId)?.player.name}
              &apos;s teams
            </p>
          )}
        </section>
      )}
    </div>
  );
}
