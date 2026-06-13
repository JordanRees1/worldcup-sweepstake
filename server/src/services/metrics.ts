/**
 * Best-effort, in-memory usage metrics (Phase 4 admin panel). Per-replica and reset on restart —
 * NOT a source of truth. Priority admin metrics (sweep/player counts) come from the store; these
 * are the "secondary, approximate" signals the plan calls for. No PII: clients are anonymous ids.
 */
export interface TenantMetrics {
  /** Page loads (tenant /meta hits) seen by this replica since boot. */
  views: number;
  /** Distinct anonymous clients seen in the active window (default 5 min). */
  activeNow: number;
}

export interface Metrics {
  /** Record a tenant view; `clientId` (an anonymous localStorage uuid) powers "active now". */
  track(code: string, clientId?: string): void;
  snapshot(code: string): TenantMetrics;
}

export function createMetrics(activeWindowMs = 5 * 60_000): Metrics {
  const views = new Map<string, number>();
  const lastSeen = new Map<string, Map<string, number>>(); // code → clientId → ts

  return {
    track(code, clientId) {
      const key = code.trim().toLowerCase();
      if (!key) return;
      views.set(key, (views.get(key) ?? 0) + 1);
      if (clientId) {
        const seen = lastSeen.get(key) ?? new Map<string, number>();
        seen.set(clientId, Date.now());
        lastSeen.set(key, seen);
      }
    },
    snapshot(code) {
      const key = code.trim().toLowerCase();
      const seen = lastSeen.get(key);
      let activeNow = 0;
      if (seen) {
        const cutoff = Date.now() - activeWindowMs;
        for (const [id, ts] of seen) {
          if (ts >= cutoff) activeNow++;
          else seen.delete(id); // prune as we go
        }
      }
      return { views: views.get(key) ?? 0, activeNow };
    },
  };
}
