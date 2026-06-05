import type { BracketNode, Match, Team } from '@sweepstake/shared';
import { Crest } from './Crest';
import { formatDay, formatTime } from '../lib/format';

// Split "1C vs 2F" or "W73 vs W75" into the two label fragments.
function splitLabel(label: string): [string, string] {
  const [a, b] = label.split(' vs ');
  return [a?.trim() ?? '?', b?.trim() ?? '?'];
}

function sideClass(isWinner: boolean, isLoser: boolean, isHighlighted: boolean): string {
  if (isHighlighted) return 'text-emerald-400 font-semibold';
  if (isLoser) return 'text-slate-500';
  if (isWinner) return 'text-slate-100 font-semibold';
  return 'text-slate-300';
}

interface TeamSideProps {
  teamId: number | null;
  labelFrag: string;
  teamMap: Map<number, Team>;
  isWinner: boolean;
  isLoser: boolean;
  isHighlighted: boolean;
  align: 'left' | 'right';
}

function TeamSide({ teamId, labelFrag, teamMap, isWinner, isLoser, isHighlighted, align }: TeamSideProps) {
  const team = teamId !== null ? teamMap.get(teamId) : undefined;
  const displayName = team?.name ?? labelFrag;
  const cls = sideClass(isWinner, isLoser, isHighlighted);

  return align === 'right' ? (
    // Home — crest on the right, name right-aligned
    <div className="flex min-w-0 items-center justify-end gap-1.5">
      <span className={`truncate text-right text-sm ${cls}`}>{displayName}</span>
      {team ? (
        <Crest team={team} size={22} />
      ) : (
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-sm bg-white/5 text-[9px] font-bold text-slate-500">
          ?
        </span>
      )}
    </div>
  ) : (
    // Away — crest on the left, name left-aligned
    <div className="flex min-w-0 items-center gap-1.5">
      {team ? (
        <Crest team={team} size={22} />
      ) : (
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-sm bg-white/5 text-[9px] font-bold text-slate-500">
          ?
        </span>
      )}
      <span className={`truncate text-sm ${cls}`}>{displayName}</span>
    </div>
  );
}

interface Props {
  node: BracketNode;
  match?: Match;
  teamMap: Map<number, Team>;
  highlightIds: Set<number>;
}

export function BracketMatchCard({ node, match, teamMap, highlightIds }: Props) {
  const [homeLabel, awayLabel] = splitLabel(node.label);

  const homeId = node.homeTeamId;
  const awayId = node.awayTeamId;
  const winnerId = node.winnerTeamId;

  const homeWins = winnerId !== null && winnerId === homeId;
  const awayWins = winnerId !== null && winnerId === awayId;
  const homeHi = homeId !== null && highlightIds.has(homeId);
  const awayHi = awayId !== null && highlightIds.has(awayId);

  const score = match?.result
    ? `${match.result.homeScore}–${match.result.awayScore}${match.result.homePenalties != null ? ` (${match.result.homePenalties}–${match.result.awayPenalties} pens)` : ''}`
    : null;

  const timeStr = match ? formatTime(match.kickoffAt) : '–';
  const dateStr = match ? formatDay(match.kickoffAt) : '';

  return (
    <div className="px-3 py-2.5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2">
        <TeamSide
          teamId={homeId}
          labelFrag={homeLabel}
          teamMap={teamMap}
          isWinner={homeWins}
          isLoser={awayWins}
          isHighlighted={homeHi}
          align="right"
        />

        {/* Centre: score or kickoff time */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          {score ? (
            <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-100">
              {score}
            </span>
          ) : (
            <span className="text-xs tabular-nums text-slate-400">{timeStr}</span>
          )}
          {!score && dateStr ? (
            <span className="text-[10px] text-slate-500">{dateStr}</span>
          ) : null}
        </div>

        <TeamSide
          teamId={awayId}
          labelFrag={awayLabel}
          teamMap={teamMap}
          isWinner={awayWins}
          isLoser={homeWins}
          isHighlighted={awayHi}
          align="left"
        />
      </div>
    </div>
  );
}
