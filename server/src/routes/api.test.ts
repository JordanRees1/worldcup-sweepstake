import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ApiError,
  BracketResponse,
  GroupsResponse,
  MatchesResponse,
  OverviewResponse,
  ScheduleResponse,
  TeamsResponse,
} from '@sweepstake/shared';
import { createApp } from '../app';
import { loadDataset } from '../data/dataset';
import { createSeedProvider } from '../providers/seedProvider';
import { createAppStateService } from '../services/appState';

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe('API routes (in-process HTTP, seed mode)', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const ds = loadDataset();
    const service = createAppStateService(ds, createSeedProvider(), 1000);
    const app = createApp(service, {
      port: 0,
      dataSource: 'seed',
      cacheTtlMs: 1000,
      version: 'test',
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}/api`;
  });

  afterAll(() => {
    server.close();
  });

  it('GET /health → ok + seed + version', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await getJson(res)).toMatchObject({ ok: true, dataSource: 'seed', version: 'test' });
  });

  it('GET /overview → Group Stage + 6 players', async () => {
    const body = await getJson<OverviewResponse>(await fetch(`${base}/overview`));
    expect(body.currentStage).toBe('Group Stage');
    expect(body.leaderboard).toHaveLength(6);
  });

  it('GET /groups → 12 tables', async () => {
    const body = await getJson<GroupsResponse>(await fetch(`${base}/groups`));
    expect(body.groups).toHaveLength(12);
  });

  it('GET /teams → 48 with status', async () => {
    const body = await getJson<TeamsResponse>(await fetch(`${base}/teams`));
    expect(body.teams).toHaveLength(48);
    expect(body.teams[0]?.status.teamId).toBe(body.teams[0]?.team.id);
  });

  it('GET /bracket → 6 rounds', async () => {
    const body = await getJson<BracketResponse>(await fetch(`${base}/bracket`));
    expect(body.rounds).toHaveLength(6);
  });

  it('GET /matches?group=A → 6', async () => {
    const body = await getJson<MatchesResponse>(await fetch(`${base}/matches?group=A`));
    expect(body.matches).toHaveLength(6);
  });

  it('GET /schedule → days present', async () => {
    const body = await getJson<ScheduleResponse>(await fetch(`${base}/schedule`));
    expect(body.days.length).toBeGreaterThan(0);
  });

  it('GET /players/:id → 404 envelope for unknown player', async () => {
    const res = await fetch(`${base}/players/9999`);
    expect(res.status).toBe(404);
    expect((await getJson<ApiError>(res)).error.code).toBe('not_found');
  });

  it('GET /players/abc → 400 for non-numeric id', async () => {
    const res = await fetch(`${base}/players/abc`);
    expect(res.status).toBe(400);
  });

  it('unknown route → 404 envelope', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    expect((await getJson<ApiError>(res)).error.code).toBe('not_found');
  });
});
