import { useMemo } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import {
  API_ROUTES,
  type BracketResponse,
  type GroupsResponse,
  type HealthResponse,
  type Match,
  type MatchesResponse,
  type OverviewResponse,
  type PlayerDetailResponse,
  type PlayersResponse,
  type ScheduleResponse,
  type Team,
  type TeamsResponse,
  type Venue,
  type VenuesResponse,
} from '@sweepstake/shared';

// Poll every 60s — matches the server cache TTL so we never burn extra API calls.
const POLL_INTERVAL = 60_000;

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

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: () => fetchJson<HealthResponse>(API_ROUTES.health) });

export const useOverview = () =>
  useQuery({
    queryKey: ['overview'],
    queryFn: () => fetchJson<OverviewResponse>(API_ROUTES.overview),
    refetchInterval: POLL_INTERVAL,
  });

export const usePlayers = () =>
  useQuery({
    queryKey: ['players'],
    queryFn: () => fetchJson<PlayersResponse>(API_ROUTES.players),
    refetchInterval: POLL_INTERVAL,
  });

export const useBracket = () =>
  useQuery({
    queryKey: ['bracket'],
    queryFn: () => fetchJson<BracketResponse>(API_ROUTES.bracket),
    refetchInterval: POLL_INTERVAL,
  });

export const useSchedule = () =>
  useQuery({
    queryKey: ['schedule'],
    queryFn: () => fetchJson<ScheduleResponse>(API_ROUTES.schedule),
    refetchInterval: POLL_INTERVAL,
  });

export const useTeams = () =>
  useQuery({ queryKey: ['teams'], queryFn: () => fetchJson<TeamsResponse>(API_ROUTES.teams) });

export const useVenues = () =>
  useQuery({ queryKey: ['venues'], queryFn: () => fetchJson<VenuesResponse>(API_ROUTES.venues) });

export const useGroups = () =>
  useQuery({
    queryKey: ['groups'],
    queryFn: () => fetchJson<GroupsResponse>(API_ROUTES.groups),
    refetchInterval: POLL_INTERVAL,
  });

export const useAllMatches = () =>
  useQuery({
    queryKey: ['matches'],
    queryFn: () => fetchJson<MatchesResponse>(API_ROUTES.matches),
    refetchInterval: POLL_INTERVAL,
  });

export const usePlayerDetail = (id: number) =>
  useQuery({
    queryKey: ['player', id],
    queryFn: () => fetchJson<PlayerDetailResponse>(API_ROUTES.player(id)),
    enabled: Number.isInteger(id) && id > 0,
    refetchInterval: POLL_INTERVAL,
  });

/** Memoized teamId → Team lookup, derived from /api/teams. */
export function useTeamMap(): Map<number, Team> {
  const { data } = useTeams();
  return useMemo(() => {
    const map = new Map<number, Team>();
    for (const { team } of data?.teams ?? []) map.set(team.id, team);
    return map;
  }, [data]);
}

/** Memoized teamId → owning player's name, derived from /api/players (each team is owned once). */
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

/** Memoized venueId → Venue lookup, derived from /api/venues. */
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
