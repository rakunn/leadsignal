# Dependency advisory review

Reviewed: 2026-09-03 (Node 22)

`npm audit` reports four moderate findings and `npm audit --omit=dev` reports
zero findings. The remaining findings are one advisory represented by each
affected package in the same development-only chain:

| Affected package and lockfile path | Prerequisite and reachability | Disposition and mitigation |
| --- | --- | --- |
| `drizzle-kit@0.31.10` (`node_modules/drizzle-kit`) | Schema/migration tooling. The standalone application image does not carry it; the separate migration image intentionally includes the full dependency tree and executes `npx drizzle-kit migrate`. The database test harness uses `drizzle-orm`'s migrator directly. | npm offers only a forced downgrade to `drizzle-kit@0.18.1`, a breaking change, to remove this chain. Keep the current reviewed Drizzle Kit release and review again when it drops the legacy loader dependency. |
| `@esbuild-kit/esm-loader@2.6.5` (`node_modules/@esbuild-kit/esm-loader`) | Reached only through `drizzle-kit@0.31.10` in development and the one-shot migration image; absent from the standalone application image. | The migration image runs `drizzle-kit migrate`, not an esbuild development server. Track the upstream Drizzle Kit chain; do not add an override that claims to fix an incompatible loader. |
| `@esbuild-kit/core-utils@3.3.2` (`node_modules/@esbuild-kit/core-utils`) | Reached only through `drizzle-kit → @esbuild-kit/esm-loader` in the same tooling/migration path. | Same tooling-only reachability and mitigation. Review on the next dependency maintenance pass or when Drizzle Kit publishes a compatible release without this package. |
| `esbuild@0.18.20` (`node_modules/@esbuild-kit/core-utils/node_modules/esbuild`) | Reached only through `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils`. The [esbuild maintainer advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) requires use of esbuild's `serve` feature and a user visiting an attacker-controlled site. LeadSignal does not start that server: the standalone image runs the built Next server and the migration image runs a one-shot migration command. | The advisory is fixed in esbuild `>=0.25.0`, but this nested package is pinned to `~0.18.20` by the loader. Do not use esbuild's vulnerable `serve` feature, keep development services local, and retain the supported Drizzle Kit version rather than applying npm's forced downgrade. |

The full audit also contains the upstream effect entries for the same advisory
(`drizzle-kit`, `@esbuild-kit/esm-loader`, `@esbuild-kit/core-utils`, and
`esbuild`); they are not four separate attack paths. The production-only audit
is clean as of this review. The dedicated migration image is assessed by the
tooling-chain disposition above; it does not run an esbuild HTTP server.

Review this record when updating Drizzle Kit, changing database tooling, or by
2026-12-03, whichever occurs first.
