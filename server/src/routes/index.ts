import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { loadStructural } from '../data/dataset';
import { resolveSweepstakeByCode } from '../data/sweepstake';
import type { TenantRecord, TenantStore } from '../data/tenantStore';
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
import { buildTenant, type RosterInput } from '../services/sweepstakeCreate';

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    handler(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Internal error';
      console.error('[api] error:', message);
      res.status(500).json({ error: { code: 'internal_error', message } });
    });
  };
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export function createApiRouter(gateway: Gateway, store: TenantStore, config: ServerConfig): Router {
  const router = Router();
  const teams = loadStructural().teams; // for create/validate normalization (loaded once)

  const header = (req: Request, name: string): string => (req.header(name) ?? '').trim();
  const createAllowed = (req: Request): boolean =>
    !config.createToken || header(req, 'x-create-token') === config.createToken;
  const isAdmin = (req: Request): boolean =>
    !!config.adminToken && header(req, 'x-admin-token') === config.adminToken;
  const ownerOrAdmin = (req: Request, record: TenantRecord): boolean => {
    if (isAdmin(req)) return true;
    const tok = header(req, 'x-owner-token');
    return !!record.ownerTokenHash && !!tok && sha256(tok) === record.ownerTokenHash;
  };

  async function uniqueCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = randomBytes(3).toString('hex');
      if (!resolveSweepstakeByCode(code) && !(await store.resolve(code))) return code;
    }
    throw new Error('could not allocate a unique code');
  }

  // ── Global ──────────────────────────────────────────────────────────────────
  router.get('/health', (_req, res) => {
    const meta = gateway.meta();
    res.json({ ok: true, dataSource: meta.source, lastUpdated: meta.lastUpdated, version: config.version });
  });

  // ── Create / validate ─────────────────────────────────────────────────────────
  router.post(
    '/sweepstakes/validate',
    asyncRoute(async (req, res) => {
      const result = buildTenant(teams, req.body as RosterInput);
      res.json(result);
    }),
  );

  router.post(
    '/sweepstakes',
    asyncRoute(async (req, res) => {
      if (!createAllowed(req)) {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid or missing create token' } });
        return;
      }
      const input = req.body as RosterInput;
      const result = buildTenant(teams, input);
      if (!result.ok || !result.players || !result.picks) {
        res.status(422).json({
          error: { code: 'validation', message: 'Could not create sweepstake' },
          issues: result.issues ?? [],
          errors: result.errors ?? [],
        });
        return;
      }
      const code = await uniqueCode();
      const ownerToken = randomBytes(16).toString('hex');
      const record: TenantRecord = {
        code,
        name: input.name.trim(),
        teamsPerPlayer: input.teamsPerPlayer,
        players: result.players,
        picks: result.picks,
        createdAt: new Date().toISOString(),
        ownerTokenHash: sha256(ownerToken),
      };
      await store.save(record);
      res.status(201).json({ code, ownerToken });
    }),
  );

  // ── Edit / delete (owner token or global admin) ────────────────────────────────
  router.patch(
    '/s/:code',
    asyncRoute(async (req, res) => {
      const code = req.params.code.toLowerCase();
      if (resolveSweepstakeByCode(code)) {
        res.status(403).json({ error: { code: 'forbidden', message: 'Built-in sweepstakes cannot be edited' } });
        return;
      }
      const record = await store.resolve(code);
      if (!record) {
        res.status(404).json({ error: { code: 'not_found', message: `No sweepstake "${code}"` } });
        return;
      }
      if (!ownerOrAdmin(req, record)) {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid owner/admin token' } });
        return;
      }
      const body = req.body as Partial<RosterInput>;
      let next: TenantRecord = { ...record };
      if (typeof body.name === 'string' && body.name.trim()) next.name = body.name.trim();
      if (body.players) {
        const result = buildTenant(teams, {
          name: next.name,
          teamsPerPlayer: body.teamsPerPlayer ?? record.teamsPerPlayer,
          players: body.players,
        });
        if (!result.ok || !result.players || !result.picks) {
          res.status(422).json({
            error: { code: 'validation', message: 'Could not update sweepstake' },
            issues: result.issues ?? [],
            errors: result.errors ?? [],
          });
          return;
        }
        next = {
          ...next,
          teamsPerPlayer: body.teamsPerPlayer ?? record.teamsPerPlayer,
          players: result.players,
          picks: result.picks,
        };
      }
      await store.save(next);
      gateway.invalidate(code);
      res.json({ code, name: next.name });
    }),
  );

  router.delete(
    '/s/:code',
    asyncRoute(async (req, res) => {
      const code = req.params.code.toLowerCase();
      if (resolveSweepstakeByCode(code)) {
        res.status(403).json({ error: { code: 'forbidden', message: 'Built-in sweepstakes cannot be deleted' } });
        return;
      }
      const record = await store.resolve(code);
      if (!record) {
        res.status(404).json({ error: { code: 'not_found', message: `No sweepstake "${code}"` } });
        return;
      }
      if (!ownerOrAdmin(req, record)) {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid owner/admin token' } });
        return;
      }
      await store.remove(code);
      gateway.invalidate(code);
      res.status(204).end();
    }),
  );

  // ── Tenant reads (/api/s/:code/*) ──────────────────────────────────────────────
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
