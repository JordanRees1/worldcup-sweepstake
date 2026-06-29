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
import {
  assignBestThirds,
  computeAllGroupStandings,
  computeDecidedGroups,
  parseSource,
  rankAllThirds,
  resolveSource,
} from '../engine';
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

  const teamId = (tla: string | null): number | null =>
    tla ? (fifaCodeToTeamId.get(normalizeTla(tla)) ?? null) : null;
  const pairKey = (a: number, b: number): string => [a, b].sort((x, y) => x - y).join(':');
  // Live clock + stoppage time (v4.1) — only meaningful while a match is in play.
  const liveNum = (status: string, v: number | string | null | undefined): number | null => {
    const n = v != null ? Number(v) : NaN;
    return status === 'live' && Number.isFinite(n) ? n : null;
  };

  /** API knockout match keyed by its (resolved) team pair — mapped to our fixtures in resolveKnockouts. */
  interface KoMatch {
    homeId: number;
    awayId: number;
    status: MatchStatus;
    homeScore: number | null;
    awayScore: number | null;
    homePenalties: number | null;
    awayPenalties: number | null;
    winnerTeamId: number | null;
    minute: number | null;
    injuryTime: number | null;
  }

  /** Group-stage result (knockouts are resolved separately — see resolveKnockouts). */
  function mapGroupResult(m: ApiMatch): MatchResultDTO | null {
    const ourMatchId = resolveMatchId(m.homeTeam.tla, m.awayTeam.tla);
    if (!ourMatchId) return null;
    const status = mapStatus(m.status);
    const { fullTime, penalties } = m.score;
    return {
      matchId: ourMatchId,
      status,
      homeScore: fullTime.home,
      awayScore: fullTime.away,
      homePenalties: penalties?.home ?? null,
      awayPenalties: penalties?.away ?? null,
      minute: liveNum(status, m.minute),
      injuryTime: liveNum(status, m.injuryTime),
      winnerTeamId:
        m.score.winner === 'HOME_TEAM' ? teamId(m.homeTeam.tla)
        : m.score.winner === 'AWAY_TEAM' ? teamId(m.awayTeam.tla)
        : null,
    };
  }

  /**
   * Resolve the knockout bracket from group standings + the API's knockout matches. Our dataset's
   * knockout fixtures use label encodings (`2A vs 2B`, `1E vs 3ABCDF`, `W73 vs W75`) with no team ids,
   * so we can't map them by team-pair up front. Instead: once all 12 groups are decided, resolve R32
   * from standings (top-2 + the official Annexe C thirds), then walk the rounds — for each fixture whose
   * two teams are known, emit a slot and, if the API has that match (matched by team pair), its result;
   * a finished result feeds the next round's winners/losers.
   */
  function resolveKnockouts(
    groupResults: MatchResultDTO[],
    koByPair: Map<string, KoMatch>,
  ): { slots: ResolvedSlotDTO[]; results: MatchResultDTO[] } {
    const slots: ResolvedSlotDTO[] = [];
    const results: MatchResultDTO[] = [];

    const resById = new Map(groupResults.map((r) => [r.matchId, r]));
    const hydratedGroups = ourMatches
      .filter((m) => m.stage === 'Group Stage')
      .map((m): Match => {
        const r = resById.get(m.id);
        if (!r || r.homeScore === null || r.awayScore === null) return m;
        return {
          ...m,
          status: 'finished',
          result: { homeScore: r.homeScore, awayScore: r.awayScore, winnerTeamId: r.winnerTeamId },
        };
      });

    const tables = computeAllGroupStandings(teams, hydratedGroups);
    if (computeDecidedGroups(hydratedGroups).size !== 12) return { slots, results }; // R32 not set yet
    const bestThirds = assignBestThirds(rankAllThirds(tables).slice(0, 8));

    const winners = new Map<number, number>();
    const losers = new Map<number, number>();
    const knockouts = ourMatches
      .filter((m) => m.stage !== 'Group Stage')
      .sort((a, b) => a.stageOrder - b.stageOrder || a.id - b.id);

    for (const m of knockouts) {
      const [hf, af] = m.label.split(' vs ').map((s) => s.trim());
      if (!hf || !af) continue;
      const homeId = resolveSource(parseSource(hf, m.id), tables, bestThirds, winners, losers);
      const awayId = resolveSource(parseSource(af, m.id), tables, bestThirds, winners, losers);
      if (homeId === null || awayId === null) continue; // a feeding round isn't finished yet

      slots.push({ matchId: m.id, homeTeamId: homeId, awayTeamId: awayId });

      const ko = koByPair.get(pairKey(homeId, awayId));
      if (!ko) continue;
      // Orient the API scores to OUR home/away (the API may list the pair the other way round).
      const apiHomeIsOurHome = ko.homeId === homeId;
      results.push({
        matchId: m.id,
        status: ko.status,
        homeScore: apiHomeIsOurHome ? ko.homeScore : ko.awayScore,
        awayScore: apiHomeIsOurHome ? ko.awayScore : ko.homeScore,
        homePenalties: apiHomeIsOurHome ? ko.homePenalties : ko.awayPenalties,
        awayPenalties: apiHomeIsOurHome ? ko.awayPenalties : ko.homePenalties,
        winnerTeamId: ko.winnerTeamId,
        minute: ko.minute,
        injuryTime: ko.injuryTime,
      });
      if (ko.status === 'finished' && ko.winnerTeamId !== null) {
        winners.set(m.id, ko.winnerTeamId);
        losers.set(m.id, ko.winnerTeamId === homeId ? awayId : homeId);
      }
    }
    return { slots, results };
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
    const koByPair = new Map<string, KoMatch>();

    for (const m of data.matches) {
      if (m.stage === 'GROUP_STAGE') {
        const result = mapGroupResult(m);
        if (result) results.push(result);
        continue;
      }
      // Knockout match: collect it by team pair once both teams are known (resolved by the API).
      const homeId = teamId(m.homeTeam.tla);
      const awayId = teamId(m.awayTeam.tla);
      if (homeId === null || awayId === null) continue;
      const status = mapStatus(m.status);
      koByPair.set(pairKey(homeId, awayId), {
        homeId,
        awayId,
        status,
        homeScore: m.score.fullTime.home,
        awayScore: m.score.fullTime.away,
        homePenalties: m.score.penalties?.home ?? null,
        awayPenalties: m.score.penalties?.away ?? null,
        winnerTeamId:
          m.score.winner === 'HOME_TEAM' ? homeId : m.score.winner === 'AWAY_TEAM' ? awayId : null,
        minute: liveNum(status, m.minute),
        injuryTime: liveNum(status, m.injuryTime),
      });
    }

    const knockout = resolveKnockouts(results, koByPair);
    results.push(...knockout.results);

    const entry: CacheEntry = { results, slots: knockout.slots, fetchedAt: Date.now() };
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
