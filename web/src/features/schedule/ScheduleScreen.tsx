import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { useSchedule } from '../../lib/api';
import { formatDay, formatTime } from '../../lib/format';

export function ScheduleScreen() {
  const { data, isLoading, isError, error, refetch } = useSchedule();

  if (isLoading) return <LoadingState label="Loading schedule…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || data.days.length === 0) return <EmptyState>No fixtures scheduled.</EmptyState>;

  return (
    <div className="space-y-5">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Schedule</h2>

      {data.days.map((day) => (
        <section key={day.date}>
          <h3 className="mb-1 text-sm font-semibold text-slate-200">{formatDay(day.date)}</h3>
          <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5 px-3">
            {day.matches.map((match) => (
              <li key={match.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="text-slate-200">{match.label}</p>
                  <p className="text-[11px] text-slate-500">{match.stage}</p>
                </div>
                <span className="text-[11px] text-slate-400">{formatTime(match.kickoffAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
