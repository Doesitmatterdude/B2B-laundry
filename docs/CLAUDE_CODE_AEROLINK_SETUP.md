# Building FreshFold with Claude Code + Aerolink (on GCP VPS)

This guide wires **Claude Code** on your Google Cloud VM to use the **Aerolink** Anthropic-compatible API as its model backend, then drives the build from the SRS.

## 0. Security first
- If you ever pasted your Aerolink key into a chat or shared it, **rotate it now** in the Aerolink dashboard.
- Store the key in **GCP Secret Manager** (or the VM's environment), never in the repo. `.env` is gitignored.

## 1. Provision the VM
```bash
bash infra/gcp/setup-vm.sh
# log out/in once so the docker group applies
```

## 2. Point Claude Code at Aerolink
Aerolink exposes an Anthropic-compatible endpoint, so Claude Code talks to it via the standard env vars:

```bash
# Add to ~/.bashrc on the VM (values from Aerolink; key from Secret Manager)
export ANTHROPIC_BASE_URL="https://capi.aerolink.lat"     # AEROLINK_BASE_URL
export ANTHROPIC_API_KEY="aero_live_********************"  # AEROLINK_API_KEY (rotated)
# Install Claude Code
npm install -g @anthropic-ai/claude-code
```

> Aerolink gives Claude (Pro, 200k context) with a credit pool ($10 / 5h, $70 / week).
> To conserve credits: work **one milestone at a time**, keep the SRS + this scaffold in context,
> and let Claude Code edit files directly rather than re-pasting large blocks.

## 3. Bootstrap the codebase
```bash
git clone <your-repo> freshfold && cd freshfold
cp apps/api/.env.example apps/api/.env   # fill DATABASE_URL, JWT secrets, AEROLINK_*
docker compose -f infra/docker/compose.yml up -d postgres redis
pnpm install
pnpm --filter @freshfold/api prisma:generate
pnpm --filter @freshfold/api prisma:migrate:dev --name init
pnpm --filter @freshfold/api prisma:seed     # demo tenant + admin@demo.laundry / Admin@12345
pnpm --filter @freshfold/api dev             # API on :3000/api/v1
```

Smoke test:
```bash
curl -s localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"identifier":"admin@demo.laundry","password":"Admin@12345"}'
```

## 4. Drive the build by milestone (SRS Section 21)
Open Claude Code in the repo root and prompt per milestone. Suggested kickoff:

```
Read docs/SRS.md and the existing apps/api scaffold.
Implement Milestone M1 (Client & Catalog) end-to-end:
- ClientsModule (CRUD + wizard payload), ClientSchedule, ClientContact, RateCard (effective-dated), WorkerAssignment, CategoriesModule.
- Enforce RBAC (@Roles/@Permissions) and tenant scoping (req.tenantId) on every route.
- Match the REST contracts in SRS Section 13.4, and the Prisma schema in apps/api/prisma/schema.prisma.
- Add unit + integration tests incl. a tenant-isolation test.
Do not break M0 auth. Stop after M1 and summarize.
```

Then proceed M2 → M8. The Prisma schema (Section 12) and API contracts (Section 13) are the **contracts of record** — Claude Code should conform to them, not invent new shapes.

## 5. The app's own AI features (later, M9+)
Runtime AI (forecasting/OCR/WhatsApp bot) lives in `apps/api/src/modules/ai`, calling Aerolink **server-side** with `AEROLINK_BASE_URL` + `AEROLINK_API_KEY` from Secret Manager. Never ship the key to the browser.

## 6. Deploy
```bash
docker compose -f infra/docker/compose.yml up -d --build
# add certbot TLS for your domain, then mount the cert into nginx
```
