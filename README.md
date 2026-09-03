# LeadSignal

**Stop optimizing for cheap leads. Start optimizing for valuable ones.**

Media buyers can see what every campaign spends and how many leads it returns —
but the cheapest leads are rarely the most valuable. Duplicate, disposable,
invalid, and zero-intent leads make a campaign look great in the ads manager
while producing nothing downstream. LeadSignal ingests lead + campaign exports,
scores every lead with **transparent, deterministic rules**, rolls quality up
by campaign / creative / landing page, and puts a Claude-powered analyst on top
that recommends where to move budget — grounded in your data, never inventing a
number.

The metric that matters: **qualified CPL = spend ÷ high-quality leads.**

![Campaign quality dashboard](docs/screenshots/dashboard.png)

## The 3-minute demo

1. **Sign in** with the shared password → **Load sample dataset** (30 days,
   5 campaigns, ~6,000 leads, generated + scored live through the real
   pipeline).
2. **Dashboard** — "Broad Awareness" looks like the winner at **$1.17 raw CPL**,
   the cheapest traffic you buy. But its leads are 22% duplicates, 12%
   disposable emails, plus bot-burst submissions: **$9.24 per usable lead**.
   Retargeting at $2.68 raw is actually your cheapest qualified lead ($4.91)
   and carries 10× the revenue. The quality trend also shows Search collapsing
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

## How scoring works (and why the AI can't lie about it)

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

The LLM layer (Claude Opus 4.8 analyst, Haiku 4.5 explanations) reads these
numbers through 7 typed tools and explains them. It structurally cannot invent
a metric — every figure flows from the deterministic layer, and
`tests/story.test.ts` fails CI if the demo numbers ever drift.

## Run it locally

```bash
docker compose up -d                # Postgres 16
cp .env.example .env.local          # set APP_PASSWORD, AUTH_COOKIE_SECRET,
                                    # ANTHROPIC_API_KEY (analyst + explanations)
npm install
DATABASE_URL=postgresql://leadsignal:leadsignal@127.0.0.1:5432/leadsignal \
  npx drizzle-kit migrate
npm run dev                         # http://localhost:3000
```

```bash
npm test        # scoring specs + generator determinism + demo-story guardrail
npm run lint
```

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
degrades gracefully (and lowers the validity score, as it should).
