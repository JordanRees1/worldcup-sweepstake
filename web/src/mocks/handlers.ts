import { http, HttpResponse } from 'msw';
import { API_ROUTES } from '@sweepstake/shared';
import {
  bracketFixture,
  healthFixture,
  overviewFixture,
  playersFixture,
  scheduleFixture,
} from './fixtures';

export const handlers = [
  http.get(API_ROUTES.health, () => HttpResponse.json(healthFixture)),
  http.get(API_ROUTES.overview, () => HttpResponse.json(overviewFixture)),
  http.get(API_ROUTES.players, () => HttpResponse.json(playersFixture)),
  http.get(API_ROUTES.bracket, () => HttpResponse.json(bracketFixture)),
  http.get(API_ROUTES.schedule, () => HttpResponse.json(scheduleFixture)),
];
