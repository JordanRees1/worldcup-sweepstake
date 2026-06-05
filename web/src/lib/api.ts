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
} from '@sweepstake/shared';

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
  useQuery({ queryKey: ['overview'], queryFn: () => fetchJson<OverviewResponse>(API_ROUTES.overview) });

export const usePlayers = () =>
  useQuery({ queryKey: ['players'], queryFn: () => fetchJson<PlayersResponse>(API_ROUTES.players) });

export const useBracket = () =>
  useQuery({ queryKey: ['bracket'], queryFn: () => fetchJson<BracketResponse>(API_ROUTES.bracket) });

export const useSchedule = () =>
  useQuery({ queryKey: ['schedule'], queryFn: () => fetchJson<ScheduleResponse>(API_ROUTES.schedule) });

export const useTeams = () =>
  useQuery({ queryKey: ['teams'], queryFn: () => fetchJson<TeamsResponse>(API_ROUTES.teams) });

export const useGroups = () =>
  useQuery({ queryKey: ['groups'], queryFn: () => fetchJson<GroupsResponse>(API_ROUTES.groups) });

export const useAllMatches = () =>
  useQuery({ queryKey: ['matches'], queryFn: () => fetchJson<MatchesResponse>(API_ROUTES.matches) });

export const usePlayerDetail = (id: number) =>
  useQuery({
    queryKey: ['player', id],
    queryFn: () => fetchJson<PlayerDetailResponse>(API_ROUTES.player(id)),
    enabled: Number.isInteger(id) && id > 0,
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

/** Memoized matchId → Match lookup for score/time cross-referencing in the bracket. */
export function useMatchMap(): Map<number, Match> {
  const { data } = useAllMatches();
  return useMemo(() => {
    const map = new Map<number, Match>();
    for (const m of data?.matches ?? []) map.set(m.id, m);
    return map;
  }, [data]);
}
