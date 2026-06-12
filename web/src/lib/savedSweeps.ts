/** Sweepstakes the user has opened on this device — for the landing-page picker. No accounts. */
export interface SavedSweep {
  code: string;
  name: string;
}

const KEY = 'sweepstake.saved.v1';

export function getSavedSweeps(): SavedSweep[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedSweep[]) : [];
  } catch {
    return [];
  }
}

/** Remember a sweepstake (most-recent first, delaying duplicates), capped to a sensible list. */
export function saveSweep(sweep: SavedSweep): void {
  try {
    const list = [sweep, ...getSavedSweeps().filter((s) => s.code !== sweep.code)];
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* storage disabled / quota — non-fatal */
  }
}

export function removeSweep(code: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(getSavedSweeps().filter((s) => s.code !== code)));
  } catch {
    /* non-fatal */
  }
}
