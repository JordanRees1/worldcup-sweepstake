/**
 * Live results provider: football-data.org v4 API (with the `X-API-Version: v4.1` header, which
 * opts into the live `minute` + `injuryTime` fields on the match response).
 *
 * Reconciliation strategy:
 *   Primary — team-pair TLA lookup: (homeTeam.tla, awayTeam.tla) → our matchId.
 *             Reliable for all 72 group matches and knockouts once teams are resolved.
 *   Fallback — skip (fixture not yet resolvable; no result to report anyway).
 *
 * Known TLA differences between the API and our FIFA codes:
 *   CUW → CUR  (Curaçao)
 *   URY → URU  (Uruguay)
 *
 * Rate limiting: the free tier allows 10 calls/minute.
 * We fetch all 104 matches in a single request and cache the response for the
 * configured TTL (default 60s) to stay well within the limit.
 */
import type { Match, Team } from '@sweepstake/shared';
import type { MatchResultDTO, ProviderMeta, ResolvedSlotDTO, ResultsProvider } from './types';

// ── football-data.org API types ───────────────────────────────────────────────

interface ApiTeamRef {
  id: number;
  name: string | null;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
}

interface ApiScore {
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
  duration: string;
  fullTime: { home: number | null; away: number | null };
  penalties: { home: number | null; away: number | null } | null;
}

interface ApiMatch {
  id: number;
  utcDate: string;
  status: string;
  /** Live match clock (minutes), present on livescore-enabled tiers while a match is IN_PLAY/PAUSED. */
  minute?: number | string | null;
  /** Stoppage/injury time (minutes added on), added in API v4.1. Present while IN_PLAY/PAUSED. */
  injuryTime?: number | string | null;
  stage: string;
  group: string | null;
  homeTeam: ApiTeamRef;
  awayTeam: ApiTeamRef;
  score: ApiScore;
}

interface ApiMatchesResponse {
  matches: ApiMatch[];
}

// ── TLA normalization ─────────────────────────────────────────────────────────

/** API TLAs that differ from our FIFA codes. */
const TLA_OVERRIDES: Record<string, string> = {
  CUW: 'CUR', // Curaçao
  URY: 'URU', // Uruguay
};

function normalizeTla(raw: string): string {
  const upper = raw.toUpperCase();
  return TLA_OVERRIDES[upper] ?? upper;
}

// ── Status mapping ────────────────────────────────────────────────────────────

import type { MatchStatus } from '@sweepstake/shared';

function mapStatus(apiStatus: string): MatchStatus {
  switch (apiStatus) {
    case 'FINISHED':
      return 'finished';
    case 'IN_PLAY':
    case 'PAUSED':
    case 'LIVE':
      return 'live';
    case 'POSTPONED':
    case 'SUSPENDED':
    case 'CANCELLED':
      return 'postponed';
    default:
      // SCHEDULED, TIMED, and any future variants → scheduled
      return 'scheduled';
  }
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  results: MatchResultDTO[];
  slots: ResolvedSlotDTO[];
  fetchedAt: number;
}

// ── Provider factory ──────────────────────────────────────────────────────────

export interface FootballApiConfig {
  apiKey: string;
  cacheTtlMs: number;
  /** How many times to retry a failed fetch before giving up. */
  maxRetries?: number;
}

export function createFootballApiProvider(
  teams: Team[],
  ourMatches: Match[],
  config: FootballApiConfig,
): ResultsProvider {
  const { apiKey, cacheTtlMs, maxRetries = 3 } = config;

  // Build: our FIFA code → our teamId
  const fifaCodeToTeamId = new Map<string, number>(teams.map((t) => [t.fifaCode, t.id]));

  // Build: "homeTeamId:awayTeamId" → our matchId  (group matches have real team IDs)
  const teamPairToMatchId = new Map<string, number>();
  for (const m of ourMatches) {
    if (m.homeTeamId !== null && m.awayTeamId !== null) {
      teamPairToMatchId.set(`${m.homeTeamId}:${m.awayTeamId}`, m.id);
    }
  }

  let cache: CacheEntry | null = null;
  let inflight: Promise<CacheEntry> | null = null;
  let lastUpdated: string | null = null;

  function resolveMatchId(apiHome: string | null, apiAway: string | null): number | null {
    if (!apiHome || !apiAway) return null;
    const homeId = fifaCodeToTeamId.get(normalizeTla(apiHome));
    const awayId = fifaCodeToTeamId.get(normalizeTla(apiAway));
    if (!homeId || !awayId) return null;
    return teamPairToMatchId.get(`${homeId}:${awayId}`) ?? null;
  }

  function mapApiMatch(m: ApiMatch): { result: MatchResultDTO | null; slot: ResolvedSlotDTO | null } {
    const ourMatchId = resolveMatchId(m.homeTeam.tla, m.awayTeam.tla);
    if (!ourMatchId) return { result: null, slot: null };

    const status = mapStatus(m.status);
    const { fullTime, penalties } = m.score;

    // Live clock + stoppage time (v4.1) — only meaningful while in play, on livescore-enabled tiers.
    const liveNum = (v: number | string | null | undefined): number | null => {
      const n = v != null ? Number(v) : NaN;
      return status === 'live' && Number.isFinite(n) ? n : null;
    };
    const minute = liveNum(m.minute);
    const injuryTime = liveNum(m.injuryTime);

    const result: MatchResultDTO = {
      matchId: ourMatchId,
      status,
      homeScore: fullTime.home,
      awayScore: fullTime.away,
      homePenalties: penalties?.home ?? null,
      awayPenalties: penalties?.away ?? null,
      minute,
      injuryTime,
      winnerTeamId:
        m.score.winner === 'HOME_TEAM' ? (fifaCodeToTeamId.get(normalizeTla(m.homeTeam.tla ?? '')) ?? null)
        : m.score.winner === 'AWAY_TEAM' ? (fifaCodeToTeamId.get(normalizeTla(m.awayTeam.tla ?? '')) ?? null)
        : null,
    };

    // Resolved slot: knockout match where both teams are now known
    const isKnockout = m.stage !== 'GROUP_STAGE';
    const homeId = m.homeTeam.tla ? fifaCodeToTeamId.get(normalizeTla(m.homeTeam.tla)) : null;
    const awayId = m.awayTeam.tla ? fifaCodeToTeamId.get(normalizeTla(m.awayTeam.tla)) : null;
    const slot: ResolvedSlotDTO | null =
      isKnockout && homeId && awayId ? { matchId: ourMatchId, homeTeamId: homeId, awayTeamId: awayId } : null;

    return { result, slot };
  }

  async function fetchWithRetry(url: string, attempt = 0): Promise<ApiMatchesResponse> {
    try {
      const res = await fetch(url, {
        // X-API-Version v4.1 opts into the live `minute` + `injuryTime` fields on the match response.
        headers: { 'X-Auth-Token': apiKey, 'X-API-Version': 'v4.1' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ApiMatchesResponse;
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt, 8000);
        await new Promise((r) => setTimeout(r, delay));
        return fetchWithRetry(url, attempt + 1);
      }
      throw err;
    }
  }

  async function doFetch(): Promise<CacheEntry> {
    lastUpdated = new Date().toISOString(); // mark the attempt time upfront
    const data = await fetchWithRetry(
      'https://api.football-data.org/v4/competitions/WC/matches',
    );

    const results: MatchResultDTO[] = [];
    const slots: ResolvedSlotDTO[] = [];

    for (const m of data.matches) {
      const { result, slot } = mapApiMatch(m);
      if (result) results.push(result);
      if (slot) slots.push(slot);
    }

    const entry: CacheEntry = { results, slots, fetchedAt: Date.now() };
    return entry;
  }

  async function getOrFetch(): Promise<CacheEntry> {
    if (cache && Date.now() - cache.fetchedAt < cacheTtlMs) return cache;
    if (!inflight) {
      inflight = doFetch()
        .then((entry) => {
          cache = entry;
          inflight = null;
          return entry;
        })
        .catch((err) => {
          inflight = null;
          // Surface error but fall back to stale cache or empty
          console.error('[footballApiProvider] fetch failed:', (err as Error).message);
          if (cache) return cache;
          throw err;
        });
    }
    return inflight;
  }

  return {
    async getResults(): Promise<MatchResultDTO[]> {
      try {
        return (await getOrFetch()).results;
      } catch {
        return [];
      }
    },
    async getResolvedSlots(): Promise<ResolvedSlotDTO[]> {
      try {
        return (await getOrFetch()).slots;
      } catch {
        return [];
      }
    },
    meta(): ProviderMeta {
      return { source: 'live', lastUpdated };
    },
  };
}
