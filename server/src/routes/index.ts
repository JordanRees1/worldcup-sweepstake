import { Router, type Request, type Response } from 'express';
import type { ServerConfig } from '../env';
import type { AppStateService } from '../services/appState';
import {
  buildBracket,
  buildGroups,
  buildHealth,
  buildMatches,
  buildOverview,
  buildPlayerDetail,
  buildPlayers,
  buildSchedule,
  buildTeams,
  buildVenues,
} from '../services/responses';

/** Wrap an async handler so any rejection becomes a structured 500 envelope. */
function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    handler(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Internal error';
      console.error('[api] error:', message);
      res.status(500).json({ error: { code: 'internal_error', message } });
    });
  };
}

export function createApiRouter(service: AppStateService, config: ServerConfig): Router {
  const router = Router();

  router.get(
    '/health',
    asyncRoute(async (_req, res) => {
      res.json(buildHealth(await service.get(), config.version));
    }),
  );

  router.get(
    '/overview',
    asyncRoute(async (_req, res) => {
      res.json(buildOverview(await service.get()));
    }),
  );

  router.get(
    '/players',
    asyncRoute(async (_req, res) => {
      res.json(buildPlayers(await service.get()));
    }),
  );

  router.get(
    '/players/:id',
    asyncRoute(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: { code: 'bad_request', message: 'Invalid player id' } });
        return;
      }
      const detail = buildPlayerDetail(await service.get(), id);
      if (!detail) {
        res.status(404).json({ error: { code: 'not_found', message: `Player ${id} not found` } });
        return;
      }
      res.json(detail);
    }),
  );

  router.get(
    '/teams',
    asyncRoute(async (_req, res) => {
      res.json(buildTeams(await service.get()));
    }),
  );

  router.get(
    '/venues',
    asyncRoute(async (_req, res) => {
      res.json(buildVenues(await service.get()));
    }),
  );

  router.get(
    '/groups',
    asyncRoute(async (_req, res) => {
      res.json(buildGroups(await service.get()));
    }),
  );

  router.get(
    '/bracket',
    asyncRoute(async (_req, res) => {
      res.json(buildBracket(await service.get()));
    }),
  );

  router.get(
    '/matches',
    asyncRoute(async (req, res) => {
      const { stage, group, date } = req.query;
      res.json(
        buildMatches(await service.get(), {
          stage: typeof stage === 'string' ? stage : undefined,
          group: typeof group === 'string' ? group : undefined,
          date: typeof date === 'string' ? date : undefined,
        }),
      );
    }),
  );

  router.get(
    '/schedule',
    asyncRoute(async (_req, res) => {
      res.json(buildSchedule(await service.get()));
    }),
  );

  return router;
}
