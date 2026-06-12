import { Router, type Request, type Response } from 'express';
import type { ServerConfig } from '../env';
import type { AppState, Gateway } from '../services/appState';
import {
  buildBracket,
  buildGroups,
  buildMatches,
  buildMeta,
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

export function createApiRouter(gateway: Gateway, config: ServerConfig): Router {
  const router = Router();

  // Global health (no tenant) — used by Azure ingress + smoke tests.
  router.get('/health', (_req, res) => {
    const meta = gateway.meta();
    res.json({ ok: true, dataSource: meta.source, lastUpdated: meta.lastUpdated, version: config.version });
  });

  // Resolve the tenant for an /api/s/:code/* route, or 404 if the code is unknown.
  const tenant = (handler: (state: AppState, req: Request, res: Response) => void) =>
    asyncRoute(async (req, res) => {
      const state = await gateway.get(req.params.code);
      if (!state) {
        res
          .status(404)
          .json({ error: { code: 'not_found', message: `No sweepstake with code "${req.params.code}"` } });
        return;
      }
      handler(state, req, res);
    });

  router.get('/s/:code/meta', tenant((s, _req, res) => res.json(buildMeta(s))));
  router.get('/s/:code/overview', tenant((s, _req, res) => res.json(buildOverview(s))));
  router.get('/s/:code/players', tenant((s, _req, res) => res.json(buildPlayers(s))));
  router.get(
    '/s/:code/players/:id',
    tenant((s, req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: { code: 'bad_request', message: 'Invalid player id' } });
        return;
      }
      const detail = buildPlayerDetail(s, id);
      if (!detail) {
        res.status(404).json({ error: { code: 'not_found', message: `Player ${id} not found` } });
        return;
      }
      res.json(detail);
    }),
  );
  router.get('/s/:code/teams', tenant((s, _req, res) => res.json(buildTeams(s))));
  router.get('/s/:code/venues', tenant((s, _req, res) => res.json(buildVenues(s))));
  router.get('/s/:code/groups', tenant((s, _req, res) => res.json(buildGroups(s))));
  router.get('/s/:code/bracket', tenant((s, _req, res) => res.json(buildBracket(s))));
  router.get(
    '/s/:code/matches',
    tenant((s, req, res) => {
      const { stage, group, date } = req.query;
      res.json(
        buildMatches(s, {
          stage: typeof stage === 'string' ? stage : undefined,
          group: typeof group === 'string' ? group : undefined,
          date: typeof date === 'string' ? date : undefined,
        }),
      );
    }),
  );
  router.get('/s/:code/schedule', tenant((s, _req, res) => res.json(buildSchedule(s))));

  return router;
}
