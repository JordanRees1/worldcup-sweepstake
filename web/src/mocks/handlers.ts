import { http, HttpResponse } from 'msw';
import { API_ROUTES } from '@sweepstake/shared';
import {
  bracketFixture,
  healthFixture,
  matchesFixture,
  overviewFixture,
  playersFixture,
  scheduleFixture,
} from './fixtures';

// Offline dev mocks (VITE_MOCKS=on). Routes are tenant-scoped (`/api/s/:code/…`); the mock
// ignores the code and always serves the same demo fixtures.
export const handlers = [
  http.get(API_ROUTES.health, () => HttpResponse.json(healthFixture)),
  http.get(API_ROUTES.meta(':code'), () =>
    HttpResponse.json({
      code: 'demo',
      name: 'Demo Sweepstake',
      teamsPerPlayer: 8,
      playerCount: playersFixture.players.length,
    }),
  ),
  http.get(API_ROUTES.overview(':code'), () => HttpResponse.json(overviewFixture)),
  http.get(API_ROUTES.players(':code'), () => HttpResponse.json(playersFixture)),
  http.get(API_ROUTES.bracket(':code'), () => HttpResponse.json(bracketFixture)),
  http.get(API_ROUTES.matches(':code'), () => HttpResponse.json(matchesFixture)),
  http.get(API_ROUTES.schedule(':code'), () => HttpResponse.json(scheduleFixture)),
];
