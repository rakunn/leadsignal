# LeadSignal

LeadSignal is a demo app for media buyers who want to compare lead quality
across paid campaigns. Import a CSV of leads, score them using contact details,
engagement, and source revenue, then compare cost per lead with cost per
high-quality lead.

The dashboard breaks results down by campaign, ad set, creative, platform, and
landing page. You can open any lead to see its score calculation and flags for
issues such as duplicates, disposable email addresses, and submission bursts.
An optional Claude analyst can query the dataset, explain changes, and suggest
budget or targeting adjustments. Approving a suggestion records it in the app;
it does not change an advertising account.

A built-in sample contains 6,050 synthetic leads across five campaigns. Uploads,
scoring, dashboards, and lead inspection work without an API key. The analyst
and AI score explanations require an Anthropic key.

<details>
<summary>Dashboard screenshot (mobile layout)</summary>

<img src="docs/screenshots/dashboard.png" alt="Campaign dashboard showing quality metrics, campaign comparisons, and trends" width="434" />

</details>

## Run it locally

You'll need Node 22 and Docker. From the repository directory:

```bash
nvm use
npm ci
docker compose up -d
cp .env.example .env.local
```

Set `APP_PASSWORD` and `AUTH_COOKIE_SECRET` in `.env.local`. You can generate a
signing secret with `openssl rand -hex 32`. Leave the database URL as provided
for the local Docker setup. Add `ANTHROPIC_API_KEY` if you want to use the analyst
or AI score explanations.

Apply the database migrations and start the app:

```bash
DATABASE_URL=postgresql://leadsignal:leadsignal@127.0.0.1:5432/leadsignal \
  npx drizzle-kit migrate
npm run dev
```

Open [localhost:3000](http://localhost:3000) and sign in with your `APP_PASSWORD`.

## Try the sample

Select **Load sample dataset** after signing in. It generates and scores 30 days
of synthetic leads through the same pipeline used for CSV uploads.

On the dashboard, Broad Awareness has the lowest raw CPL at $1.18, but its
qualified CPL is $9.43. Retargeting costs $2.69 per lead and $5.03 per
high-quality lead. The quality trend shows a drop in Search lead quality when
`lp-search-v4` launches. These are deliberately constructed examples for
exploring the charts and filters.

In **Leads**, open a row to inspect the score. The detail panel lists each rule
and its points, including any cap applied to a duplicate or unreachable lead.

<img src="docs/screenshots/lead-drawer.png" alt="Lead detail panel with score components and scoring rules" width="384" />

With an Anthropic key configured, open **Analyst** and try asking "Why did lead
quality decline this week?" or "Which campaign should get more budget?" The
analyst's seven typed tools inspect leads and metrics, simulate budget changes,
and record recommendations. Responses are streamed, and proposed actions appear
as cards you can approve or dismiss. Those choices
are saved in the action log. Check the reasoning and estimated impacts before
using a recommendation outside the demo.

## Scoring

The scoring code runs in TypeScript when a dataset is ingested. It combines
three scores:

| Score | Weight | Inputs |
| --- | --- | --- |
| Validity | 40% | Email syntax and disposable domains, phone validity, duplicates, and submission timing |
| Intent | 35% | Email opens (+30), email clicks (+40), and SMS clicks (+30) |
| Value | 25% | Revenue per lead by source, blended from campaign (70%) and landing page (30%), then ranked within the dataset |

Duplicate scores are capped at 15; unreachable leads are capped at 20. A lead
counts as high quality when its composite score is at least 70 and it is not
suppressed. Qualified CPL is spend divided by the number of high-quality leads.
The same threshold is used by the scorer, dashboard, and analyst tools.

Conversion probability is a heuristic based on the three scores, calibrated to
the dataset's observed conversion rate. It is not a trained prediction model.
Leads are assigned to one of five segments: high value, nurture, test, suppress,
or review.

See [the scoring code](src/lib/scoring/) and [shared constants](src/lib/scoring/constants.ts)
for the rules and thresholds. Scores are deterministic; the analyst's written
explanations are generated separately. Existing datasets retain their scoring
version and are not automatically rescored after an update.

## CSV format

Use one row per lead. Download a sample from `/api/sample.csv` in the running app
for the full column set:

```csv
lead_id,created_at,email,phone,campaign,ad_set,creative,platform,landing_page,cost,email_opened,email_clicked,sms_clicked,converted,revenue
```

Only `created_at` and `campaign` are required. Missing contact details lower the
validity score, missing engagement earns no intent points, and blank monetary
values default to zero.

Each row must have the same number of fields as the header. Quote values that
contain commas, line breaks, or quotes. Header names must be unique after
trimming and lowercasing.

For `cost` and `revenue`, use a nonnegative decimal with at most two decimal
places, such as `1234.50`. Currency symbols, thousands separators, and scientific
notation are not accepted. Rows with invalid dates, missing campaigns, or
invalid amounts are skipped and reported. Structural CSV errors reject the
whole file.

| Limit | Maximum |
| --- | --- |
| CSV file | 32 MiB |
| Request body | 34 MiB |
| Data rows | 25,000 |
| Characters per field | 4,096 |

Each server process handles one upload or sample load at a time. A busy process
returns 429 with `Retry-After: 5`; file or body size failures return 413, and
structural CSV errors return 400. Hosting platforms may impose lower limits.
Admission limits are local to each process, so multiple instances need a
separate shared quota.

## Access and data

The app uses one shared password. Everyone with access can see the same leads,
conversations, and actions. Use synthetic data for public demos. When enabled,
analyst tools can send sampled email addresses and other lead attributes to
Anthropic.

Sessions expire after 30 days. Changing `APP_PASSWORD` or `AUTH_COOKIE_SECRET`
revokes existing sessions. Login throttling, provider spend quotas, and limits
across multiple server instances are not included; account for these before
hosting a publicly accessible demo.

Conversation history saves user and assistant text with usage metadata. Tool
and thinking events, along with recommendation cards, are not fully replayed
after reloading. Saved actions remain available in the action log.

## Development

The app uses Next.js 16, TypeScript, Tailwind CSS v4, shadcn/ui, and Recharts.
Postgres stores the datasets, scores, conversations, and actions, with Drizzle
for queries and migrations. The analyst uses the Anthropic TypeScript SDK.
Model settings are in [src/lib/anthropic.ts](src/lib/anthropic.ts).

Run the checks with:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Database tests need a disposable Postgres server whose user can create
databases. With the local Docker instance running:

```bash
TEST_DATABASE_URL=postgresql://leadsignal:leadsignal@127.0.0.1:5432/postgres npm run test:db
```

The test harness creates and removes its own databases and fixtures. It does
not load `.env.local`. Tests cover scoring rules, the sample scenario across
calendar dates, ingestion, dashboard totals, analyst tools, and migrations.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor workflow.

Existing installations should apply all migrations.
`0002_backfill-hq-revenue` repairs historical high-quality revenue totals
without changing the other rollup measures or rescoring stored leads.

## Deployment

The repository includes standalone Docker builds and configuration for Cloud
Run, Cloud SQL, and Secret Manager. GitHub Actions runs lint, type checks, unit
and database tests, a production build, and container smoke checks. Deployment
requires `DEPLOY_ENABLED=true` and the GCP settings described in the
[deployment runbook](docs/DEPLOY.md).

The [verification record](docs/PUBLIC_DEMO_READINESS.md) covers the demo checks,
upload performance measurements, and pre-publication secret scan. Known
dependency advisories are documented in [DEPENDENCIES.md](docs/DEPENDENCIES.md).

## License

[MIT](LICENSE). Copyright (c) 2026 Rafal Bagrowski.
Third-party dependencies retain their own licenses.
