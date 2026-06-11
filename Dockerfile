# ── Stage 1: Build ────────────────────────────────────────────────────────────
# Installs all deps (including devDeps) and produces the two build artifacts:
#   - web/dist              (Vite static assets)
#   - server/dist/index.js  (esbuild single-file server bundle — shared inlined, no tsx)
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package manifests before source so Docker can cache the npm ci layer —
# it only re-runs if a package.json / lockfile changes, not on every code edit.
COPY package*.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci

# Copy source, build the web assets, and bundle the server.
COPY . .
RUN npm run build -w @sweepstake/web
RUN npm run bundle -w @sweepstake/server

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# Lean production image — runs the pre-built bundle with plain node (no tsx, no
# runtime TypeScript transpilation), so cold starts are fast.
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
# Repo root inside the image — paths.ts resolves datasets/ and web/dist from here.
ENV APP_ROOT=/app

# Install only production runtime dependencies (express, cors, csv-parse, dotenv).
# tsx is now a devDependency and is intentionally absent at runtime.
COPY package*.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci --omit=dev

# Built artifacts from stage 1 (the bundle inlines all server + shared source).
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/server/dist ./server/dist

# Tournament CSVs + scenario JSONs + sweepstake picks (no secrets — .env is not copied).
COPY datasets ./datasets

# Default port. Override with the PORT env var (Azure sets this automatically).
ENV PORT=8080
EXPOSE 8080

# Run the bundled server directly — no loader hook, no transpile step.
CMD ["node", "server/dist/index.js"]
