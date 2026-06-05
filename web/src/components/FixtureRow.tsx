import type { Match, Team } from '@sweepstake/shared';
import { formatDay, formatTime } from '../lib/format';

function sideLabel(match: Match, side: 'home' | 'away', teamMap: Map<number, Team>): string {
  const id = side === 'home' ? match.homeTeamId : match.awayTeamId;
  if (id !== null) return teamMap.get(id)?.name ?? `#${id}`;
  // Knockout slot not yet resolved — fall back to the label's two halves.
  const parts = match.label.split(' vs ');
  return (side === 'home' ? parts[0] : parts[1]) ?? 'TBD';
}

export function FixtureRow({
  match,
  teamMap,
  highlightIds,
}: {
  match: Match;
  teamMap: Map<number, Team>;
  highlightIds?: Set<number>;
}) {
  const home = sideLabel(match, 'home', teamMap);
  const away = sideLabel(match, 'away', teamMap);
  const homeHi = match.homeTeamId !== null && highlightIds?.has(match.homeTeamId);
  const awayHi = match.awayTeamId !== null && highlightIds?.has(match.awayTeamId);
  const center = match.result
    ? `${match.result.homeScore}–${match.result.awayScore}`
    : formatTime(match.kickoffAt);
  const meta = `${match.group ? `Group ${match.group}` : match.stage} · ${formatDay(match.kickoffAt)}`;

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`flex-1 truncate text-right ${homeHi ? 'font-semibold text-slate-100' : 'text-slate-300'}`}
        >
          {home}
        </span>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs tabular-nums ${
            match.result ? 'bg-white/10 font-semibold text-slate-100' : 'text-slate-400'
          }`}
        >
          {center}
        </span>
        <span
          className={`flex-1 truncate ${awayHi ? 'font-semibold text-slate-100' : 'text-slate-300'}`}
        >
          {away}
        </span>
      </div>
      <p className="mt-0.5 text-center text-[10px] text-slate-500">{meta}</p>
    </div>
  );
}
