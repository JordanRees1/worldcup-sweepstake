# Plan — Multi-tenant "gateway" sweepstake (self-service, no logins)

_Revised 2026-06-12 with user decisions: both work + friends stay live in Phase 1; apex `sstake.co.uk`
canonical; creation gated by a shared `CREATE_TOKEN` (anti-bot); per-sweep owner token + global admin
token. (Secret values are NOT stored in this repo — set as Azure secrets at deploy.)_

## Context & goals

Today each sweepstake is its own always-warm container (`sweepstake-dev`=friends, `sweepstake-prod`=work)
selected by the `SWEEPSTAKE` env var, with picks baked into the image. We want **one** container that
hosts **many** sweepstakes, each addressed by a short **code** (`sstake.co.uk/s/<code>`), with
**self-service creation** and a **CLI** for bulk creation from `player_picks.csv` files.

Hard constraints (from the user):
- **No logins, no personal details.** Players are display names/nicknames only — no emails/accounts.
  This is what makes it safe to host in the work sub. (Edit/admin use unguessable tokens, not accounts.)
- **One container** to halve cost; reinvest the saving in **scale-out** (`max-replicas > 1`) and only
  bump size if load needs it (it won't, at this scale).
- **Existing users uninterrupted:** Phase 1 seeds **both** of today's sweepstakes as tenants — work at
  `/s/aa26` and friends at `/s/crackers` — so current links keep working. Only the *second container* is
  removed, **not** the friends sweepstake.
- **Cost target: under £20–40 for the whole tournament.** One always-warm container (~£5/mo → ~£6 over
  the ~38-day WC) + pennies of Blob storage lands comfortably under that (see Cost).
- Every sweepstake watches the **same World Cup** → the server fetches results **once** (shared 30s
  cache) and computes each tenant's leaderboard from its own picks. API usage stays flat (≤2 calls/min)
  no matter how many sweepstakes exist.

## Target architecture

```
football-data.org ──poll once──► [ ONE container app: sstake-gateway ]  sstake.co.uk
                                    │  shared results cache (30s, tournament-wide)
                                    │  tenant resolved per-request by <code>
                                    ▼
                            [ Tenant store ]  (Azure Blob; local dir in dev)
                            aa26·work · crackers·friends · 3f9c1a·Dave's mates · …
```

- **Shared layer (once):** teams/venues/matches (static dataset) + live results → standings, team
  status, bracket. Tournament-wide, identical for all tenants. Cached 30s.
- **Per-tenant layer (cheap, per code):** that sweepstake's players + picks → leaderboard. Computed
  from the shared layer + tenant picks via the existing pure engine functions.
- **Tenant store:** abstracted behind a `TenantStore` interface (mirrors the existing `ResultsProvider`
  pattern) — **Azure Blob Storage** in prod (one small JSON blob per tenant + an index), a **local
  directory** (`datasets/tenants/*.json`) in dev. App authenticates to Blob via the container app's
  **system-assigned managed identity** (Storage Blob Data Contributor) — no secret to store.

### Tenant record (the data model)
```jsonc
{
  "code": "aa26",                 // share/view code (URL) — custom, or 6-hex by default
  "name": "AA Work Sweep",
  "teamsPerPlayer": 2,
  "players": [{ "name": "Helen", "picks": ["Brazil", "Japan"] }, ...],
  "createdAt": "2026-...",
  "ownerToken": "<32-char random>",   // edit/delete THIS sweep; shown once at creation
  "stats": { "views": 0, "lastSeen": "..." }   // best-effort counters (see Admin)
}
```
Picks are stored normalised to canonical team ids at creation time (so reads are cheap and the messy-name
matching runs once, not per request).

## Code & URL scheme
- `/s/<code>` → load a sweepstake (app shell + that tenant's data).
- `/` → landing: if localStorage has saved sweeps → **picker** ("Your sweepstakes: [Work] [Dave's mates] + Join / Create"); else → enter-a-code / create.
- `/new` → self-service creation flow.
- `/a/admin` → admin (global-token-gated).
- API is tenant-scoped: `/api/s/:code/overview`, `/api/s/:code/players`, … `/api/a/*` for admin.
- **Codes:** default **6-hex** (`a3f9c1`, ~16.7M combos) generated at creation; custom codes allowed
  (e.g. `aa26`, `crackers`). Unguessable enough for view-only, low-stakes, no-PII data.

## UX — the code is never re-typed
- **Shareable link is the mechanism:** `sstake.co.uk/s/aa26` → tap, you're in. Bookmark / add to home screen / drop in the group chat.
- **localStorage** remembers joined codes (+ a display label) → auto-resume + the multi-sweepstake picker (handles "in the work sweep *and* my own friends' one").
- Typing a code is a one-time **join**; everything after is link/saved-list.

## Permissions & abuse (no-logins model)
**Three tokens, no accounts** (the two shared ones are Azure secrets — set out-of-band, **never in
source/repo**):
- **`CREATE_TOKEN`** — a shared "create password" required to create a sweep (the anti-bot gate). You
  hand it to people you trust to create sweeps. Checked by the `/new` flow / create API. *(Value chosen
  by the user; configured as an Azure Container App secret at deploy, like `FOOTBALL_API_KEY`.)*
- **Per-sweep owner token** (32-char, generated at creation, shown once): lets *that sweep's creator*
  edit/delete **only their own** sweep — this is how creators self-manage. They must save the
  "owner link" when they create it.
- **`ADMIN_TOKEN`** — global admin (yours): can edit/delete **any** sweep and opens `/a/admin`.
- **View code** grants **read only** — never edit, regardless of who holds it.
- **Gated creation + guards:** creation requires `CREATE_TOKEN`; on top of that, per-IP rate limits, a
  cap on total sweeps, max players/picks per sweep, and payload size limits. (A valid sweep must also be
  a clean 48-team partition — see Validation.) The **CLI bypasses the gate** (run locally by you/trusted).
- **Validation:** enforce `teamsPerPlayer × players = 48` and every team picked **exactly once**; reject
  malformed/duplicate pick sets before storing.

## Phases (incremental — each lands value)

### Phase 1 — Gateway + store + consolidate to one container (current users uninterrupted)
- **Server refactor:** split `appState` into a shared `resultsState` (cached 30s) + a per-tenant
  `buildTenantView(code)` that loads tenant picks from the store and runs `buildLeaderboard`. Routes
  become `/api/s/:code/*`. `dataset.ts` splits into *structural* (teams/matches/venues, loaded once) and
  *tenant* (players/picks, from store).
- **Tenant store:** add `TenantStore` (Blob in prod, local dir in dev) + seed it from the existing
  committed sweepstakes — **work → `aa26`**, **friends → `crackers`** (both custom codes; new sweeps
  default to 6-hex). Nothing lost.
- **Pick normalisation extracted** into a reusable module (from today's loader + `aliases.ts` +
  `report:picks`) — used by the store loader, the CLI, and self-service.
- **Web:** React Router `:code` routes; `api.ts` prefixes calls with the code; landing + localStorage picker.
- **Ops:** bind **apex `sstake.co.uk`** to the gateway — apex needs an **A record → env static IP
  `85.210.22.170`** + `asuid` TXT (*not* a CNAME); managed cert works for apex. *(Preferred; fall back to
  `worldcup.sstake.co.uk` as a CNAME vanity only if the apex A-record/cert proves troublesome.)* Rebind
  `aa`/`crackers` to the gateway and **301 → `/s/aa26`** and **`/s/crackers`** so old links survive;
  **delete `sweepstake-dev`** (friends data is preserved as the `crackers` tenant); set the gateway
  **`--min-replicas 1 --max-replicas 3`**.

### Phase 2 — CLI bulk creation
- `npm run sweepstake:create -- --picks <file.csv> --name "..." --teams-per-player N [--code aa26]`
  (new `server/src/scripts/createSweepstake.ts`). Reads a local `player_picks.csv`, runs the shared
  normaliser (surfacing ❓ unmatched names to fix), writes the tenant to the store, prints the **share
  code + owner link**. No `--code` → 6-hex generated.
- Reuses the exact validation the web flow will use (single source of truth). Also the tool used to seed
  `aa26`/`crackers` in Phase 1.

### Phase 3 — Self-service web creation (`/new`) with edit
- Form: name, teams-per-player, add players + their picks. **Interactive validation:** unmatched names
  surface "did you mean *Senegal*?"; enforce the domain rules (48-team partition, no duplicates). On
  submit → writes tenant, shows the share code + a **"save this owner link"** (one-time).
- **Editing in scope:** with the per-sweep owner token a creator can add/replace players or delete the
  sweep; the global admin token can do this for any sweep.

### Phase 4 — Admin panel (`/a/admin`)
- Gated by `ADMIN_TOKEN` (entered once → session cookie; **not** a login system).
- Shows: **# sweepstakes**, each one's **code + name + player count** (priority metrics — accurate from
  the store), created date; per-sweep edit/delete (global override).
- **Usage metrics (best-effort, secondary):** a per-tenant **view counter** incremented on load and
  flushed to the store periodically (approximate under scale-out, acceptable). **"Active now"** =
  distinct anonymous client-ids (a localStorage UUID sent as a header) seen in the last ~5 min, held
  in-memory per replica — flagged approximate when `max-replicas > 1`. (Accurate cross-replica metrics,
  if ever wanted, = the kept Log Analytics workspace or a Table-Storage counter.)

## Cost (target: < £20–40 for the whole WC)
- Delete `sweepstake-dev` → **one** always-warm app ≈ **£5/mo → ~£6 over the ~38-day tournament**.
  `max-replicas 3` only bills extra *during* a burst (rare, brief). Blob storage for tiny JSON ≈ pennies.
  **Estimated total for the WC: ~£6–12** — comfortably inside budget, with burst headroom. (Keeping
  `min-replicas 1` for instant boot costs only ~£6 for the whole event, so not worth degrading to
  scale-to-zero.)

## Decisions (confirmed)
1. **Domain:** apex **`sstake.co.uk`** is canonical (A-record → static IP + `asuid` TXT); old
   `aa`/`crackers` subdomains 301-redirect to `/s/aa26` and `/s/crackers`. Fallback to
   `worldcup.sstake.co.uk` only if the apex binding proves troublesome.
2. **Storage:** Azure **Blob** for tenant JSON (cheapest, simplest, managed-identity auth). View counters
   live alongside in Blob; add Table Storage later only if accurate cross-replica metrics are wanted.
3. **Editing in scope:** creators edit/delete their own sweep via the per-sweep owner token; you edit/
   delete any via the global admin token.
4. **Creation is gated by a shared `CREATE_TOKEN`** (an Azure secret — set out-of-band, never in
   source) plus the abuse guards above. Anyone holding the create-token can create; the CLI (run locally
   by you) bypasses the gate.

## Verification approach (per phase)
- Unit-test the shared/tenant split + normaliser; local store with the seeded `aa26`/`crackers` + 1-2
  generated tenants; browser-verify code routing + picker via the preview tools; quick load-test the
  single container at ~10 req/s to confirm headroom; then deploy + smoke-test `sstake.co.uk/s/aa26`,
  `/s/crackers`, and a freshly-created 6-hex code.
