# LeadSignal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax for tracking. During implementation also use: `superpowers:test-driven-development` (scoring/generator libs), `frontend-design` (UI), `dataviz` (all charts/dashboard), `verify` (before each phase commit).

**Goal:** Build LeadSignal — an AI Lead Quality & Media-Buying Optimization Agent (hackathon MVP for It's Today Media) that ingests lead+campaign CSVs, deterministically scores lead quality, aggregates quality by acquisition source, and answers media-buyer questions via a Claude-powered agentic analyst — optimizing for **qualified CPL** instead of raw CPL.

**Architecture:** Single Next.js 15 (App Router, TS) app on Cloud Run. Deterministic two-pass scoring in pure TypeScript at ingest time; daily-grain rollups materialized to Postgres; Claude Opus 4.8 tool-use agent grounded exclusively in typed metric tools (LLM explains, never invents numbers); Haiku 4.5 for on-demand per-lead explanations.

**Tech Stack:** Next.js 15 · TypeScript (strict) · Tailwind v4 + shadcn/ui · Recharts · Papaparse · Zod · libphonenumber-js · Postgres (Cloud SQL) + Drizzle ORM (`pg` driver) · `@anthropic-ai/sdk` · Docker/Cloud Run · Artifact Registry · Secret Manager · GitHub Actions (WIF) · Vitest.

---

## Context

The user is applying to It's Today Media (performance-marketing/affiliate-media company) with a project submission. A generic sales-qualification chatbot scores 4/10 fit; the validated concept — **LeadSignal, a Lead Quality and Media-Buying Optimization Agent** — scores 9/10 because it closes the loop between ad spend and downstream lead value. The demo must make one insight land: *Campaign A looks cheapest by raw CPL ($1.20) but is worst by qualified CPL ($8.40); Campaign B/C are the real winners.* Judges must be able to use it with zero data prep (bundled synthetic dataset). Repo is a blank WebStorm scaffold (placeholder `package.json` + `index.js` get replaced).

## Confirmed decisions (user-approved)

| Decision | Choice |
|---|---|
| Scoring engine | Pure TypeScript inside Next.js (no Python service) |
| Database | **Cloud SQL Postgres** (user-confirmed) + Drizzle; no Cloud-SQL-only features so the `DATABASE_URL` can swap to Neon |
| LLM | **Claude via direct Anthropic API** (user-confirmed): `claude-opus-4-8` analyst, `claude-haiku-4-5` explanations; Sonnet 5 = documented cost fallback for the analyst |
| Demo access | **Shared password** (user-confirmed) in middleware → signed httpOnly cookie (no accounts) |
| Hosting | Cloud Run (Next standalone container); GitHub Actions CI/CD |

## Global constraints

- Money stored as **integer cents**, scores as **integers 0–100**, probability as `real` (Drizzle `numeric` returns strings — never use it).
- **LLM never generates metrics.** All numbers come from deterministic TS code; Claude tools/prompts only relay and explain them.
- Single source of truth in `src/lib/scoring/constants.ts`: **HQ lead = composite ≥ 70 AND segment ≠ 'suppress'; qualified CPL = spendCents ÷ hqLeadCount.** Scorer, rollups, generator, tests, and prompts all import it.
- Anthropic API (verified current): Opus 4.8 → `thinking: {type:'adaptive', display:'summarized'}` set explicitly, optional `output_config:{effort:'high'}`; **never** `temperature`/`top_p`/`top_k`/`budget_tokens` (400 errors). Haiku 4.5 → no `thinking`, no `effort`. Centralize all request construction in `src/lib/anthropic.ts`. Multi-turn: echo assistant content blocks (incl. thinking) back verbatim.
- No real ad-platform writes ever — "approve" only flips a status on a simulated-actions row.
- Node 22; Next `output: 'standalone'`; middleware is edge runtime → Web Crypto only (no node `crypto`).
- Datasets are immutable after ingest (enables materialized rollups).

## File structure

```
src/
  middleware.ts                    # password gate (HMAC cookie via crypto.subtle)
  db/schema.ts  db/index.ts        # Drizzle schema · pg Pool (socket/TCP autodetect, max:5)
  db/rollups.ts                    # INSERT..SELECT..GROUP BY materialization (5 dims)
  lib/scoring/constants.ts         # weights, caps, segment rules, HQ definition, flag enum
  lib/scoring/{validity,intent,value,probability,flags}.ts
  lib/scoring/score.ts             # two-pass orchestrator (pure, no I/O)
  lib/scoring/disposable-domains.ts
  lib/ingest/parse.ts              # Papaparse streaming + 1k-row chunked inserts + progress
  lib/sample-data/config.ts        # campaign archetypes — the A/B/C story lives HERE
  lib/sample-data/generate.ts      # mulberry32 seeded PRNG generator (dep-free)
  lib/analyst/{system-prompt,tools,schemas,run}.ts   # 7 betaZodTools · card Zod contract · toolRunner+SSE
  lib/anthropic.ts                 # singleton client + model constants
  app/(auth)/login/page.tsx
  app/(app)/layout.tsx             # nav shell + dataset switcher
  app/(app)/datasets/page.tsx                      # Screen 1: ingestion
  app/(app)/datasets/[id]/leads/page.tsx           # Screen 2: lead analysis
  app/(app)/datasets/[id]/dashboard/page.tsx       # Screen 3: campaign quality
  app/(app)/datasets/[id]/analyst/page.tsx         # Screen 4: agent chat
  app/api/auth/login/route.ts
  app/api/datasets/route.ts        # POST multipart upload · GET list
  app/api/datasets/sample/route.ts # "Load sample data" (runs generator → same pipeline)
  app/api/datasets/[id]/status/route.ts            # progress polling
  app/api/sample.csv/route.ts      # deterministic CSV download
  app/api/leads/[id]/explain/route.ts              # Haiku explain-on-demand (DB-cached)
  app/api/analyst/route.ts         # SSE stream (nodejs runtime, force-dynamic)
  app/api/analyst/actions/[id]/approve/route.ts
tests/{scoring,story,generator}.test.ts            # Vitest
drizzle/ (committed migrations) · drizzle.config.ts · Dockerfile · docker-compose.yml (local pg)
docs/IMPLEMENTATION_PLAN.md        # this document, committed in Phase 0
```

## Data model (`src/db/schema.ts` — 6 tables)

- **datasets**: `id` uuid pk · `name` · `source` enum(upload,sample) · `status` enum(processing,scoring,ready,error) · `error?` · `rowCount` · `processedCount` (progress polling) · `scoringVersion` (weights fingerprint) · `createdAt`.
- **leads**: `id` uuid pk · `datasetId` fk cascade · raw CSV cols (`leadExternalId, createdAt, email, phone, campaign, adSet, creative, platform, landingPage, costCents, emailOpened, emailClicked, smsClicked, converted, revenueCents`) · derived (`validityScore, intentScore, valueScore, compositeScore, conversionProbability, segment` enum(high_value,nurture,test,suppress,review), `riskFlags` jsonb string[], `scoreBreakdown` jsonb per-rule receipt, `isDuplicate`, `duplicateOfLeadId?`) · Haiku cache (`explanation?, explanationModel?, explanationAt?`). Indexes: (datasetId), (datasetId,campaign), (datasetId,segment), (datasetId,compositeScore), (datasetId,createdAt).
- **rollups** (daily grain, **additive measures only** — ratios always derived at query time): `datasetId · dimension` enum(campaign,ad_set,creative,platform,landing_page) · `dimensionValue · day · leadCount · hqLeadCount · suppressCount · spendCents · revenueCents · conversions · scoreSum` · unique(datasetId,dimension,dimensionValue,day). Materialized once at end of scoring (5 `INSERT..SELECT..GROUP BY` statements); ≤ a few thousand rows even at 100k leads → instant dashboards, small clean tool queries.
- **agent_conversations**: id, datasetId, title, createdAt. **agent_messages**: conversationId, role, `contentJson` (verbatim Anthropic content blocks for faithful replay), `usageJson?`, createdAt.
- **actions** (simulated audit log): datasetId, conversationId?, `type` (pause_campaign|shift_budget|pause_creative|swap_landing_page), payload jsonb, rationale, estimatedImpact jsonb, confidence, `status` enum(proposed,approved_simulated,dismissed), createdAt, resolvedAt?.

## Scoring engine (deterministic, transparent — `src/lib/scoring/`)

Pure functions, zero I/O. Every rule appends a line item to `scoreBreakdown` so the UI renders the arithmetic and the analyst cites it.

**Pass 1 — dataset scan:** normalize (email lowercase + gmail dot/plus-tag canonicalization; phone → E.164 via libphonenumber-js, `'US'` fallback) · duplicate maps on normalized email/phone (first by `createdAt` wins; later → `isDuplicate` + `duplicateOfLeadId`) · burst detection: per landingPage sliding window, flag all leads where **≥5 share a landing page within 120s** · value norms: per source (campaign / landingPage / platform) avg revenueCents-per-lead + conversion rate → percentile table.

**Pass 2 — per-lead sub-scores (each 0–100):**

| Sub-score | Weight | Components |
|---|---|---|
| Validity | 0.40 | email syntactically valid **+35** · non-disposable domain **+15** · phone `isValid()` **+25** · not duplicate **+15** · no burst flag **+10** |
| Intent | 0.35 | `emailOpened` **+30** · `emailClicked` **+40** · `smsClicked` **+30** |
| Value | 0.25 | percentile rank of source expected revenue/lead (blend 70% campaign, 30% landing page) |

**Composite** = `round(0.40·validity + 0.35·intent + 0.25·value)`; hard caps: duplicate → ≤15; email AND phone both invalid → ≤20.

**Conversion probability** (calibrated logistic, no ML training): `z = -3.2 + 1.2·(validity/100) + 2.8·(intent/100) + 1.4·(value/100)`, `p = 1/(1+e^-z)`; then per-dataset Platt-style intercept shift `b0' = b0 + logit(observedConvRate) − logit(mean(p_raw))` and recompute. Framing: "hand-calibrated logistic over transparent sub-scores, intercept-fit to your data."

**Segments** (first match): `suppress` (duplicate OR validity<40 OR composite<25) → `review` (burst, or exactly one contact channel invalid with decent engagement) → `high_value` (composite≥75 AND p≥0.25) → `nurture` (50–74) → `test` (25–49).

**Risk flags:** `invalid_email, disposable_email, invalid_phone, duplicate, burst_submission, no_engagement, low_value_source (value<20), high_cost_low_quality (cost>2× dataset median AND composite<40)`.

Runs synchronously inside the upload/sample route handler (Cloud Run only guarantees CPU while a request is open; ~100k leads = seconds of pure TS).

## Synthetic dataset (`src/lib/sample-data/`)

Seeded **mulberry32** PRNG (fixed seed constant) → byte-identical output. Config-driven archetypes: **~6,000 leads, 30 days ending yesterday, 5 campaigns** × platforms (Meta/TikTok/Google) × 3–4 creatives × landing pages v1–v4. Each archetype declares volume curve, cost distribution, duplicate/disposable/invalid-phone rates, burst events, open/click/sms rates, conversion rate, revenue distribution.

**Engineered demo story (targets the scorer, asserted in CI):**
- **Campaign A "Broad Awareness — Instant Forms"**: cost ~$1.20; ~25% dupes, ~12% disposable, ~15% invalid phone, open 12%/click 3%, 3 burst events → HQ ≈14% → **raw ≈$1.20 / qualified ≈$8.40**.
- **Campaign B "Search — High Intent"**: ~$2.10 clean, open 45%/click 22% → **qualified ≈$4.60**. From **day ~18** traffic shifts to `lp-v4` with engagement halved + invalid rates doubled → visible trend dip = canonical answer to "why did quality decline this week?".
- **Campaign C "Retargeting — Webinar"**: ~$2.70, HQ ≈53%, top conversion + revenue/lead → **qualified ≈$5.10, best quality-adjusted ROAS**.
- Campaigns D/E: unremarkable filler.

Runs at **runtime**: "Load sample dataset" button → `POST /api/datasets/sample` generates in-process and pushes rows through the *exact same* ingest+scoring pipeline (~2–3s). `/api/sample.csv` streams the same rows for testing the upload path. `tests/story.test.ts` runs generator → scorer → rollups in-memory and asserts each campaign's raw/qualified CPL within tolerance bands (e.g. A qualified ∈ [7.50, 9.50]) — the guardrail that keeps weight tweaks from silently breaking the pitch.

## Agentic analyst (`src/lib/analyst/`, `app/api/analyst/route.ts`)

**7 typed tools** (`betaZodTool` from `@anthropic-ai/sdk/helpers/beta/zod`) — chosen over a guarded-SQL tool so every number structurally flows through deterministic metric code:

1. `get_dataset_overview()` — date range, totals, raw vs qualified CPL, segment distribution.
2. `get_campaign_metrics({dimension, filterValue?, dateFrom?, dateTo?})` — rollups + derived ratios.
3. `get_quality_trend({dimension?, value?, dateFrom?, dateTo?})` — daily series (leads, hqRate, qualifiedCpl, avgScore).
4. `compare_periods({dimension, periodA, periodB})` — per-value deltas.
5. `get_lead_sample({campaign?, segment?, riskFlag?, minScore?, maxScore?, limit≤20})` — evidence leads with breakdowns.
6. `simulate_budget_shift({shifts:[{campaign, deltaBudgetCents}]})` — pure projection from current qualified CPL + revenue/HQ-lead; no writes.
7. `log_recommended_action({type, targets[], params, rationale, evidence[], confidence: enum, estimatedImpact:{metric,from,to}, suggestedNextAction})` — **only writing tool**; inserts `actions` row (status `proposed`), returns id.

The `log_recommended_action` input schema **is** the RecommendationCard contract (`schemas.ts`) — rendered in chat with an **Approve (simulate)** button → `POST /api/analyst/actions/[id]/approve` flips to `approved_simulated`. Dashboard's non-chat "Generate recommendations" button uses `client.messages.parse` + `zodOutputFormat(RecommendationCardList)` over the inlined rollup table (same schema, no tool loop).

**Runtime:** `client.beta.messages.toolRunner({stream:true, maxIterations:12, ...})`; SSE route handler (`runtime='nodejs'`, `dynamic='force-dynamic'`) emitting app events `thinking | text_delta | tool_start | tool_result | card | done{usage} | error`; headers `text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; **`: ping` heartbeat every 15s**. Conversation state DB-backed (client sends `{conversationId, datasetId, userMessage}`; server replays `agent_messages`). Prompt caching: stable system prompt + fixed tool list first, `cache_control:{type:'ephemeral'}` on system block; per-dataset context injected as first user turn (never into `system`). Truncate tool results to top-N rows.

**Per-lead explanations:** `POST /api/leads/[id]/explain` → Haiku 4.5 via `messages.parse` (`{explanation, keyFactors[]}` Zod shape), input = the lead's `scoreBreakdown`, system rule: *explain the given scores; never restate different numbers*; cached to `leads.explanation`. Explain-on-demand only (never explain-all at ingest). Nice-to-have: segment-level bulk via Message Batches API (50% price, match results by `custom_id`, unordered).

---

## Build phases (each independently demoable; % = effort share)

### Phase 0 — Scaffold & foundations (5%, Must)
- [ ] Delete placeholder `index.js` + `package.json`; add `.gitignore` (node, .next, .env*, .idea optional)
- [ ] `npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint` (Next 15, Tailwind v4); `npx shadcn@latest init`; add deps: `drizzle-orm pg papaparse zod libphonenumber-js recharts @anthropic-ai/sdk`; dev: `drizzle-kit vitest @types/pg @types/papaparse`
- [ ] Commit this plan as `docs/IMPLEMENTATION_PLAN.md` (the user's requested md deliverable)
- [ ] `docker-compose.yml` with Postgres 16; `.env.local` (`DATABASE_URL, ANTHROPIC_API_KEY, APP_PASSWORD, AUTH_COOKIE_SECRET`); `.env.example` committed
- [ ] `src/middleware.ts` password gate: matcher excludes `/login`, `/api/auth/login`, `_next/*`, favicon; cookie = HMAC-SHA256(`AUTH_COOKIE_SECRET`, `'leadsignal-v1'`) via `crypto.subtle`; login page + route
- [ ] App shell layout (nav + dataset switcher) with shadcn; follow `frontend-design` skill
- [ ] **Verify:** `npm run dev` → redirected to /login → password admits; commit

### Phase 1 — Schema, ingest & Screen 1 (10%, Must)
- [ ] `src/db/schema.ts` (6 tables above) + `src/db/index.ts` (pg Pool `max:5`, detects `?host=/cloudsql/` vs TCP); `drizzle-kit generate` → commit `drizzle/`
- [ ] `src/lib/ingest/parse.ts`: Papaparse streaming from request body (no disk), header validation against expected columns, 1k-row chunked inserts, `processedCount` updates per chunk
- [ ] `POST /api/datasets` (multipart; creates dataset row fast, then parses), `GET /api/datasets`, `GET /api/datasets/[id]/status`
- [ ] Screen 1: upload dropzone (client-side Papaparse header preview for instant column feedback), dataset list (RSC), progress via status polling
- [ ] **Verify:** upload a hand-made 20-row CSV → dataset `ready`, counts correct; commit

### Phase 2 — Scoring engine & Screen 2 (20%, Must) — TDD
- [ ] Write Vitest specs first (`tests/scoring.test.ts`): normalization, dup detection, burst window, each sub-score, caps, calibration, segment boundaries (e.g. composite 74 vs 75)
- [ ] Implement `src/lib/scoring/*` per spec above; wire into ingest (dataset status `processing → scoring → ready`); write `scoreBreakdown` receipts
- [ ] Screen 2: leads table (RSC, filter by segment/flag/campaign, sort by score, paginate via `searchParams` — note Next 15: `await searchParams`), score badge, lead drawer showing the breakdown receipt + flags
- [ ] **Verify:** `npx vitest run` green; upload CSV with planted dupes/disposables → expected segments/flags visible; commit

### Phase 3 — Synthetic dataset & demo story (10%, Must) — TDD
- [ ] `config.ts` archetypes + `generate.ts` (mulberry32); `tests/story.test.ts` asserting A/B/C raw+qualified CPL tolerance bands and the day-18 lp-v4 dip; `tests/generator.test.ts` (determinism: same seed → same bytes)
- [ ] `POST /api/datasets/sample` (generator → same pipeline) + "Load sample dataset" button; `GET /api/sample.csv`
- [ ] **Verify:** story test green; button yields ready dataset in <5s with A/B/C numbers on Screen 2 filters; commit

### Phase 4 — Rollups & Screen 3 dashboard (15%, Must)
- [ ] `src/db/rollups.ts` materialization at end of scoring; ratio helpers (rawCpl, qualifiedCpl, hqRate, revenuePerLead, qualityAdjustedRoas) derived from additive sums
- [ ] Screen 3 (follow `dataviz` skill): raw-vs-qualified CPL grouped bar per campaign (the money chart), daily quality-trend line (lp-v4 dip annotated), segment mix, best/worst creatives + landing pages tables, stat tiles (spend, HQ rate, qualified CPL, quality-adjusted ROAS); dimension switcher (campaign/creative/landing page/platform)
- [ ] **Verify:** sample dataset → Campaign A visibly cheapest-raw/worst-qualified; trend dip at day ~18; commit

### Phase 5 — Agentic analyst & Screen 4 (25%, Must — headline feature)
- [ ] `src/lib/anthropic.ts` (singleton, model constants, request builders honoring Global constraints)
- [ ] `schemas.ts` (RecommendationCard), `tools.ts` (7 tools, each a thin wrapper over rollup/lead queries), `system-prompt.ts` (persona: media-buying analyst; cite tool numbers only; end substantive answers via `log_recommended_action` when a change is warranted), `run.ts` (toolRunner + SSE encoder)
- [ ] `app/api/analyst/route.ts` SSE endpoint + conversation persistence (verbatim content blocks incl. thinking; usage logged)
- [ ] Screen 4 chat UI: streaming text, collapsible thinking indicator, tool-call chips, recommendation cards with Approve(simulate)/Dismiss; action log panel; suggested starter questions ("Why did lead quality decline this week?", "Which campaign should get more budget?", "What should I pause today?")
- [ ] `POST /api/analyst/actions/[id]/approve`
- [ ] **Verify:** the three starter questions produce correct, evidence-cited answers on the sample dataset (decline → lp-v4; budget → B/C; pause → A + burst placement); `usage.cache_read_input_tokens > 0` on turn 2; commit

### Phase 6 — Haiku explanations (5%, Should)
- [ ] `POST /api/leads/[id]/explain` (Haiku + `messages.parse`, DB cache) wired into the lead drawer ("Explain this score")
- [ ] **Verify:** explanation matches breakdown numbers verbatim; second click serves cache; commit

### Phase 7 — GCP deployment (5%, Must — first deploy right after Phase 1, harden here)
- [ ] `Dockerfile` (3-stage node:22-slim, `output:'standalone'`, non-root, `CMD ["node","server.js"]`)
- [ ] GCP setup: Artifact Registry repo; Cloud SQL Postgres 16 instance + db + user; secrets (`ANTHROPIC_API_KEY, DATABASE_URL, APP_PASSWORD, AUTH_COOKIE_SECRET`) in Secret Manager
- [ ] Deploy: `gcloud run deploy leadsignal --image ... --add-cloudsql-instances PROJECT:REGION:INSTANCE --set-secrets ... --timeout=900 --memory=2Gi --cpu=1 --concurrency=40 --max-instances=3`; `DATABASE_URL=postgresql://user:pass@localhost/leadsignal?host=/cloudsql/PROJECT:REGION:INSTANCE`
- [ ] Migrations: Cloud Run **Job** running `npx drizzle-kit migrate` (same image), executed by CI before deploy — never on container boot (multi-instance race); interim: `drizzle-kit push` via Cloud SQL Auth Proxy from laptop
- [ ] GitHub Actions: `google-github-actions/auth` (Workload Identity Federation, no key JSON) → build/push → migrate job → deploy
- [ ] Demo day: `--min-instances=1` (kill cold starts; drop to 0 after)
- [ ] **Verify:** full e2e on the deployed URL — password → load sample → dashboard → analyst SSE streams >60s turn without truncation; commit

### Phase 8 — Polish & demo collateral (5%, Should)
- [ ] Empty/loading/error states, toasts; README with demo script (the A/B/C narrative + the three analyst questions); per-conversation cost display from `usageJson` (nice-to-have)
- [ ] **Verify:** run `verify` skill end-to-end; fresh-eyes pass of all four screens; final commit

**Cut line if time-boxed:** Phases 6 and 8 are droppable; Phase 5 is the headline and must ship.

## Verification (end-to-end)

1. **Unit:** `npx vitest run` — scoring rules, segment boundaries, generator determinism, **story assertion test** (generator→scorer→rollups; A qualified ∈ [7.50,9.50] etc.).
2. **Local e2e:** `docker compose up -d` (Postgres) → `npm run dev` → Load sample → confirm Screen 2 segments, Screen 3 A/B/C inversion + day-18 dip → ask analyst the three starter questions → approve a recommendation → row in actions log flips to `approved_simulated`.
3. **Deployed smoke:** same flow on Cloud Run URL; verify SSE streaming stability (multi-minute Opus turn), prompt-cache hits in logged usage, upload of `/api/sample.csv` round-trips.
4. **Cost guardrails:** analyst `maxIterations` cap honored; explanation endpoint hits DB cache on repeat.

## Risks & mitigations (top 8)

1. **Cloud Run ephemeral FS/statelessness** → stream-parse uploads in-request, progress in DB, any instance serves polls.
2. **SSE buffering/timeout** → `no-transform` + `X-Accel-Buffering: no` + 15s heartbeats + `--timeout=900`; test in Phase 7 not demo morning.
3. **Opus 4.8 parameter traps** (temperature/budget_tokens 400; thinking not on by default; `display` default omitted = silent pause) → centralized `lib/anthropic.ts`.
4. **LLM cost blowup** → explain-on-demand only + DB cache; batches for bulk; iteration caps; prompt caching (verify `cache_read_input_tokens>0`).
5. **Demo story fragility** → CI story-assertion test with tolerance bands fails loudly on weight tweaks.
6. **Migrations from CI can't reach Cloud SQL socket** → Cloud Run Job for `drizzle-kit migrate`.
7. **Pool exhaustion** → `pg` Pool max:5 × max-instances 3 under Cloud SQL connection limit.
8. **Numeric drift** → integer cents/scores everywhere from day one.

## Cost estimate (demo month)

Cloud Run (min-instances=1) ≈ $15–30 · Cloud SQL smallest tier + 10GB ≈ $10–30 · Registry/Secrets ≈ $1 · Claude: analyst turn ≈ $0.10–0.40 (Opus 4.8, mostly cache reads) → 200 turns ≈ $30–80; Haiku ≈ $0.002/lead on-demand. **Total ≈ $60–150 active month; <$10 idle** (min-instances 0).
