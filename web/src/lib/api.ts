import { useMemo } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import {
  API_ROUTES,
  type BracketResponse,
  type GroupsResponse,
  type HealthResponse,
  type Match,
  type MatchesResponse,
  type MetaResponse,
  type OverviewResponse,
  type PlayerDetailResponse,
  type PlayersResponse,
  type ScheduleResponse,
  type Team,
  type TeamsResponse,
  type Venue,
  type VenuesResponse,
} from '@sweepstake/shared';
import { useSweepstakeCode } from './sweepstake';

// Poll every 30s — matches the server cache TTL (RESULTS_CACHE_TTL_SECONDS=30) so we surface
// live scores promptly without burning extra upstream API calls (server coalesces to ≤2/min).
const POLL_INTERVAL = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry with backoff — also smooths the cold-start proxy 502 before the API is up.
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Request failed (${res.status}) for ${path}`);
  return (await res.json()) as T;
}

/** Global, tenant-independent. */
export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: () => fetchJson<HealthResponse>(API_ROUTES.health) });

/** Tenant identity for the active code — also validates the code (404 → isError). */
export const useMeta = () => {
  const code = useSweepstakeCode();
  return useQuery({
    queryKey: ['meta', code],
    queryFn: () => fetchJson<MetaResponse>(API_ROUTES.meta(code)),
    enabled: !!code,
    retry: 1, // an unknown code should 404 fast, not retry 3×
  });
};

export const useOverview = () => {
  const code = useSweepstakeCode();
  return useQuery({
    queryKey: ['overview', code],
    queryFn: () => fetchJson<OverviewResponse>(API_ROUTES.overview(code)),
    enabled: !!code,
    refetchInterval: POLL_INTERVAL,
  });
};

export const usePlayers = () => {
  const code = useSweepstakeCode();
  return useQuery({
    queryKey: ['players', code],
    queryFn: () => fetchJson<PlayersResponse>(API_ROUTES.players(code)),
    enabled: !!code,
    refetchInterval: POLL_INTERVAL,
  });
};

export const useBracket = () => {
  const code = useSweepstakeCode();
  return useQuery({
    queryKey: ['bracket', code],
    queryFn: () => fetchJson<BracketResponse>(API_ROUTES.bracket(code)),
    enabled: !!code,
    refetchInterval: POLL_INTERVAL,
  });
};

export const useSchedule = () => {
  const code = useSweepstakeCode();
  return useQuery({
    queryKey: ['schedule', code],
    queryFn: () => fetchJson<ScheduleResponse>(API_ROUTES.schedule(code)),
    enabled: !!code,
    refetchInterval: POLL_INTERVAL,
  });
};

export const useTeams = () => {
  const code = useSweepstakeCode();
  return useQuery({
    queryKey: ['teams', code],
    queryFn: () => fetchJson<TeamsResponse>(API_ROUTES.teams(code)),
    enabled: !!code,
  });
};

export const useVenues = () => {
  const code = useSweepstakeCode();
  return useQuery({
    queryKey: ['venues', code],
    queryFn: () => fetchJson<VenuesResponse>(API_ROUTES.venues(code)),
    enabled: !!code,
  });
};

export const useGroups = () => {
  const code = useSweepstakeCode();
  return useQuery({
    queryKey: ['groups', code],
    queryFn: () => fetchJson<GroupsResponse>(API_ROUTES.groups(code)),
    enabled: !!code,
    refetchInterval: POLL_INTERVAL,
  });
};

export const useAllMatches = () => {
  const code = useSweepstakeCode();
  return useQuery({
    queryKey: ['matches', code],
    queryFn: () => fetchJson<MatchesResponse>(API_ROUTES.matches(code)),
    enabled: !!code,
    refetchInterval: POLL_INTERVAL,
  });
};

export const usePlayerDetail = (id: number) => {
  const code = useSweepstakeCode();
  return useQuery({
    queryKey: ['player', code, id],
    queryFn: () => fetchJson<PlayerDetailResponse>(API_ROUTES.player(code, id)),
    enabled: !!code && Number.isInteger(id) && id > 0,
    refetchInterval: POLL_INTERVAL,
  });
};

/** Memoized teamId → Team lookup, derived from the tenant's /teams. */
export function useTeamMap(): Map<number, Team> {
  const { data } = useTeams();
  return useMemo(() => {
    const map = new Map<number, Team>();
    for (const { team } of data?.teams ?? []) map.set(team.id, team);
    return map;
  }, [data]);
}

/** Memoized teamId → owning player's name, derived from the tenant's /players. */
export function useTeamOwnerMap(): Map<number, string> {
  const { data } = usePlayers();
  return useMemo(() => {
    const map = new Map<number, string>();
    for (const p of data?.players ?? []) {
      for (const t of p.teams) map.set(t.team.id, p.player.name);
    }
    return map;
  }, [data]);
}

/** Memoized venueId → Venue lookup, derived from the tenant's /venues. */
export function useVenueMap(): Map<number, Venue> {
  const { data } = useVenues();
  return useMemo(() => {
    const map = new Map<number, Venue>();
    for (const v of data?.venues ?? []) map.set(v.id, v);
    return map;
  }, [data]);
}

/** Memoized matchId → Match lookup for score/time cross-referencing in the bracket. */
export function useMatchMap(): Map<number, Match> {
  const { data } = useAllMatches();
  return useMemo(() => {
    const map = new Map<number, Match>();
    for (const m of data?.matches ?? []) map.set(m.id, m);
    return map;
  }, [data]);
}
