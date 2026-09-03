# Public Demo Readiness Implementation Plan

**Execution status (2026-09-03):** All 20 implementation commits are complete on
`rafal/public-demo-readiness`. The procedure below is retained as the approved
plan; see the [execution record](../../PUBLIC_DEMO_READINESS.md) for checks
actually performed, measured results, and publication decisions still required.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the repository review through 20 focused commits, each with its own validation and a clear connection to a finding.

**Architecture:** Retain the existing shared-password Next.js demo and deterministic scoring pipeline. Repair the bounded algorithms, input contracts, session lifecycle, data migration, UI state, and delivery checks in place; introduce only small helpers where a boundary needs an explicit contract.

**Tech Stack:** Next.js App Router/standalone output, TypeScript, React, Postgres 16, Drizzle, Vitest, Anthropic SDK, Docker, GitHub Actions. Node 22 is the verification target.

**Spec:** [Public demo readiness remediation specification](../specs/2026-09-03-public-demo-readiness.md). Read it with this plan; its review requirements are reproduced below by ID, so execution does not depend on temporary review files.

## Global Constraints

- One concern per implementation commit; include its required tests and directly related documentation in that commit.
- Preserve existing uncommitted changes; never reset, overwrite, or include unrelated changes accidentally.
- Use Conventional Commit subjects and the `rafal/` branch prefix when creating a branch.
- Read relevant installed guides in `node_modules/next/dist/docs/` before editing Next-dependent code; re-read affected guides after changing Next versions.
- Preserve the shared-workspace and simulated-approval product model.
- Do not rewrite applied migrations or rescore existing user datasets silently.
- Use isolated synthetic databases for verification; never obtain fixtures by reading a live dataset.
- Do not spend provider credits or deploy remotely as part of automated checks.
- Prefer focused behavioral regressions; use manual checks for tiny UI/configuration edits and avoid brittle timing assertions in the normal test suite.

---

## Commit sequence and coverage

| Commit | Subject | Requirement | Depends on |
|---|---|---|---|
| 01 | `fix(dev): restrict Postgres to localhost` | R03 | — |
| 02 | `fix(auth): enforce session expiry and revocation` | R02 | — |
| 03 | `fix(auth): validate post-login destinations` | R12 | — |
| 04 | `fix(auth): recover login after network failures` | R11 | 03, same component |
| 05 | `fix(scoring): bound email validation work` | R01c | — |
| 06 | `fix(scoring): mark burst windows without repeated traversal` | R01a | — |
| 07 | `fix(scoring): use logarithmic source-value lookup` | R01b | — |
| 08 | `fix(ingest): bound upload size and concurrent processing` | R01d | 05–07 |
| 09 | `fix(ingest): reject malformed CSV structure` | R04 | 08, same parser |
| 10 | `fix(ingest): validate monetary values before insertion` | R05 | 09 |
| 11 | `fix(scoring): preserve aliases from duplicate leads` | R06 | 05–06, same files |
| 12 | `fix(db): backfill high-quality revenue for existing rollups` | R08 | — |
| 13 | `fix(dashboard): preserve totals across incomplete dimensions` | R07 | 12 test harness |
| 14 | `fix(analyst): refresh the action log after resolution` | R09 | — |
| 15 | `fix(leads): enforce pagination boundaries` | R10 | — |
| 16 | `fix(demo): keep sample metrics stable across dates` | R14 | 05–07, 11 |
| 17 | `chore(deps): update dependencies with reviewed advisories` | D01 | Functional fixes tested first |
| 18 | `ci: validate pull requests independently of deployment` | R15 | 12, 16–17 |
| 19 | `docs: align demo claims and setup with implemented behavior` | R13, P01 | 02, 08–10, 16–18 |
| 20 | `chore(repo): remove unused scaffold and editor metadata` | P01 | 19 |

Execute sequentially by default. Several commits touch the same files; parallel execution would need separate checkouts and deliberate integration. Keep the three performance fixes separate even though the original review grouped them under one topic. Commit numbers are stable identifiers, not instructions to squash independent fixes together.

## Preparation and per-commit gate

- [ ] Record `git status --short` and `git diff --stat`. The reviewed analyst/package changes were committed separately as `4910d35` during plan preparation; use that baseline or its current descendant. Do not count it as a remediation commit or re-commit its changes in commit 14 or 17. Preserve any newer user edits.
- [ ] Create or reuse an appropriate branch, preserving the working tree. Use a new isolated checkout only when it preserves the agreed starting content.
- [ ] Check Node 22, `npm ci` in a suitable checkout, `npm test`, `npm run lint`, `npx tsc --noEmit --incremental false`, and `npm run build`. Record baseline failures separately. Builds need access to configured Google fonts.
- [ ] For each behavioral fix, add the stated regression, demonstrate the current failure when applicable, implement the specified change, then run the focused check and existing affected tests. Behavior-preserving performance refactors use equivalence tests plus a bounded before/after benchmark rather than a contrived failing assertion.
- [ ] Review `git diff --check` and the staged diff. Stage explicit paths or hunks, never the entire working tree. Use the exact subject from the sequence table after the task's checks pass.
- [ ] Record the resulting commit hash and verification in an execution note or task response. Do not claim that an unrun browser, database, or provider check passed.

No implementation, dependency update, migration, Git commit, or deployment is part of preparing this plan.

## File responsibilities

Existing owners remain `src/lib/auth.ts` for authentication; `src/lib/scoring/` for deterministic rules; `src/lib/ingest/` for parsing/persistence; `src/lib/queries.ts` for database reads; and the current route/components for presentation. New helpers have these limited purposes:

| New path | Responsibility |
|---|---|
| `src/lib/auth-redirect.ts` | Pure same-origin destination validation; safe for browser import |
| `src/lib/ingest/request.ts` | Bounded request-body reader and typed size errors |
| `src/lib/ingest/admission.ts` | One in-process ingestion permit with guaranteed release |
| `src/lib/ingest/money.ts` | Strict decimal-to-integer-cent parsing |
| `src/lib/pagination.ts` | Pure page-range normalization |
| `scripts/test-db.mjs` | Create/migrate/drop an isolated test database and invoke Vitest |
| `tests/helpers/database.ts` | Dataset/conversation fixture ownership and cleanup |
| `tests/scoring.bench.ts` | Optional bounded performance comparison, outside normal test discovery |
| `docs/DEPENDENCIES.md` | Dated disposition of dependency advisories that remain |
| `.github/workflows/ci.yml` | Credential-free pull-request and reusable checks |

## Commit 01 — Local database network boundary

**Files:** modify `docker-compose.yml`, `.env.example`, and the local connection examples in `README.md`. **Interface:** document the explicit local target `127.0.0.1:5432` to avoid IPv6 localhost ambiguity; the database name and named volume remain unchanged.

- [ ] Change the single port mapping:

```yaml
ports:
  - "127.0.0.1:5432:5432"
```

- [ ] Run `docker compose config --format json`; verify the published address is `127.0.0.1`. If runtime verification is needed, use a temporary Compose project/unused host port and inspect its binding. Do not restart or delete the developer's existing volume.
- [ ] Update the checked-in local connection examples to use `127.0.0.1`; leave the developer's ignored `.env.local` untouched.
- [ ] Commit `fix(dev): restrict Postgres to localhost`. No implementation-mirroring test is needed for this configuration line.

## Commit 02 — Expiring and revocable sessions

**Files:** modify `src/lib/auth.ts`, `src/app/api/auth/login/route.ts`, `docs/DEPLOY.md`; create `tests/auth.test.ts`. `src/proxy.ts` continues calling the validator.

**Interfaces:** replace `expectedAuthCookie()` with `createAuthCookie(nowMs = Date.now()): string`; retain `isAuthCookieValid(value: string | undefined, nowMs = Date.now()): boolean`; export `AUTH_TTL_SECONDS = 2_592_000`. `isPasswordValid` remains unchanged.

- [ ] Add tests using dummy environment secrets and restore them after every test. Representative assertions:

```ts
const now = Date.parse("2026-09-03T00:00:00Z");
const token = createAuthCookie(now);
expect(isAuthCookieValid(token, now)).toBe(true);
expect(isAuthCookieValid(token, now + AUTH_TTL_SECONDS * 1000)).toBe(false);
vi.stubEnv("APP_PASSWORD", "rotated-test-password");
expect(isAuthCookieValid(token, now)).toBe(false);
```

- [ ] Sign a base64url JSON payload `{ v: 2, iat, exp, nonce }` with HMAC-SHA256. Use integer epoch seconds and a cryptographic random nonce. Bind the signature to the current password and signing secret through a server-only HMAC-derived key; neither secret belongs in the token. Check length (maximum 1,024 characters), token shape, signature, version, integer timestamps, `exp - iat === AUTH_TTL_SECONDS`, future issue time, and expiry. Use constant-time signature comparison after checking length. Reject the old static cookie and malformed input without accepting partial data.
- [ ] Have login issue the new token with the same HttpOnly/SameSite/production-Secure attributes and shared TTL constant. Document the one-time sign-in requirement and password/signing-key rotation behavior.
- [ ] Test tampering, truncation, unsupported version, overlong token, missing cookie, expiry boundary, password rotation, signing-secret rotation, and two distinct valid issued cookies. Run `npx vitest run tests/auth.test.ts`, lint, typecheck, and build; smoke-test a successful login and protected API.
- [ ] Commit `fix(auth): enforce session expiry and revocation`.

## Commit 03 — Safe post-login navigation

**Files:** create `src/lib/auth-redirect.ts`, `tests/auth-redirect.test.ts`; modify `src/app/(auth)/login/page.tsx`.

**Interface:** `safeLoginDestination(value: string | null, origin: string): string`; fallback `/datasets`. Allow a single-slash relative path only; parse against `origin`, verify the resulting origin, and return pathname/search/hash. Reject raw control characters, backslashes, protocol-relative URLs, credentials, and the login path to prevent loops. The validator imports no Node authentication code.

- [ ] Add these cases before wiring the form:

```ts
expect(safeLoginDestination("/datasets?view=all", "https://demo.example"))
  .toBe("/datasets?view=all");
for (const value of ["https://elsewhere.example", "//elsewhere.example", "javascript:alert(1)", "/\\elsewhere.example", "/login"]) {
  expect(safeLoginDestination(value, "https://demo.example")).toBe("/datasets");
}
```

- [ ] Use `safeLoginDestination(searchParams.get("next"), window.location.origin)` in the successful-login handler. Preserve query strings on valid local destinations.
- [ ] Run `npx vitest run tests/auth-redirect.test.ts`; browser-check normal deep-link login and an external `next` value. Verify the browser stays on the demo origin.
- [ ] Commit `fix(auth): validate post-login destinations`.

## Commit 04 — Login transport failures

**Files:** modify `src/app/(auth)/login/page.tsx`. **Interface:** no API change.

- [ ] Put the request and navigation in `try/catch/finally`; keep wrong-password messaging distinct from network/server failures. The essential state handling is:

```ts
} catch {
  setError("Couldn't reach the server. Check your connection and try again.");
} finally {
  setPending(false);
}
```

- [ ] Browser-check an aborted/offline login request: an error appears, the button becomes usable, and retry succeeds. Also check 401 and successful deep-link login. Do not introduce a browser-testing framework solely for this small change.
- [ ] Run lint/typecheck; commit `fix(auth): recover login after network failures`.

## Commit 05 — Bounded email validation

**Files:** modify `src/lib/scoring/normalize.ts`, `src/lib/scoring/constants.ts`, `tests/scoring.test.ts`; create `tests/normalize.test.ts`.

**Interface:** existing `isEmailSyntaxValid`, `canonicalEmail`, and `canonicalPhone` stay intact; export `MAX_EMAIL_LENGTH = 254` from `normalize.ts`.

- [ ] Test overlong otherwise-valid emails, malformed dotted domains, whitespace, absent/extra `@`, existing valid samples, Gmail canonicalization, and null. Example:

```ts
expect(isEmailSyntaxValid(`${"a".repeat(245)}@example.com`)).toBe(false);
expect(isEmailSyntaxValid(`a@${".".repeat(8000)}@`)).toBe(false);
expect(canonicalEmail("Anna.B+promo@gmail.com")).toBe("annab@gmail.com");
```

- [ ] Trim and reject overlong input before validation. Replace overlapping regex groups with bounded checks: one `@`, nonempty local/domain, no whitespace, final dot with at least two trailing characters. Preserve the existing accepted short-email behavior rather than adding an unrelated full RFC validator.
- [ ] Set `SCORING_VERSION` to `2026-09-v2` because overlong emails now receive different validity scores. Existing datasets retain their stored version/scores.
- [ ] Run normalization/scoring/story tests and a bounded worker benchmark of increasing malformed lengths; terminate the benchmark on timeout. Commit `fix(scoring): bound email validation work`.

## Commit 06 — Linear burst marking after sorting

**Files:** modify `src/lib/scoring/score.ts`, `tests/scoring.test.ts`; create `tests/scoring.bench.ts`. **Interface:** `scoreLeads(RawLead[]): LeadScore[]` and all score semantics stay unchanged.

- [ ] Extend the existing `lead()` and `burstLeads()` fixtures with overlapping windows, gaps, timestamp ties, exactly 120 seconds, 120 seconds plus 1 ms, and separate landing pages. Compare flagged indices against a small brute-force window oracle over deterministic fixtures.
- [ ] Keep sorting and sliding `lo`; track the highest marked index per landing-page group. Inside a qualifying window:

```ts
for (let k = Math.max(lo, markedThrough + 1); k <= hi; k++) {
  flagged.add(sorted[k]);
}
markedThrough = hi;
```

Initialize `markedThrough = -1` per group. Update it only for qualifying windows; gaps remain unflagged. Each index is marked at most once.
- [ ] Run scoring/story tests. Add a bounded optional benchmark at 4k/8k/16k/25k equal-timestamp rows and verify the previous quadratic growth is gone. Keep benchmarks outside `tests/**/*.test.ts`; no machine-specific millisecond assertion in CI.
- [ ] Commit `fix(scoring): mark burst windows without repeated traversal`.

## Commit 07 — Logarithmic percentile lookup

**Files:** modify `src/lib/scoring/value.ts`, `tests/scoring.test.ts`, `tests/scoring.bench.ts`. **Interface:** preserve `ValueNorms.percentileOf(sourceValue: number): number`, including values between the observed distinct values.

- [ ] Add cases for an empty/single-value norm (50), tied source values, lowest/highest values, an in-between query, and a query above maximum. Use existing `lead()` fixtures to create revenues 100/200/300 and confirm ranks 0/50/100.
- [ ] Replace `findIndex` with lower-bound binary search, keeping the current ceiling-rank semantics:

```ts
let lo = 0;
let hi = distinct.length;
while (lo < hi) {
  const mid = lo + Math.floor((hi - lo) / 2);
  if (distinct[mid] < sourceValue) lo = mid + 1;
  else hi = mid;
}
const idx = Math.min(lo, distinct.length - 1);
return Math.round((idx / (distinct.length - 1)) * 100);
```

Retain the existing `distinct.length <= 1` early return.
- [ ] Run scoring/story tests and a bounded benchmark with distinct campaigns/revenues at 4k/8k/16k/25k rows. Commit `fix(scoring): use logarithmic source-value lookup`.

## Commit 08 — Bounded upload admission and parsing

**Files:** create `src/lib/ingest/request.ts`, `src/lib/ingest/admission.ts`, `tests/ingest-limits.test.ts`; modify `src/lib/ingest/columns.ts`, `src/lib/ingest/parse.ts`, both dataset POST routes, `src/components/upload-card.tsx`, `src/components/sample-card.tsx`, and the CSV-limit paragraph in `README.md`.

**Interfaces:** retain 32 MiB `MAX_UPLOAD_BYTES`; add `MAX_REQUEST_BYTES = 34 * 1024 * 1024`, `MAX_UPLOAD_ROWS = 25_000`, `MAX_FIELD_CHARS = 4_096`. `readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array>` throws `UploadLimitError`. `tryAcquireIngest(): (() => void) | null` returns an idempotent release callback or null. Use one process-global permit shared by upload and sample routes.

- [ ] Test that a body exceeding the limit without Content-Length stops reading and fails, Content-Length cannot weaken the measured-byte limit, a second permit is refused, release is idempotent, and failures release the permit. Representative permit test:

```ts
const release = tryAcquireIngest();
expect(release).not.toBeNull();
expect(tryAcquireIngest()).toBeNull();
release!();
const nextRelease = tryAcquireIngest();
expect(nextRelease).not.toBeNull();
nextRelease!();
```

- [ ] Read/count chunks before `formData()` using the bounded helper; cancel the reader on overflow. Parse the bounded bytes with the original multipart Content-Type and then verify `file.size`. Acquire admission before reading; return 429 with `Retry-After: 5` when busy, 413 for size overflow, and release in `finally` after ingestion or failure. Do not hold an unbounded waiting queue.
- [ ] Use Papa's step callback to collect at most the allowed number of records and abort at the next record; check cell lengths during parsing before insertion. Validate the 25,001st record even when earlier rows would be skipped. Report record/cell-limit violations as `CsvContractError` (400) and body/file-byte violations as 413. Do not create a dataset row for a globally rejected file. Add an early browser file-size message and show server errors, including busy responses, in upload/sample controls.
- [ ] Run unit tests and HTTP smoke tests for accepted/rejected uploads and simultaneous sample/upload requests. Measure maximum accepted parsing/scoring in a 1-CPU/2-GiB environment with a bounded timeout. Reduce the documented row limit if responsiveness or memory is unacceptable; do not claim this permit provides cross-instance quotas or complete CPU isolation.
- [ ] Commit `fix(ingest): bound upload size and concurrent processing`.

## Commit 09 — CSV structural validation

**Files:** modify `src/lib/ingest/parse.ts`; create `tests/ingest-parse.test.ts`; update CSV error guidance in `README.md`. **Interface:** preserve `ParsedCsv` and `CsvContractError`.

- [ ] Add explicit regressions:

```ts
expect(() => parseCsvLeads("created_at,campaign,cost,revenue\n2026-06-01,X,1,234.50,500"))
  .toThrow(CsvContractError);
expect(() => parseCsvLeads('created_at,campaign\n2026-06-01,"unfinished'))
  .toThrow(CsvContractError);
```

Also test too few columns, duplicate headers after trimming/lowercasing, BOM/CRLF, valid quoted commas/newlines, and unchanged required-header/date/campaign behavior.
- [ ] Inspect Papa error codes in the installed parser. Reject malformed quoting, field-count mismatches, and normalized duplicate headers before accepting the file. Detect duplicate raw headers before Papa renames them, using the parsed header record with `header: false, preview: 1`; compare normalized strings. A structurally invalid later record invalidates the entire upload, even if earlier records were usable. Keep blank optional cells valid.
- [ ] Run `npx vitest run tests/ingest-parse.test.ts tests/ingest-limits.test.ts`; verify errors show row/record context without echoing full records. Commit `fix(ingest): reject malformed CSV structure`.

## Commit 10 — Monetary values

**Files:** create `src/lib/ingest/money.ts`, `tests/money.test.ts`; modify `src/lib/ingest/parse.ts`, `tests/ingest-parse.test.ts`, and CSV format guidance in `README.md`.

**Interface:** `parseMoneyCents(value: string | undefined): number` returns exact integer cents or throws a field-neutral validation error. Missing/blank is zero. Accepted grammar after trim is `^\d+(?:\.\d{1,2})?$`; reject values longer than 32 characters before parsing. Convert decimal digits to cents exactly and check against 2,147,483,647.

- [ ] Test:

```ts
expect(parseMoneyCents("21474836.47")).toBe(2147483647);
expect(parseMoneyCents("0.29")).toBe(29);
expect(parseMoneyCents(undefined)).toBe(0);
for (const value of ["21474836.48", "12oops", "$1,234.50", "1e3", "-1", "1.001"]) {
  expect(() => parseMoneyCents(value)).toThrow();
}
```

- [ ] At row mapping, catch amount errors, increment `skipped` once for that row, and add at most five bounded messages naming the record and field. Do not convert bad amounts to zero. Keep all-bad uploads on the existing no-usable-rows 400 path.
- [ ] Run money/parser/limit tests and ingest a mixed good/bad file into an isolated database. Verify accepted cents, skipped count, and no PostgreSQL overflow. Commit `fix(ingest): validate monetary values before insertion`.

## Commit 11 — Duplicate aliases

**Files:** modify `src/lib/scoring/score.ts`, `src/lib/scoring/constants.ts`, `tests/scoring.test.ts`. **Interface:** preserve `duplicateOfIndex` as an index in the caller's original array.

- [ ] Extend existing fixtures with the chain:

```ts
const rows = [
  lead({ email: "a@example.com", phone: "+14155550001" }),
  lead({ email: "a@example.com", phone: "+14155550002" }),
  lead({ email: "b@example.com", phone: "+14155550002" }),
];
const scores = scoreLeads(rows);
expect(scores.map(s => s.isDuplicate)).toEqual([false, true, true]);
expect(scores[2].duplicateOfIndex).toBe(0);
expect(scores[2].compositeScore).toBeLessThanOrEqual(15);
```

- [ ] Keep the chronological pass. When either map hits, choose the earliest representative by chronological rank (not raw array index or unconditional email preference). Set the row's duplicate result, then register any previously unseen email/phone against that representative. Preserve existing first-seen mappings; do not retroactively merge old unique rows.
- [ ] Test the mirrored phone/email chain, reverse input order, ties, invalid identifiers, and a row matching two different prior representatives. Advance `SCORING_VERSION` to `2026-09-v3`; existing datasets are not silently rescored.
- [ ] Run scoring/story/generator tests and check that HQ totals reflect only the intended correction. Commit `fix(scoring): preserve aliases from duplicate leads`.

## Commit 12 — Additive revenue backfill and isolated DB verification

**Files:** create `drizzle/0002_backfill-hq-revenue.sql`, `tests/migrations.int.test.ts`, `tests/helpers/database.ts`, `scripts/test-db.mjs`; modify `drizzle/meta/_journal.json`, `package.json`, `tests/analyst-tools.int.test.ts`, and migration instructions in `docs/DEPLOY.md`. Do not edit `0000` or `0001`.

**Interfaces:** `npm run test:db -- [test-file...]` accepts only optional Vitest test-file arguments. It requires `TEST_DATABASE_URL`, creates a random database named `leadsignal_test_<random>`, migrates it, supplies its URL as `DATABASE_URL` to a child Vitest process with `RUN_DB_TESTS=1`, and drops only that owned database in `finally`. Without arguments, discover and run all `tests/*.int.test.ts` with file parallelism disabled; never load `.env.local` or default to the developer database. Execute children with argument arrays and no shell. Check creation succeeded before registering ownership/cleanup. Integration suites skip unless `RUN_DB_TESTS=1`; keep database writes and module initialization behind the isolated-URL check.

- [ ] Add migration regression fixtures for HQ, suppressed, low-score, absent dimension, multiple datasets, zero-HQ days, and UTC day boundaries. Expected example: a rollup with 10,000 cents of HQ revenue and existing `hq_revenue_cents=0` becomes 10,000; spend, counts, IDs and other revenue stay unchanged. Run the new SQL twice and assert the second application is a no-op in values.
- [ ] Use a correlated aggregate over existing leads so every existing rollup is updated, including zero-HQ groups. Core SQL:

```sql
UPDATE rollups AS r
SET hq_revenue_cents = COALESCE((
  SELECT SUM(l.revenue_cents)
  FROM leads AS l
  WHERE l.dataset_id = r.dataset_id
    AND (l.created_at AT TIME ZONE 'UTC')::date = r.day
    AND l.composite_score >= 70
    AND l.segment <> 'suppress'
    AND CASE r.dimension
      WHEN 'campaign' THEN l.campaign
      WHEN 'ad_set' THEN l.ad_set
      WHEN 'creative' THEN l.creative
      WHEN 'platform' THEN l.platform
      WHEN 'landing_page' THEN l.landing_page
    END = r.dimension_value
), 0);
```

Use the installed Drizzle custom-migration workflow to register the next journal entry; preserve its generated ordering/timestamp. Explain why this historical SQL freezes the current HQ definition instead of importing TypeScript. For a large deployment, assess update duration on a copy before release.
- [ ] In `tests/helpers/database.ts`, define `createDatasetFixture(rows: LeadInsertRow[]): Promise<{ datasetId: string; cleanup(): Promise<void> }>` using the isolated `DATABASE_URL`, `runIngest`, and cascading dataset deletion. Add `createConversationFixture(datasetId: string): Promise<string>`. Guard helpers against URLs whose database name lacks `leadsignal_test_` before any write.
- [ ] Migrate the existing analyst integration test onto those owned fixtures in this commit: seed its own canonical sample, create a real conversation, and clean up after the suite. Keep its existing six tool assertions. This makes the new no-argument `test:db` command pass immediately; task 18 adds actual seventh-tool execution.
- [ ] Test fresh migration chain in the harness and the 0000→0001→populated fixture→0002 upgrade in a second owned database using raw `pg`. Compare non-target columns before/after. Run `npm run test:db -- tests/migrations.int.test.ts` against temporary Postgres credentials.
- [ ] Commit `fix(db): backfill high-quality revenue for existing rollups`.

## Commit 13 — Dimension-independent dashboard totals

**Files:** modify `src/app/(app)/datasets/[id]/dashboard/page.tsx`; create `tests/dashboard-totals.int.test.ts`. Use existing `rollupTotalsByValue`, `sumTotals`, and task 12's fixture helpers; do not change historical rollup representation.

- [ ] Create a dataset with two rows totaling 3,000 cents and no creative, then one with only partial creative coverage. Assert campaign totals retain all rows while creative totals contain only known values. Add a server-rendered page check against mocked presentation components or the local production server to assert global Spend/lead count and visible dimension controls on both selected dimensions.
- [ ] Fetch campaign totals alongside selected-dimension data (reuse `byValue` if `dim === "campaign"`), and compute once:

```ts
const datasetTotals = sumTotals(campaignTotals);
const overall = deriveMetrics(datasetTotals);
const missingDimensionRows = datasetTotals.leadCount - sumTotals(byValue).leadCount;
```

- [ ] Render title, dimension control, and dataset-wide KPI cards before the chart empty state. For an absent optional dimension show “No creative values in this dataset” or its matching dimension label; for partial coverage disclose the missing row count. Reserve processing messaging for actual dataset status. Charts/rankings continue showing selected known values.
- [ ] Run the focused DB test and browser-switch through all five dimensions on sparse/full data. Verify totals stay constant, controls remain, and actual processing/error states remain truthful.
- [ ] Commit `fix(dashboard): preserve totals across incomplete dimensions`.

## Commit 14 — Recommendation and action-log consistency

**Files:** modify `src/components/analyst-chat.tsx`. **Interface:** use existing `RecommendationCardView.onResolved(status: string)`.

- [ ] Wire the existing router refresh callback:

```tsx
<RecommendationCardView
  key={j}
  action={part.action}
  onResolved={() => router.refresh()}
/>
```

- [ ] Seed a proposed action/conversation in the isolated test database and render its card without contacting a provider. Approve after a completed turn: both card and action log must update immediately. Repeat with dismissal and check the route refresh preserves current chat text/stream ordering.
- [ ] Run existing analyst-parts tests, lint, and typecheck. Stage only the new callback hunk if earlier analyst changes are still uncommitted.
- [ ] Commit `fix(analyst): refresh the action log after resolution`.

## Commit 15 — Pagination boundaries

**Files:** create `src/lib/pagination.ts`, `tests/pagination.test.ts`; modify `src/app/(app)/datasets/[id]/leads/page.tsx`.

**Interface:** `normalizePage(value: string | string[] | undefined, totalPages: number): number`. Accept positive integer strings only, cap before computing SQL offset, and use page 1 when total pages is zero or input is malformed.

- [ ] Cover ordinary, zero, negative, fractional, prefix-numeric, enormous, repeated-query, and above-last-page values:

```ts
expect(normalizePage("999", 3)).toBe(3);
expect(normalizePage("2oops", 3)).toBe(1);
expect(normalizePage(undefined, 0)).toBe(1);
expect(normalizePage("2", 3)).toBe(2);
```

- [ ] Fetch count before the paginated rows, calculate the normalized page, then issue the bounded offset query. Fetch independent campaign choices concurrently where possible. Render actual disabled Buttons at the first/last boundaries; render Link children only for navigable pages. Preserve valid filter/sort parameters.
- [ ] Run the focused tests. Browser-check mouse and keyboard boundaries with 51 leads, query `page=999`, filter changes reducing page count, and empty results. Commit `fix(leads): enforce pagination boundaries`.

## Commit 16 — A stable sample scenario

**Files:** modify `src/lib/sample-data/generate.ts`, `tests/generator.test.ts`, `tests/story.test.ts`; update sample metrics in `README.md` only if the canonical result requires it. Both `/api/sample.csv` and `/api/datasets/sample` continue using the public generator.

**Interface:** preserve `generateSampleLeads(seed: number, anchor: Date): LeadInsertRow[]` and `defaultAnchor()`. Add internal `generateCanonicalScenario(seed: number)` using the fixed 2026-06-30 UTC anchor; public generation shifts each row by requested-anchor minus canonical-anchor.

- [ ] Add a regression that separates business attributes from date presentation:

```ts
const a = generateSampleLeads(SAMPLE_SEED, new Date("2026-09-01T00:00:00Z"));
const b = generateSampleLeads(SAMPLE_SEED, new Date("2026-09-06T00:00:00Z"));
expect(b.map(({ createdAt, ...business }) => business))
  .toEqual(a.map(({ createdAt, ...business }) => business));
expect(b[0].createdAt.getTime() - a[0].createdAt.getTime()).toBe(5 * 86_400_000);
```

- [ ] Build weekday volume decisions from the canonical scenario, not today's weekday. Shift timestamps only after generating all identities, costs, engagement, revenue and burst placements. Do not introduce a mutable global cached row array.
- [ ] Run story assertions for all seven weekday anchors, plus month/year and leap-day transitions. Verify relative landing-page launch/quality decline, duplicate/burst counts, window bounds, and different-seed variability. Compare uploaded sample CSV and sample-button metrics.
- [ ] Commit `fix(demo): keep sample metrics stable across dates`.

## Commit 17 — Dependency remediation

**Files:** modify `package.json`, `package-lock.json`; create `docs/DEPENDENCIES.md`. Review `next.config.ts` or affected API call sites only when a selected update requires it.

- [ ] Capture fresh `npm audit --json` and `npm audit --omit=dev --json`. Resolve each affected dependency chain with `npm explain`; distinguish build/migration tools from shipped runtime packages. Check primary maintainer advisories before claiming application exposure.
- [ ] Select compatible patched versions from current registry metadata, update Next and `eslint-config-next` together, and regenerate the lockfile with Node 22. The previous audit's 16.3.4 proposal is evidence from that review, not a permanently prescribed latest version. Never run `npm audit fix --force` or accept the proposed Drizzle downgrade without an independently justified migration strategy.
- [ ] Move `shadcn` to devDependencies if source/import checks confirm it is used only as the component CLI. Review transitive updates; use overrides only with a tested compatibility justification, not to hide alerts.
- [ ] Document every remaining advisory with package/version/path, prerequisite, application reachability, mitigation, and review date. A known condition not used by this app may remain documented; an unresolved reachable high-impact runtime issue blocks completion.
- [ ] From the updated lockfile, run clean install, unit/DB tests, lint, typecheck, build, login/ingest smoke checks, and both audit variants. Read the installed Next guides after updating. If resolution needs an unrelated major refactor, split that concern into a newly documented commit rather than smuggling it into this one.
- [ ] Commit `chore(deps): update dependencies with reviewed advisories`.

## Commit 18 — Portable pull-request checks

**Files:** create `.github/workflows/ci.yml`, `.nvmrc`; modify `.github/workflows/deploy.yml`, `package.json`, `package-lock.json`, `tests/analyst-tools.int.test.ts`; use task 12's DB harness/helpers.

**Interfaces:** `.nvmrc` contains `22`; package `engines.node` is `22.x`. Add `typecheck: "next typegen && tsc --noEmit --incremental false"` so clean checkouts obtain Next route types before checking. CI exposes `workflow_call` as well as `pull_request` and non-main branch pushes; main/manual deployment calls reusable CI before deployment. Avoid `pull_request_target` and privileged tokens on fork code.

- [ ] Using the owned dataset/conversation fixture established in task 12, extend the analyst integration test to execute `log_recommended_action` as well as the existing six tools. Assert the emitted card and stored row belong to the fixture and are removed by cleanup. Never call Anthropic for this test.
- [ ] Configure reusable CI with Node 22, `npm ci`, lint, typecheck, unit tests, a Postgres 16 service, `npm run test:db`, and build. Give the service only disposable test credentials. Set `TEST_DATABASE_URL` explicitly; leave provider credentials absent. Make test setup independent of GCP variables.
- [ ] Require successful reusable CI in deployment. Gate the deploy job on explicit repository variable `DEPLOY_ENABLED == 'true'` and the existing main/manual triggers; maintain deployment-only OIDC permission. Example boundary:

```yaml
jobs:
  checks:
    uses: ./.github/workflows/ci.yml
  deploy:
    needs: checks
    if: vars.DEPLOY_ENABLED == 'true'
    permissions:
      contents: read
      id-token: write
```

Retain the existing deployment steps below this boundary and fail with a clear message if an enabled deployment lacks required GCP variables. No secrets are inherited by reusable checks.
- [ ] Validate YAML/job wiring, run the equivalent checks locally on Node 22, and inspect the first authorized PR workflow result during execution. Verify a repository without deployment variables can pass CI while deployment stays skipped. Add a non-pushing Docker runner/migrate build smoke check for changes to Dockerfile or dependency manifests; smoke-test static assets through the actual standalone image.
- [ ] Commit `ci: validate pull requests independently of deployment`.

## Commit 19 — Accurate demo and contributor documentation

**Files:** modify `README.md`, `docs/DEPLOY.md`, `docs/IMPLEMENTATION_PLAN.md`, and the history comment in `src/db/schema.ts`. Create `CONTRIBUTING.md` for the small contributor contract.

- [ ] Replace the impossible factual-guarantee claim with this accurate statement:

> Lead scores and reported tool metrics are computed deterministically. The analyst uses typed tools to inspect those metrics and generates explanations and recommendations; its prose and estimated impacts still require review.

- [ ] Describe the shared workspace, synthetic-data recommendation, and that sampled email addresses may be sent to the configured model provider. State that approvals only update simulated action records. Correct full-content-block persistence claims to match the text history actually stored; do not add a history redesign in this documentation commit.
- [ ] Document Node 22, `npm ci`, required auth secrets, optional provider credentials, fresh migrations, the new backfill, the isolated DB test command, upload/monetary contracts, session rotation, and `DEPLOY_ENABLED`. Distinguish application byte limits from platform limits and per-process admission from distributed quotas.
- [ ] Refresh the demo walkthrough from task 16's canonical outputs. Align the story tests and README's winner/qualified-CPL examples; preserve the cheap-versus-qualified narrative without inventing exact numbers. Mark provider availability/pricing as something to verify for a live presentation rather than a guaranteed fixed cost.
- [ ] Follow the clean-clone instructions in an isolated directory and database; check links and screenshots against actual behavior. No automated tests that only assert documentation wording are needed.
- [ ] Commit `docs: align demo claims and setup with implemented behavior`.

## Commit 20 — Public repository hygiene

**Files:** modify `.gitignore`; untrack the currently tracked `.idea` entries; delete `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, and `public/window.svg` only after verifying no references. Review `leads-screen.png` for removal as a redundant root screenshot; retain `docs/screenshots/` assets used by README.

- [ ] Use `rg` to check asset references. Add `.idea/` to ignore rules and untrack existing editor metadata while retaining the developer's local files (`git rm --cached` with explicit paths).
- [ ] Remove only confirmed unused scaffold files. Keep useful project instructions, screenshot assets, and documentation. Do not delete `.idea/workspace.xml` or other ignored local state.
- [ ] Verify `git ls-files` contains no actual `.env.local`, credential files, build output, or newly introduced test databases. Run build and inspect the README and favicon; no mirror tests are required.
- [ ] Commit `chore(repo): remove unused scaffold and editor metadata`.

## Decisions outside the 20 technical commits

- **License — resolved 2026-09-03:** the owner selected MIT after completion of the 20 technical commits. The [license](../../../LICENSE) is added in a separate documentation commit.
- **Broad live-demo access:** login throttling, provider spend/concurrency quotas, stream cancellation, and bounded conversation history need a separate deployment-policy scope. This plan does not claim those protections exist. Keep live access controlled until the hosting policy is defined.
- **Historical secrets:** the prior scan covered current tracked-file patterns. Before changing repository visibility, perform a separate history-aware secret check without printing values, and handle any confirmed historical exposure explicitly.

## Final acceptance and handoff

- [ ] Reconcile R01a–R15, D01, and P01 with commit hashes; note any changed task boundary rather than silently omitting a finding.
- [ ] On Node 22, run clean install, lint, typecheck, complete unit/DB suites, production build, and dependency audits. Use a fresh temporary database and a populated pre-backfill upgrade fixture.
- [ ] Run the standalone Docker image locally: login/deep-link login, failed-network retry, upload errors, sample load, all dashboard dimensions with sparse/full data, lead drawer, pagination, action approval/dismissal, and missing-provider-key behavior. Do not count HTTP 200 alone as a browser-interaction pass.
- [ ] Check the maximum accepted upload and all three adversarial scoring shapes with bounded benchmark processes; document the selected safe demo limits. Do not load-test a shared/live service.
- [ ] Confirm schema/history compatibility: old auth cookies intentionally require a new login; old scoring versions remain attributable; existing HQ revenue is repaired without changing other measures.
- [ ] Stop owned test services, remove owned temporary databases, and verify the only remaining working-tree changes are explicitly intended. No deployment, branch merge, repository-visibility change, or paid provider request is implicit in finishing this plan.

**Estimated grouping:** commits 01–08 establish safer boundaries; 09–16 correct data and visible behavior; 17–20 make the repository reproducible and presentable. Every commit remains a separate review unit and can be reverted independently subject to its listed dependencies.
