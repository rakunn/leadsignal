# Public demo readiness: implementation record

Verified on 2026-09-03 against Node 22 and Postgres 16. The approved
[plan](superpowers/plans/2026-09-03-public-demo-readiness.md) is implemented in
20 focused commits on `rafal/public-demo-readiness`, based on `4910d35`.
The existing analyst work in that baseline is preserved.

## Delivered changes

| Commit | Requirement | Result |
| --- | --- | --- |
| 01 | R03 | Local Postgres publishes only on `127.0.0.1`. |
| 02 | R02 | Signed sessions expire after 30 days and are revoked by password or signing-secret rotation. |
| 03 | R12 | Login accepts safe local destinations, including after URL normalization. |
| 04 | R11 | Network and server login failures restore the form and have distinct feedback. |
| 05 | R01c | Email syntax checks reject oversized input before expensive validation. |
| 06 | R01a | Burst-window marking visits each qualifying index once after sorting. |
| 07 | R01b | Source-value percentile lookup uses binary search with preserved ceiling-rank semantics. |
| 08 | R01d | Uploads have file, request, row, cell, and process-level admission limits. |
| 09 | R04 | Malformed CSV quoting, column counts, and duplicate headers reject the whole file. |
| 10 | R05 | Monetary values use exact bounded cents; rejected rows produce visible correction guidance. |
| 11 | R06 | Duplicate leads register additional aliases against the earliest representative. |
| 12 | R08 | An additive migration repairs existing high-quality revenue; integration tests own disposable databases. |
| 13 | R07 | Dashboard totals retain every lead when selected dimensions are missing or partial. |
| 14 | R09 | Approval and dismissal refresh the action log while preserving current chat text. |
| 15 | R10 | Pagination clamps malformed/out-of-range inputs and uses real disabled boundary buttons. |
| 16 | R14 | Sample business metrics stay stable when its displayed dates change. |
| 17 | D01 | Compatible dependency updates remove production audit findings; remaining tooling findings are documented. |
| 18 | R15 | Pull-request checks run independently of deployment credentials; deployment requires an explicit opt-in. |
| 19 | R13, P01 | Setup, data-sharing, model-output, persistence, and simulated-action claims match the implementation. |
| 20 | P01 | Unused scaffold assets and tracked editor metadata are removed; required public-directory structure is retained. |

Commit subjects and dependencies are listed in the plan. Review corrections are
folded into their corresponding commits. The mixed-upload database regression
lives in commit 12 with its required database harness; its application behavior
ships in commit 10. The upload-limit commit also configures Next's proxy buffer
because its default would truncate otherwise supported uploads.

To list the original handoff commits in order:

```sh
git log --reverse --oneline 4910d35..rafal/public-demo-readiness
```

## Verification completed

- A clean export of tracked files passed `npm ci`, lint, type checking, all
  105 unit tests, and the production build. It contained no `.env.local` or
  previously generated build output.
- All five database integration tests passed in four suites using newly
  created, owned databases. Coverage includes all seven analyst tools,
  mixed-row upload feedback, sparse/partial dashboard rendering across all
  five dimensions, and populated migration upgrades.
- The migration test compared existing non-target rollup fields, repaired
  high-quality revenue across dimensions and UTC boundaries, and verified
  repeat application leaves the values unchanged. The fresh migration chain
  and the separate migration Docker image both ran successfully.
- A real cancellation probe verified that interrupting the database test
  child removes both owned databases.
- Standalone application and migration Docker images built successfully.
  The application served the login page and all 16 referenced static assets.
- Browser checks covered wrong-password feedback, offline login recovery and
  successful retry, safe and hostile login destinations, sample loading,
  sparse/full dimension navigation, lead scoring receipts, empty filters,
  keyboard pagination and out-of-range pages, and missing-provider feedback.
- A mixed CSV uploaded through the browser showed six skipped rows and five
  bounded correction messages after ingestion completed.
- Two synthetic recommendations exercised the real card controls, action
  update API, and database-backed action log. Approval and dismissal updated
  both views without a page reload or loss of chat text. Only the analyst SSE
  response was supplied as a fixture; no model-provider request was made.
- HTTP checks covered unauthenticated access, malformed CSV, 25,001 records,
  oversized ordinary and `__proto__` cells, file-byte overflow, and a 36 MiB
  chunked request without `Content-Length`. The latter returned 413 before
  ingestion and is also covered by the container CI check.
- Concurrent complete sample/upload requests produced one accepted request
  and one 429 with `Retry-After: 5`. A rejected request released admission so
  the next valid request succeeded.
- Uploading the downloadable sample CSV matched the sample button: 6,050
  leads, 1,558 high-quality leads, $10,175.08 spend, and $19,239.63 revenue.
  Date-stability tests include every weekday and leap-day/month/year changes.
- Independent subagent reviews were completed; their actionable findings were
  fixed and re-reviewed. Commit consolidation preserved the reviewed file tree.

GitHub-hosted workflows have not run: the branch has not been pushed. The local
checks above exercise their build/test path, including the container regression.
No remote deployment or paid provider call was used for verification.

## Measured limits and performance

The supported upload limits remain **32 MiB per file, 34 MiB per request,
25,000 records, and 4,096 characters per cell**. One ingestion may run per
application process. Next buffers request bodies before the route; its 35 MiB
buffer allows transport-chunk headroom above the application request limit.
Admission is not a cross-instance quota or a global bound on buffered requests.

A combined adversarial file at exactly 32 MiB and 25,000 rows completed over
HTTP in **15.3 seconds** in a local container constrained to **1 CPU and 2 GiB**.
It combined oversized malformed emails, identical burst timestamps, and
25,000 distinct source values. Adding one file byte returned 413. This is a
bounded acceptance observation, not a guarantee for every input or host.

Separate local scoring runs compared the original `4910d35` implementation
with the completed implementation, each in a process capped at 20 seconds:

| Synthetic scoring input | Rows | Before | After |
| --- | ---: | ---: | ---: |
| Identical timestamps | 4,000 | 146 ms | 48 ms |
| Identical timestamps | 8,000 | 546 ms | 49 ms |
| Identical timestamps | 16,000 | 2,435 ms | 76 ms |
| Identical timestamps | 25,000 | 6,304 ms | 124 ms |
| Distinct sources | 4,000 | 49 ms | 25 ms |
| Distinct sources | 8,000 | 84 ms | 40 ms |
| Distinct sources | 16,000 | 185 ms | 84 ms |
| Distinct sources | 25,000 | 389 ms | 177 ms |

These are single local observations, not CI thresholds. Behavioral oracle and
boundary tests verify score semantics separately. Malformed-email probes at
8k, 16k, 32k, and 64k characters completed within isolated two-second limits.

## Publication decisions still required

- Choose the repository's intended license. No license has been assumed.
- Complete a separate history-aware secret review before changing visibility;
  current tracked-file checks do not certify Git history.
- Keep live access controlled until login throttling, provider spend and
  concurrency limits, cancellation, and conversation-history policy are scoped.
  They were explicitly outside the approved technical plan.
- Verify the live provider's availability and pricing before a presentation.
  Scores are deterministic; generated explanations and impact estimates need
  review. Sampled email addresses can be sent to the configured provider.
- Revisit the four moderate tooling-chain audit entries documented in
  [DEPENDENCIES.md](DEPENDENCIES.md). The production-only audit has zero
  findings; the remaining esbuild advisory concerns an unused development
  server feature in the Drizzle migration/tooling dependency chain.

Old static authentication cookies intentionally require a new login. Stored
datasets keep their original scoring version; only new ingestions use
`2026-09-v3`. The revenue backfill updates the historical rollup measure without
silently rescoring those datasets.
