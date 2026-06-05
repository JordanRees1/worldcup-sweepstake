# Deployment Guide

This guide covers everything from running the app locally in dev mode through to deploying
it as a live hosted container on Azure. Read it top to bottom the first time; after that you
only need the relevant section.

---

## Part 1 — Local development (how things work on your laptop)

### How dev mode works

Running `npm run dev` starts **two processes** side by side:

```
Terminal                        Your browser
─────────────────────────────────────────────────────
npm run dev
  ├── Express API  :8787   ←── /api/* requests
  └── Vite web    :5173   ←── http://localhost:5173
            │
            └── Vite proxies /api/* to :8787
                (so the browser only talks to one port)
```

- The **API** (`server/`) reads your CSVs, calls football-data.org (or uses seed data), and
  computes the leaderboard, standings, etc.
- The **web** (`web/`) is React + TypeScript served hot-reload by Vite. It calls `/api/*`
  which Vite silently forwards to the Express server.
- The two processes are completely independent — you can restart the server without losing
  your browser state.

### Dev commands

```bash
npm run dev              # default (friends sweepstake, seed/no-API mode)
npm run dev:work         # work sweepstake
npm run dev:group-stage  # demo: matchday 1+2 done
npm run dev:quarters     # demo: groups + R32 + R16 done
npm run dev:final        # demo: everything through the semis, Final tomorrow

# Live results (needs server/.env with FOOTBALL_API_KEY set — see server/.env.example):
DATA_SOURCE=live npm run dev       # macOS/Linux
$env:DATA_SOURCE="live"; npm run dev  # Windows PowerShell
```

### Switching between sweepstakes

```bash
npm run dev                     # friends (default)
npm run dev:work                # work

# Any sweepstake by name:
$env:SWEEPSTAKE="work"; npm run dev       # PowerShell
SWEEPSTAKE=work npm run dev               # macOS/Linux
```

---

## Part 2 — Production mode (how it works when deployed)

### How production differs from dev

In production there is **no Vite**. The web was built once into static files (`web/dist/`)
and Express serves them directly. Everything runs from a single port:

```
Browser                         Container (single process)
────────────────────────────────────────────────────────────
                                Express on PORT (default 8080)
GET /            ───────────►  serve web/dist/index.html
GET /players     ───────────►  serve web/dist/index.html  (React Router handles it)
GET /api/health  ───────────►  API route
GET /api/overview ──────────►  API route
```

This means:
- One port, one process, one container — no separate Vite server
- `/api/*` is still the Express API
- Everything else is the React app (client-side routing handles the rest)
- CORS is disabled (the web and API are the same origin)

### Environment variables in production

| Variable | Required | Example | Notes |
|---|---|---|---|
| `SWEEPSTAKE` | No | `friends` | Which game to serve. Default: `friends` |
| `DATA_SOURCE` | No | `live` | `seed` (offline) or `live` (API). Default: `seed` |
| `FOOTBALL_API_KEY` | If `DATA_SOURCE=live` | `abc123...` | From football-data.org. **Never put in the image** |
| `PORT` | No | `8080` | Azure sets this automatically |
| `RESULTS_CACHE_TTL_SECONDS` | No | `60` | How long to cache API results in memory |
| `NODE_ENV` | Set in Dockerfile | `production` | Already set — do not override |

**The API key is always a host-managed secret** — set it in the Azure portal, never in the
image or in source control.

---

## Part 3 — Building and testing the container locally

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed.

### Build the image

```bash
# From the repo root:
docker build -t sweepstake .
```

This takes ~2 minutes the first time (npm ci + Vite build). Subsequent builds are fast —
Docker caches each layer, so only changed layers rebuild.

### Run it locally

```bash
# Seed mode (no API key, offline data) — the friends game:
docker run --rm -p 8080:8080 sweepstake

# Seed mode — the work game:
docker run --rm -p 8080:8080 -e SWEEPSTAKE=work sweepstake

# Live mode — friends game with your real API key:
docker run --rm -p 8080:8080 \
  -e DATA_SOURCE=live \
  -e FOOTBALL_API_KEY=your_key_here \
  sweepstake
```

Open http://localhost:8080 — you should see the sweepstake app served from the container.
The `● seed` / `● live` badge in the header tells you which mode it's running in.

### What to verify

- [ ] `http://localhost:8080` loads the Players screen
- [ ] `http://localhost:8080/api/health` returns `{"ok":true,...}`
- [ ] `http://localhost:8080/groups` loads group standings (React Router)
- [ ] `http://localhost:8080/bracket` loads the bracket
- [ ] The header shows `● seed` (or `● live` if you passed a key)
- [ ] Running with `SWEEPSTAKE=work` shows 24 players instead of 6

---

## Part 4 — Deploying to Azure Container Apps

### Overview: one container per sweepstake

Each sweepstake is a separate Azure Container App running the **same image**, just with
different environment variables. Two games = two apps, both from one `docker build`.

```
Azure Container Registry
  └── sweepstake:latest (one image)
        │
        ├── Container App: sweepstake-friends   SWEEPSTAKE=friends
        │   https://sweepstake-friends.<region>.azurecontainerapps.io
        │
        └── Container App: sweepstake-work      SWEEPSTAKE=work
            https://sweepstake-work.<region>.azurecontainerapps.io
```

### Prerequisites

1. **Azure CLI** — install from https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
   ```bash
   # Verify it's installed:
   az version
   ```

2. **Login to Azure:**
   ```bash
   az login
   ```

3. **Choose a subscription** (if you have multiple):
   ```bash
   az account list --output table
   az account set --subscription "your-subscription-name"
   ```

### Step 1 — Create a resource group and registry (once only)

```bash
# Pick a name and region (uksouth is closest to the UK)
RESOURCE_GROUP=sweepstake-rg
LOCATION=uksouth
REGISTRY=sweepstakeregistry   # must be globally unique, lowercase, no hyphens

az group create --name $RESOURCE_GROUP --location $LOCATION

az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $REGISTRY \
  --sku Basic \
  --admin-enabled true
```

### Step 2 — Build and push the image

```bash
# Log in to your registry
az acr login --name $REGISTRY

# Build and push (from the repo root)
az acr build \
  --registry $REGISTRY \
  --image sweepstake:latest \
  .
```

This builds the image in Azure (no local Docker needed after the test) and pushes it
automatically. ~3-4 minutes.

### Step 3 — Create the Container Apps environment (once only)

```bash
az containerapp env create \
  --name sweepstake-env \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

### Step 4 — Deploy the friends game

```bash
az containerapp create \
  --name sweepstake-friends \
  --resource-group $RESOURCE_GROUP \
  --environment sweepstake-env \
  --image $REGISTRY.azurecr.io/sweepstake:latest \
  --registry-server $REGISTRY.azurecr.io \
  --target-port 8080 \
  --ingress external \
  --env-vars \
    SWEEPSTAKE=friends \
    DATA_SOURCE=live \
    FOOTBALL_API_KEY=secretref:football-api-key \
  --secrets football-api-key=YOUR_KEY_HERE \
  --min-replicas 0 \
  --max-replicas 1
```

Replace `YOUR_KEY_HERE` with your real football-data.org key.
The key is stored as a **secret** in Azure — it never appears in the image or the command history
after this initial setup.

The command prints a URL like `https://sweepstake-friends.yellowsea-abc12345.uksouth.azurecontainerapps.io`.
Share that with your friends group.

### Step 5 — Deploy the work game

```bash
az containerapp create \
  --name sweepstake-work \
  --resource-group $RESOURCE_GROUP \
  --environment sweepstake-env \
  --image $REGISTRY.azurecr.io/sweepstake:latest \
  --registry-server $REGISTRY.azurecr.io \
  --target-port 8080 \
  --ingress external \
  --env-vars \
    SWEEPSTAKE=work \
    DATA_SOURCE=live \
    FOOTBALL_API_KEY=secretref:football-api-key \
  --secrets football-api-key=YOUR_KEY_HERE \
  --min-replicas 0 \
  --max-replicas 1
```

Same image, different `SWEEPSTAKE` env var.

### Step 6 — Update after a code change

When you push a code change, rebuild and update both apps:

```bash
# Rebuild + push
az acr build --registry $REGISTRY --image sweepstake:latest .

# Update both apps to the new image
az containerapp update --name sweepstake-friends --resource-group $RESOURCE_GROUP \
  --image $REGISTRY.azurecr.io/sweepstake:latest

az containerapp update --name sweepstake-work --resource-group $RESOURCE_GROUP \
  --image $REGISTRY.azurecr.io/sweepstake:latest
```

### Cost

With `--min-replicas 0`, each app **scales to zero** when nobody is using it — you pay nothing
for idle time. At your scale (≤50 users, occasional visits) the cost is effectively £0/month
on the Azure Container Apps free grant (750,000 vCPU-seconds and 1.5 million GiB-seconds free
per month per subscription).

The Azure Container Registry Basic tier costs ~£3.50/month. On your MPN credits that's covered.

---

## Part 5 — Adding a new sweepstake

1. Create the folder and config:
   ```bash
   mkdir datasets/sweepstakes/mygame
   ```

2. Create `datasets/sweepstakes/mygame/sweepstake.json`:
   ```json
   { "name": "My Game", "teamsPerPlayer": 4 }
   ```
   (`teamsPerPlayer × numPlayers` must equal 48.)

3. Create `datasets/sweepstakes/mygame/player_picks.csv`:
   ```csv
   player,team
   Alice,Brazil
   Alice,France
   Alice,England
   Alice,Japan
   Bob,Argentina
   ...
   ```

4. Check all picks resolve (catches typos before going live):
   ```bash
   SWEEPSTAKE=mygame npm run report:picks -w @sweepstake/server
   ```
   Fix any ❓ unmatched entries (add spelling variants to `server/src/data/aliases.ts`
   if needed) and re-run until all 48 show ✅.

5. Run locally:
   ```bash
   SWEEPSTAKE=mygame npm run dev          # macOS/Linux
   $env:SWEEPSTAKE="mygame"; npm run dev  # PowerShell
   ```

6. Deploy: rebuild the image and `az containerapp create` with `SWEEPSTAKE=mygame`.

---

## Part 6 — Optional: custom domain

By default Azure gives you a URL like `sweepstake-friends.yellowsea-abc.uksouth.azurecontainerapps.io`.
That works fine to share. If you want a shorter URL (e.g. `friends.yoursweep.co.uk`):

1. Buy a domain — `yoursweep.co.uk` costs ~£8/yr at most registrars (Namecheap, Cloudflare).
2. In the Azure portal → your Container App → Custom domains → Add.
3. Follow the prompts to add a CNAME DNS record at your registrar.
4. Azure provisions a free TLS certificate automatically.

One domain, two subdomains: `friends.yoursweep.co.uk` and `work.yoursweep.co.uk`.
