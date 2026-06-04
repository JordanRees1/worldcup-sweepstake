import { QueryClient, useQuery } from '@tanstack/react-query';
import {
  API_ROUTES,
  type BracketResponse,
  type HealthResponse,
  type OverviewResponse,
  type PlayersResponse,
  type ScheduleResponse,
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
