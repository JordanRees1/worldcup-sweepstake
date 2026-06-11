import { useEffect, useRef, useState } from 'react';
import { FixtureRow } from '../../components/FixtureRow';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { useSchedule, useTeamMap, useTeamOwnerMap, useVenueMap } from '../../lib/api';
import { formatDay } from '../../lib/format';

export function ScheduleScreen() {
  const { data, isLoading, isError, error, refetch } = useSchedule();
  const teamMap = useTeamMap();
  const ownerByTeam = useTeamOwnerMap();
  const venueMap = useVenueMap();
  const [showPlayers, setShowPlayers] = useState(true);
  const currentRef = useRef<HTMLElement | null>(null);
  const didScroll = useRef(false);

  const days = data?.days ?? [];

  // "Where we are now" = the first day that still has an unplayed match.
  // (If everything's finished, anchor on the last day.)
  const currentIndex = (() => {
    const i = days.findIndex((d) => d.matches.some((m) => m.status !== 'finished'));
    return i === -1 ? Math.max(0, days.length - 1) : i;
  })();

  // Auto-scroll to the current day once, after data loads.
  useEffect(() => {
    if (!didScroll.current && currentRef.current && days.length > 0) {
      currentRef.current.scrollIntoView({ block: 'start' });
      didScroll.current = true;
    }
  }, [days.length]);

  if (isLoading) return <LoadingState label="Loading schedule…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (days.length === 0) return <EmptyState>No fixtures scheduled.</EmptyState>;

  return (
    <div className="space-y-5 lg:mx-auto lg:max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Schedule</h2>
        <button
          onClick={() => setShowPlayers((v) => !v)}
          aria-pressed={showPlayers}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            showPlayers
              ? 'bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40'
              : 'bg-white/5 text-slate-400 active:bg-white/10'
          }`}
        >
          {showPlayers ? '✓ Players' : 'Show players'}
        </button>
      </div>

      {days.map((day, index) => {
        const isPast = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <section
            key={day.date}
            ref={isCurrent ? currentRef : undefined}
            className={`scroll-mt-20 ${isPast ? 'opacity-45' : ''}`}
          >
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
              {formatDay(day.date)}
              {isCurrent && (
                <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-medium text-brand-300">
                  now
                </span>
              )}
            </h3>
            <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
              {day.matches.map((match) => (
                <div key={match.id} className={match.status === 'finished' ? 'opacity-60' : ''}>
                  <FixtureRow
                    match={match}
                    teamMap={teamMap}
                    hideDate
                    ownerByTeam={showPlayers ? ownerByTeam : undefined}
                    venue={venueMap.get(match.venueId)}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
