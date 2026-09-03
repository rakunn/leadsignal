# Contributing

Use Node 22 (`nvm use`) and install the lockfile with `npm ci`. Copy
`.env.example` to `.env.local` and set both authentication secrets. A provider key
is optional for the local deterministic pipeline; automated checks do not use it.

Before a pull request, run `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run build`. Run `npm run test:db` with an explicit `TEST_DATABASE_URL` for a
disposable Postgres 16 server whose user may create databases. The harness owns
and removes its databases, including on SIGINT/SIGTERM. Never use production
credentials for tests. See [setup](README.md) and [migrations](docs/DEPLOY.md).

Keep fixes focused and use Conventional Commits. Include a behavioral regression
for changed logic; avoid tests that merely compare source text. Preserve stored
scoring versions and applied migrations. New data repairs need an additive
migration and both fresh-install and upgrade checks. The shared-workspace and
simulated-approval model is intentional.

Next.js APIs may differ from older versions. Read the relevant installed guide
under `node_modules/next/dist/docs/` before changing framework-dependent code.

Use synthetic fixtures and never commit credentials or real lead exports.
LeadSignal uses the [MIT License](LICENSE). Preserve applicable copyright and
license notices when incorporating third-party code.
Dependency update evidence belongs in [DEPENDENCIES.md](docs/DEPENDENCIES.md).
