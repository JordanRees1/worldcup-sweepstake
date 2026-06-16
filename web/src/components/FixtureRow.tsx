import type { Match, Team, Venue } from '@sweepstake/shared';
import { formatDay, formatTime } from '../lib/format';
import { LiveBadge } from './LiveBadge';

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
  hideDate = false,
  ownerByTeam,
  venue,
}: {
  match: Match;
  teamMap: Map<number, Team>;
  highlightIds?: Set<number>;
  hideDate?: boolean;
  /** When provided, shows the owning player's name under each team (Schedule "Show players"). */
  ownerByTeam?: Map<number, string>;
  /** When provided, shows the stadium + city/country under the fixture. */
  venue?: Venue;
}) {
  const home = sideLabel(match, 'home', teamMap);
  const away = sideLabel(match, 'away', teamMap);
  const homeHi = match.homeTeamId !== null && highlightIds?.has(match.homeTeamId);
  const awayHi = match.awayTeamId !== null && highlightIds?.has(match.awayTeamId);
  const homeOwner = match.homeTeamId !== null ? ownerByTeam?.get(match.homeTeamId) : undefined;
  const awayOwner = match.awayTeamId !== null ? ownerByTeam?.get(match.awayTeamId) : undefined;
  const isLive = match.status === 'live';
  const center = match.result
    ? `${match.result.homeScore}–${match.result.awayScore}`
    : formatTime(match.kickoffAt);
  const context = match.group ? `Group ${match.group}` : match.stage;
  const meta = hideDate ? context : `${context} · ${formatDay(match.kickoffAt)}`;

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <div className="min-w-0 flex-1 text-right">
          <span
            className={`block truncate ${homeHi ? 'font-semibold text-slate-100' : 'text-slate-300'}`}
          >
            {home}
          </span>
          {homeOwner && (
            <span className="block truncate text-[10px] text-slate-400/60">({homeOwner})</span>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span
            className={`rounded px-2 py-0.5 text-xs tabular-nums ${
              isLive
                ? 'bg-red-500/15 font-semibold text-slate-100 ring-1 ring-red-500/40'
                : match.result
                  ? 'bg-white/10 font-semibold text-slate-100'
                  : 'text-slate-400'
            }`}
          >
            {center}
          </span>
          {isLive && <LiveBadge minute={match.minute} injuryTime={match.injuryTime} />}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={`block truncate ${awayHi ? 'font-semibold text-slate-100' : 'text-slate-300'}`}
          >
            {away}
          </span>
          {awayOwner && (
            <span className="block truncate text-[10px] text-slate-400/60">({awayOwner})</span>
          )}
        </div>
      </div>
      <p className="mt-0.5 text-center text-[10px] text-slate-500">{meta}</p>
      {venue && (
        <p className="mt-0.5 text-center text-[10px] leading-tight text-slate-500">
          <span className="text-slate-400">{venue.venue}</span>
          <br />
          {venue.city}, {venue.country}
        </p>
      )}
    </div>
  );
}
