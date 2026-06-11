// Our audience is entirely UK-based, so we render dates/times in UK time explicitly
// (rather than the viewer's device timezone) for deterministic, consistent display.
// Note: the -1h kickoff correction (BF1) lives in the server's matches.ts, not here.
const UK_TZ = 'Europe/London';

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: UK_TZ,
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: UK_TZ,
  });
}
