# LeadSignal

**Stop optimizing for cheap leads. Start optimizing for valuable ones.**

Media buyers can see what every campaign spends and how many leads it returns —
but the cheapest leads are rarely the most valuable. Duplicate, disposable,
invalid, and zero-intent leads make a campaign look great in the ads manager
while producing nothing downstream. LeadSignal ingests lead + campaign exports,
scores every lead with **transparent, deterministic rules**, rolls quality up
by campaign / creative / landing page, and puts a Claude-powered analyst on top
that helps you review where to move budget, using typed tools to inspect your data.

The metric that matters: **qualified CPL = spend ÷ high-quality leads.**

![Campaign quality dashboard](docs/screenshots/dashboard.png)

## The 3-minute demo

1. **Sign in** with the shared password → **Load sample dataset** (30 days,
   5 campaigns, 6,050 leads, generated + scored live through the real
   pipeline).
2. **Dashboard** — "Broad Awareness" looks like the winner at **$1.18 raw CPL**,
   the cheapest traffic you buy. But duplicate, disposable, and burst submissions raise it to **$9.43 per usable lead**.
   Retargeting at $2.69 raw is actually your cheapest qualified lead ($5.03)
   and carries about 3.6× Broad Awareness’s recorded revenue. The quality trend also shows Search collapsing
   the day `lp-search-v4` went live.
3. **Leads** — click any lead: the score is a receipt, not a black box. Every
   point is a named rule (`valid phone (+25)`, `duplicate — capped at 15`).
4. **Analyst** — ask the built-ins:
   - *"Why did lead quality decline this week?"* → pins the lp-search-v4 launch
     with before/after numbers.
   - *"Which campaign should get more budget?"* → simulates the shift and logs
     an approval card.
   - *"What should I pause today?"* → names the burst-ridden placements.

   Approving a card only flips a status in the action log — **nothing ever
   touches a live ad account.**

![Lead scoring receipt](docs/screenshots/lead-drawer.png)

## How scoring works

Scoring is pure TypeScript, run at ingest (`src/lib/scoring/`):

| Sub-score | Weight | Signals |
|---|---|---|
| Validity | 40% | email syntax + disposable-domain list, phone validity (libphonenumber), duplicate detection (gmail-canonicalized email / E.164 phone, earliest wins), submission-burst windows (≥5 leads / landing page / 120s) |
| Intent | 35% | email opens (+30), clicks (+40), SMS clicks (+30) |
| Value | 25% | expected revenue per lead of the source (70% campaign / 30% landing page blend), ranked into dataset tiers |

Composite = weighted sum with hard caps (duplicates ≤15, unreachable ≤20);
conversion probability is a hand-set logistic over the sub-scores with its
intercept calibrated to the dataset's observed conversion rate; segments:
high value / nurture / test / suppress / review. **HQ lead = composite ≥ 70
and not suppressed** — one constant (`src/lib/scoring/constants.ts`) shared by
the scorer, rollups, charts, and the analyst's tools.

Lead scores and reported tool metrics are computed deterministically. The
analyst uses seven typed tools to inspect those metrics and generates
explanations and recommendations; its prose and estimated impacts still
require review. Story tests protect the sample’s business narrative, and
date-shift tests keep the same seeded scenario stable across calendar dates.
The configured models live in `src/lib/anthropic.ts`; verify provider access
and current pricing before a live presentation.

## Run it locally

Use Node 22 (`nvm use`) and Docker. Auth requires both `APP_PASSWORD` and
`AUTH_COOKIE_SECRET`; the provider key is optional for ingestion, scoring, and
browsing. The analyst and explanations need the configured provider key.

```bash
docker compose up -d                # Postgres 16
cp .env.example .env.local          # set APP_PASSWORD, AUTH_COOKIE_SECRET,
                                    # ANTHROPIC_API_KEY (analyst + explanations)
npm ci
DATABASE_URL=postgresql://leadsignal:leadsignal@127.0.0.1:5432/leadsignal \
  npx drizzle-kit migrate
npm run dev                         # http://localhost:3000
```

```bash
npm test
npm run lint
npm run typecheck
npm run build
# Explicit disposable Postgres server with CREATE DATABASE permission:
TEST_DATABASE_URL=postgresql://leadsignal:leadsignal@127.0.0.1:5432/postgres npm run test:db
```

The DB test command creates and removes its own databases and synthetic fixtures;
it never loads `.env.local`. Existing installations should run all migrations:
`0002_backfill-hq-revenue` restores historical HQ revenue without changing other
rollup measures. Stored scoring versions remain attributable; old datasets are
not automatically rescored. See [contributor checks](CONTRIBUTING.md).

## Demo data and access

This is a **shared workspace** behind one password: everyone with access can
view the same uploaded leads, conversations, and actions. Use synthetic data
for public demonstrations. Analyst tools can send sampled email addresses and
other lead attributes to the configured model provider. Approvals update only
simulated action records and never change live advertising accounts.

Conversation history stores user and assistant text with usage metadata. Live
tool/thinking events and recommendation cards are not replayed as a complete
provider transcript after reloading; action records remain in the action log.

Sessions expire after 30 days on the server. Rotating either auth secret revokes
existing sessions; the new cookie format requires existing visitors to sign in
once again. Keep live demo access controlled: login throttling, provider spend
quotas, and cross-instance ingestion limits are separate deployment work.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · Recharts ·
Postgres + Drizzle · Anthropic TypeScript SDK (tool runner, structured
outputs, prompt caching, SSE streaming) · Cloud Run + Cloud SQL + Secret
Manager, GitHub Actions with Workload Identity Federation
([deploy runbook](docs/DEPLOY.md)) · full plan in
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## CSV contract

One row per lead — download the exact shape from `/api/sample.csv` in the app:

```
lead_id, created_at, email, phone, campaign, ad_set, creative, platform,
landing_page, cost, email_opened, email_clicked, sms_clicked, converted, revenue
```

Only `created_at` and `campaign` are strictly required; everything else
degrades gracefully (and lowers the validity score, as it should). Every row
must still have the same number of fields as the header: quote values that
contain commas, line breaks, or quotes, and do not repeat a header name after
trimming and lowercasing.

`cost` and `revenue` are optional. When present, use a nonnegative plain decimal
with no currency symbol, separators, exponent, or more than two decimal places
(for example, `1234.50`). Invalid amounts skip that row and are reported with
the other row-level validation errors.

Uploads accept CSV files up to 32 MiB, with a 34 MiB request-body limit,
25,000 data records, and fields up to 4,096 characters. The demo processes one
upload or sample dataset at a time per server process; a busy response can be
retried after a few seconds.

Request limits apply inside the application; hosting platforms may impose lower
limits. A process-local ingestion permit is not a distributed quota. File/body
size failures return 413, CSV contract failures return 400, and a busy process
returns 429 with `Retry-After: 5`. Invalid date/campaign or monetary rows are
skipped with a bounded error summary; structural CSV errors reject the file.

## Repository checks and release

Pull requests run lint, types, unit tests, isolated Postgres tests, a production
build, and container smoke checks without cloud credentials. Deployment is off
unless `DEPLOY_ENABLED=true` and the required GCP variables are configured;
see [the deployment runbook](docs/DEPLOY.md). Remaining dependency advisories
and their scope are recorded in [DEPENDENCIES.md](docs/DEPENDENCIES.md).

Before changing repository visibility, choose a license and run a history-aware
secret check. No reuse license has been selected yet.
