import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import type { Pick, Player } from '@sweepstake/shared';
import type { Dataset, StructuralData } from './dataset';
import { DATASETS_DIR } from './paths';
import type { SweepstakeConfig } from './sweepstake';

/**
 * A dynamically-created sweepstake (CLI or self-service), with picks already resolved to team ids
 * at creation time — so reads never re-parse a CSV. The "official" baked sweepstakes
 * (datasets/sweepstakes/*) are resolved separately; this store holds everything created at runtime.
 */
export interface TenantRecord {
  code: string;
  name: string;
  teamsPerPlayer: number;
  players: Player[];
  /** Resolved picks (every team picked exactly once across players). */
  picks: { playerId: number; teamId: number }[];
  createdAt: string;
  /** sha-256 of the owner edit token (set in Phase 3b). */
  ownerTokenHash?: string;
}

export interface TenantStore {
  resolve(code: string): Promise<TenantRecord | null>;
  list(): Promise<TenantRecord[]>;
  save(record: TenantRecord): Promise<void>;
  remove(code: string): Promise<boolean>;
}

/** File-backed store (dev + the CLI). One JSON per tenant under `dir`. */
export function createLocalTenantStore(dir: string): TenantStore {
  const file = (code: string): string => join(dir, `${code.toLowerCase()}.json`);
  return {
    async resolve(code) {
      const p = file(code);
      if (!existsSync(p)) return null;
      try {
        return JSON.parse(readFileSync(p, 'utf8')) as TenantRecord;
      } catch {
        return null;
      }
    },
    async list() {
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .flatMap((f) => {
          try {
            return [JSON.parse(readFileSync(join(dir, f), 'utf8')) as TenantRecord];
          } catch {
            return [];
          }
        });
    },
    async save(record) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file(record.code), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    },
    async remove(code) {
      const p = file(code);
      if (!existsSync(p)) return false;
      unlinkSync(p);
      return true;
    },
  };
}

/**
 * Azure Blob-backed store (prod): one JSON blob per tenant in the `tenants` container, authed via
 * the container app's managed identity (DefaultAzureCredential — also picks up `az login` locally).
 */
export function createBlobTenantStore(account: string, containerName = 'tenants'): TenantStore {
  const service = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    new DefaultAzureCredential(),
  );
  const container = service.getContainerClient(containerName);
  const blob = (code: string) => container.getBlockBlobClient(`${code.toLowerCase()}.json`);

  return {
    async resolve(code) {
      try {
        const buf = await blob(code).downloadToBuffer();
        return JSON.parse(buf.toString('utf8')) as TenantRecord;
      } catch (e) {
        if ((e as { statusCode?: number }).statusCode === 404) return null;
        throw e;
      }
    },
    async list() {
      const out: TenantRecord[] = [];
      try {
        for await (const item of container.listBlobsFlat()) {
          if (!item.name.endsWith('.json')) continue;
          try {
            const buf = await container.getBlockBlobClient(item.name).downloadToBuffer();
            out.push(JSON.parse(buf.toString('utf8')) as TenantRecord);
          } catch {
            /* skip a bad blob */
          }
        }
      } catch (e) {
        if ((e as { statusCode?: number }).statusCode !== 404) throw e; // no container yet → empty
      }
      return out;
    },
    async save(record) {
      await container.createIfNotExists();
      const data = JSON.stringify(record, null, 2);
      await blob(record.code).upload(data, Buffer.byteLength(data), {
        blobHTTPHeaders: { blobContentType: 'application/json' },
      });
    },
    async remove(code) {
      const r = await blob(code).deleteIfExists();
      return r.succeeded;
    },
  };
}

/**
 * Pick the store from env: Azure Blob when `AZURE_STORAGE_ACCOUNT` is set (prod), else a local
 * directory (dev + CLI).
 */
export function createTenantStore(): TenantStore {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  if (account) return createBlobTenantStore(account);
  return createLocalTenantStore(join(DATASETS_DIR, 'tenants'));
}

/** Build a Dataset for a stored tenant — picks are already resolved, so no CSV parsing. */
export function datasetFromRecord(structural: StructuralData, record: TenantRecord): Dataset {
  const teamById = new Map(structural.teams.map((t) => [t.id, t]));
  const picks: Pick[] = record.picks.map((p) => ({
    playerId: p.playerId,
    teamId: p.teamId,
    rawName: teamById.get(p.teamId)?.name ?? String(p.teamId),
    matched: true,
  }));
  const sweepstake: SweepstakeConfig = {
    slug: record.code,
    code: record.code,
    name: record.name,
    teamsPerPlayer: record.teamsPerPlayer,
    dir: '',
    picksPath: '',
  };
  return { ...structural, players: record.players, picks, sweepstake };
}
