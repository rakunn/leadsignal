# Deploying LeadSignal to GCP

One-time setup for Cloud Run + Cloud SQL + Secret Manager, then continuous
deploys via GitHub Actions (Workload Identity Federation — no key files).

Replace `PROJECT_ID`, `REGION` (e.g. `europe-west1`), and `GH_REPO`
(e.g. `rafalbagrowski/leadsignal`) throughout.

## 0. Project + APIs

```bash
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com
```

## 1. Artifact Registry

```bash
gcloud artifacts repositories create leadsignal \
  --repository-format=docker --location=REGION
```

## 2. Cloud SQL (Postgres 16, smallest tier)

```bash
gcloud sql instances create leadsignal-pg \
  --database-version=POSTGRES_16 --region=REGION \
  --tier=db-g1-small --storage-size=10GB --storage-type=SSD

gcloud sql databases create leadsignal --instance=leadsignal-pg
gcloud sql users create leadsignal --instance=leadsignal-pg \
  --password="$(openssl rand -hex 16)"   # note the password
```

Connection name: `PROJECT_ID:REGION:leadsignal-pg` (also shown by
`gcloud sql instances describe leadsignal-pg --format='value(connectionName)'`).

## 3. Secrets

```bash
printf 'postgresql://leadsignal:DB_PASSWORD@localhost/leadsignal?host=/cloudsql/PROJECT_ID:REGION:leadsignal-pg' \
  | gcloud secrets create leadsignal-database-url --data-file=-
printf 'sk-ant-…your key…' | gcloud secrets create leadsignal-anthropic-key --data-file=-
printf 'choose-a-demo-password' | gcloud secrets create leadsignal-app-password --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create leadsignal-cookie-secret --data-file=-
```

Visitors must sign in again after this session change is deployed. Sessions last
30 days and are invalidated immediately when either `APP_PASSWORD` or
`AUTH_COOKIE_SECRET` changes. Rotate either secret to revoke all current
sessions.

## 4. Deployer service account + Workload Identity Federation

```bash
gcloud iam service-accounts create leadsignal-deployer

for role in run.admin cloudsql.client artifactregistry.writer \
    secretmanager.secretAccessor iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:leadsignal-deployer@PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/${role}"
done

gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='GH_REPO'"

gcloud iam service-accounts add-iam-policy-binding \
  leadsignal-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/GH_REPO"
```

The **runtime** service account (Cloud Run's default compute SA, or a dedicated
one) needs `roles/cloudsql.client` and `roles/secretmanager.secretAccessor` too.

## 5. First deploy (bootstraps the service + migrate job)

```bash
REGION_TAG=REGION-docker.pkg.dev/PROJECT_ID/leadsignal
gcloud auth configure-docker REGION-docker.pkg.dev

docker build --target runner  -t $REGION_TAG/app:boot .
docker build --target migrate -t $REGION_TAG/migrate:boot .
docker push $REGION_TAG/app:boot && docker push $REGION_TAG/migrate:boot

gcloud run jobs create leadsignal-migrate \
  --image $REGION_TAG/migrate:boot --region REGION \
  --set-cloudsql-instances PROJECT_ID:REGION:leadsignal-pg \
  --set-secrets DATABASE_URL=leadsignal-database-url:latest
gcloud run jobs execute leadsignal-migrate --region REGION --wait

gcloud run deploy leadsignal \
  --image $REGION_TAG/app:boot --region REGION \
  --add-cloudsql-instances PROJECT_ID:REGION:leadsignal-pg \
  --set-secrets DATABASE_URL=leadsignal-database-url:latest,ANTHROPIC_API_KEY=leadsignal-anthropic-key:latest,APP_PASSWORD=leadsignal-app-password:latest,AUTH_COOKIE_SECRET=leadsignal-cookie-secret:latest \
  --cpu 1 --memory 2Gi --concurrency 40 --timeout 900 \
  --min-instances 0 --max-instances 3 --allow-unauthenticated
```

## 6. GitHub Actions variables

Repo → Settings → Secrets and variables → Actions → **Variables**:

| Variable | Value |
|---|---|
| `DEPLOY_ENABLED` | `true` to explicitly enable deployment |
| `GCP_PROJECT_ID` | PROJECT_ID |
| `GCP_REGION` | REGION |
| `GCP_WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github` |
| `GCP_SERVICE_ACCOUNT` | `leadsignal-deployer@PROJECT_ID.iam.gserviceaccount.com` |
| `CLOUD_SQL_INSTANCE` | `PROJECT_ID:REGION:leadsignal-pg` |

Pull requests and non-main pushes run reusable checks independently of GCP.
On `main`, checks must pass before an explicitly enabled deployment can run:
lint, typecheck, unit/isolated DB tests, production and container builds →
build/push images → run migrations → deploy. `DEPLOY_ENABLED` defaults to off;
manual deployment is also restricted to `main`. Fork checks receive no cloud or
provider credentials.

## Demo day

```bash
# kill cold starts before the presentation…
gcloud run services update leadsignal --region REGION --min-instances 1
# …and drop back afterwards
gcloud run services update leadsignal --region REGION --min-instances 0
```

## Smoke test

Open the service URL → password → **Load sample dataset** → dashboard shows
the raw-vs-qualified inversion → ask the analyst
"Why did lead quality decline this week?" and watch the SSE stream hold for a
multi-minute turn (the `--timeout 900` matters here).

## Demo operating assumptions

Verify current provider availability, token prices, cloud tiers and expected
traffic before presenting. The shared password controls access to one workspace;
it does not separate visitors’ datasets. Prefer synthetic uploads. Sampled lead
attributes, including emails, may be sent to the model provider when AI features
are used. Approvals only update simulated records.

The application admits one ingestion per process with 32 MiB files, 34 MiB total
bodies, 25,000 records and 4,096-character cells. Platform limits can be lower;
multiple Cloud Run instances do not share a quota. Provider spend limits, login
throttling and broad public live-demo access need a separate deployment policy.

## Historical rollup migration and isolated tests

Run the normal migration command before starting the updated app:
`npx drizzle-kit migrate`. Migration `0002_backfill-hq-revenue` repairs HQ revenue
on existing rollups using the historical definition (score ≥ 70, not suppressed).
It leaves spend, lead counts, IDs and other measures unchanged. Do not edit or
rerun older migrations manually. For a large database, measure this update on a
copy before release; it updates every rollup.

For database checks, use `TEST_DATABASE_URL` pointing to a disposable Postgres
server whose user can create databases, then run `npm run test:db`. The harness
creates and drops its own randomly named database, migrates it, and seeds only
synthetic fixtures. It never loads `.env.local` or uses `DATABASE_URL` as a
fallback. Optional arguments select integration files, for example
`npm run test:db -- tests/migrations.int.test.ts`.
