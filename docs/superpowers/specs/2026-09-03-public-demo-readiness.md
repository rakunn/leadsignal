# Public demo readiness remediation specification

## Objective and baseline

Prepare LeadSignal for public repository presentation by resolving the 3 September 2026 review in small, independently reviewable commits. This is a remediation pass on the existing shared-password demo, not a redesign or a multi-tenant product conversion.

The review covered the checkout at `c2c0eaa62b803dad134acfa8451d5fb58ae6fa53`, including then-uncommitted changes in `package.json`, `package-lock.json`, `src/components/analyst-chat.tsx`, `src/components/analyst-parts.ts`, and `tests/analyst-parts.test.ts`. During plan preparation those changes were committed separately as `4910d35` (`feat: implement reduceParts with tests and integrate into chat loop`). Use that current commit as the implementation baseline, preserve it, and inspect any newer working-tree changes before execution.

Verified baseline: lint, TypeScript, production build, all 46 tests with isolated Postgres, fresh migrations, production sample ingestion, and server-rendered main pages passed. The audit's 17 affected dependency entries are package advisories, not 17 demonstrated application exploits. Live provider calls, deployed GCP resources, interactive browser behavior, and Git-history secret exposure were not comprehensively tested.

## Requirements from the review

| ID | Required outcome |
|---|---|
| R01a | Burst detection no longer repeatedly traverses previously marked windows. |
| R01b | Source-value percentile lookup no longer linearly scans all distinct values per lead. |
| R01c | Overlong/malformed emails cannot trigger unbounded regex backtracking. |
| R01d | Uploaded bytes, records, field sizes, and concurrent ingestion have explicit server-enforced bounds. |
| R02 | Sessions expire on the server and prior cookies become invalid when the shared password or signing secret changes. |
| R03 | The supplied local database binds to loopback. |
| R04 | CSV syntax/header/field-count errors cannot silently shift or merge accepted data. |
| R05 | Populated monetary fields must parse completely and fit integer-cent storage. |
| R06 | New aliases encountered on duplicate rows remain available for later duplicate detection. |
| R07 | Optional-dimension gaps never change dataset-wide KPIs or remove navigation. |
| R08 | Existing HQ revenue is backfilled by a new migration without rewriting applied migrations. |
| R09 | Approving/dismissing a recommendation refreshes the visible action log. |
| R10 | Pagination boundaries cannot navigate outside the valid page range. |
| R11 | Login recovers from network failure without requiring a reload. |
| R12 | Post-login destinations are restricted to application paths on the same origin. |
| R13 | Documentation accurately distinguishes deterministic metrics from generated model claims. |
| R14 | The same sample seed produces the same business scenario regardless of today's weekday. |
| R15 | Pull requests receive portable checks, including independently provisioned database tests; deployment remains separately gated. |
| D01 | Dependencies receive a reviewed update and a documented disposition for remaining advisories. |
| P01 | Repository instructions, data notices, runtime requirements, and tracked assets are suitable for a public demo. |

## Design decisions for the implementation plan

- Preserve the existing Next App Router, standalone container, Postgres/Drizzle, deterministic scorer, and seven-tool analyst architecture.
- Keep the shared-workspace model and simulated action approvals. Do not add accounts, tenant isolation, live advertising writes, or a background job service in this pass.
- Sessions use a versioned, signed payload with issued-at, expiry, and a nonce. Keep the 30-day lifetime. Bind signatures to both configured authentication secrets so password rotation invalidates old sessions. Reject legacy static cookies; existing visitors sign in again once.
- First remove the three identified CPU-amplification paths. Then bound ingestion. Proposed demo defaults: 32 MiB file, 34 MiB total multipart body, 25,000 records, 4,096 characters per cell, 254 characters for email validity, one active ingestion per server process. These are application limits, not a promise about platform request limits. Verify maximum-size behavior before retaining the defaults.
- CSV files with fatal quoting errors, duplicate normalized headers, or field-count mismatches fail before insertion. Existing row-level date/campaign skips remain, with bounded explanations. A present monetary value must be a nonnegative plain decimal with up to two fractional digits, at most 2,147,483,647 cents. Currency symbols, grouping separators, exponents, and partial strings are rejected with guidance; missing optional amounts remain zero.
- Duplicate matching remains chronological. Register previously unseen identifiers on duplicate rows against the selected earliest representative. Do not retroactively suppress a previously unique lead merely because a later row bridges two existing groups.
- Dashboard headline totals always come from the complete campaign dimension. Optional-dimension charts describe only their available values, disclose missing coverage, and keep the dimension control visible. Do not manufacture a string sentinel that could collide with uploaded dimension names.
- Backfill HQ revenue with an additive SQL migration using the existing definition: composite score at least 70 and segment other than suppress. Preserve all other rollup measures and original migration files.
- Generate the sample business scenario using a canonical weekday schedule anchored to 2026-06-30 UTC, then shift timestamps to the requested window. Keep the existing public generator signature, seed variability, and 30-day window.
- Provision synthetic test data independently of the developer's database. Database fixtures own their dataset/conversation IDs and clean up their rows. The seventh analyst tool must actually execute in its integration test.
- Use Node 22 for repeatable project checks, matching the existing Docker/CI choice. Select dependency patches against the registry/advisories when implementation reaches that task; do not blindly apply forced audit fixes or downgrade Drizzle.
- License selection remained an owner decision during implementation. **Resolved 2026-09-03:** the owner selected MIT, added in a separate commit after the technical fixes; see [LICENSE](../../../LICENSE).

## Global constraints

- One concern per implementation commit; include its required tests and directly related documentation in that commit.
- Preserve existing uncommitted changes; never reset, overwrite, or include unrelated changes accidentally.
- Use Conventional Commit subjects and the `rafal/` branch prefix when creating a branch.
- Read relevant installed guides in `node_modules/next/dist/docs/` before editing Next-dependent code; re-read affected guides after changing Next versions.
- Preserve the shared-workspace and simulated-approval product model.
- Do not rewrite applied migrations or rescore existing user datasets silently.
- Use isolated synthetic databases for verification; never obtain fixtures by reading a live dataset.
- Do not spend provider credits or deploy remotely as part of automated checks.
- Prefer focused behavioral regressions; use manual checks for tiny UI/configuration edits and avoid brittle timing assertions in the normal test suite.

## Completion criteria

Every requirement above has a completed commit or an explicit documented advisory/owner decision. Fresh setup and upgrade paths pass, lint/types/build/unit/database checks pass on Node 22, the demo survives date shifts and optional CSV omissions, and the main browser flows work. Remaining dependency advisories have package path, prerequisite, reachability, mitigation, and review-date notes. Public repository readiness does not certify live production exposure, provider spend controls, or historical secrets.
