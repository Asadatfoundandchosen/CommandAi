# Contributing to 1CommandAI

Canonical repository: **`github.com/1commandai/platform`** (GitHub **monorepo**). **`main`** is the single source of truth; work ships via **small, frequent merges** from short-lived branches.

## Trunk-based development

1. **`main` is always deployable** (or releasable behind flags). Do not leave `main` broken; fix forward or revert.
2. **Branch from `main`**, open a **PR**, get **review + green CI**, merge the same day when possible. Keep feature branches **short-lived (under one day)**; if work is bigger, split into stacked PRs or use **feature flags**.
3. **Merge to `main` often** (squash or rebase per repo settings — **linear history** is required on `main`).
4. **No long-lived integration branches**; release branches are only used if your release process explicitly requires them (otherwise tag from `main`).
5. **Pull before branch**: `git fetch origin && git checkout main && git pull` before creating a new branch.

See **`docs/BRANCH_PROTECTION.md`** for required GitHub settings on `main` and **`docs/GPG_SETUP.md`** for signed commits.

## Branch naming

Use lowercase prefixes and short, kebab-case descriptions.

| Prefix | Use for |
|--------|---------|
| `feature/` | New behavior or user-visible capability (e.g. `feature/org-audit-log`) |
| `fix/` | Bug fixes (e.g. `fix/login-token-refresh`) |
| `chore/` | Tooling, deps, refactors without behavior change (e.g. `chore/bump-eslint`) |

Examples:

- `feature/add-tenant-export`
- `fix/ecr-lifecycle-typo`
- `chore/terraform-fmt`

## Commit messages (Conventional Commits)

Format:

```text
<type>(<optional scope>): <short description>

[optional body]

[optional footer(s): BREAKING CHANGE:, Fixes #123, etc.]
```

Common **types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`.

Examples:

- `feat(api): add org export endpoint`
- `fix(worker): handle empty job queue`
- `chore(terraform): align ecr module tags`
- `docs: add CONTRIBUTING trunk flow`

**Breaking changes**: add `!` after the type/scope (`feat(api)!: remove legacy field`) and/or a footer `BREAKING CHANGE: ...`.

## Pull requests

- Use the template in **`.github/pull_request_template.md`**.
- Ensure **CODEOWNERS**-requested reviewers are added (see **`.github/CODEOWNERS`** — replace placeholder `@1commandai/...` teams with real handles).
- Commits must be **signed** and show **Verified** on GitHub where branch protection requires it.

## Local development

```bash
npm ci
npm run lint
npm run format:check
npm run test:unit
npm run test:integration
npm run test:coverage   # enforces 80% coverage on collected src/** paths
npm run test:e2e      # requires: npx playwright install chromium
npm run build
```

**Mongo integration:** `tests/integration/mongo.integration.test.ts` runs only when **`RUN_MONGO_INTEGRATION=1`** (set in GitHub Actions for the **test** job). Locally, start Mongo (e.g. `docker run -p 27017:27017 mongo:7`) and run `cross-env RUN_MONGO_INTEGRATION=1 npm run test:integration`, or leave unset to skip the DB suite.

## CI workflow acceptance (`.github/workflows/ci.yml`)

These are verified on **GitHub Actions** after the workflow has run at least twice on the same `package-lock.json`.

| Criterion | Status in repo | How to verify on GitHub |
|-----------|----------------|-------------------------|
| **Workflow triggers on push / PR** | **Yes** — `on.push.branches: [main]` and `on.pull_request.branches: [main]`. | Open **Actions** tab; confirm **CI** runs on pushes to `main` and on PRs targeting `main`. |
| **All jobs run in parallel** | **Yes** — jobs `lint`, `security`, `test`, and `build` have **no `needs:`** between them (default parallelism). | Open a workflow run → **graph** / timeline: the four jobs should **start together** (wall-clock overlap). |
| **Cache hit on second run** | **Configured** — `actions/cache` on `node_modules` (key includes `hashFiles('package-lock.json')`); Docker **GHA** cache on the **build** job (`cache-from` / `cache-to: type=gha`). | Re-run the **same** workflow on the same commit (or a commit that does not change `package-lock.json`). In the log for **Cache node_modules**, look for **Cache hit**; Docker step should show cache layers reused on repeat runs. |
| **Build time under 5 minutes (with cache)** | **Not guaranteed in YAML** — depends on runner queue, network, and future job weight. | In **Actions** → run summary, confirm **total workflow** duration; after warm cache, typical small pipelines often stay under **5 minutes** — treat as an **SLO** to monitor, not a hard repo assertion. |
| **Coverage uploaded to Codecov** | **Configured** — `codecov/codecov-action@v5` uploads `coverage/lcov.info`; `fail_ci_if_error: false` so missing token does not fail CI. | Add **`CODECOV_TOKEN`** (and connect the repo in Codecov) to get reliable uploads; confirm reports in the Codecov UI. Without a token, public repos may still upload depending on Codecov policy. |
| **Failed lint blocks merge** | **Requires branch protection** — the check name exposed to GitHub is **`lint`** (job `name: lint`). | In repo **Settings** → **Branches** → `main` rule, under **Status checks**, require **`lint`** (and optionally `test`, `build`, `security`). Then open a PR that fails ESLint/Prettier → the **`lint`** check is red → merge is **blocked** until fixed. |

## Test pipeline acceptance (Jest / Playwright)

| Criterion | In-repo | How to verify |
|-----------|---------|----------------|
| **Unit tests run and pass** | **Yes** — `npm run test:unit` runs Jest on `src/**/*.unit.test.ts` (e.g. `src/lib/math.unit.test.ts`, `src/__ci__/ciSmoke.unit.test.ts`). CI runs this in the **Unit tests** step. | `npm run test:unit` locally; on PRs, open the **`test`** job log on GitHub Actions. |
| **Integration tests run against test DB** | **Yes in CI** — the **`test`** job defines a **MongoDB 7** service, sets **`MONGODB_URI`** and **`RUN_MONGO_INTEGRATION=1`**, and runs **`npm run test:integration`** (Supertest **`/health`** + Mongo ping suite). Locally, Mongo tests are **skipped** unless you set **`RUN_MONGO_INTEGRATION=1`** and run Mongo (see above). | Confirm **Integration tests** step is green on GitHub; logs should show the Mongo service healthy. |
| **E2E tests run in CI** | **Yes** — **Install Playwright browsers** then **`npm run test:e2e`** (`tests/e2e/smoke.spec.ts`, `webServer` runs `tests/e2e/server.cjs`). | **`test`** job includes **E2E tests** step; logs list Playwright results. |
| **Coverage report generated** | **Yes** — `npm run test:coverage` runs Jest with **`--coverage`**, writes **`coverage/lcov.info`** (and other reporters). CI uploads to **Codecov** after coverage. | Artifacts: open **`test`** job → expand **Unit + integration with coverage**; repo has `coverage/` when run locally (gitignored). |
| **Build fails if coverage under 80%** | **Yes** — `jest.config.js` sets **`coverageThreshold`** to **80%** for **lines**, **branches**, and **functions** on collected `src/**` paths. The step **`npm run test:coverage`** exits **non-zero** if thresholds are not met, which **fails the `test` job** (GitHub check name **`test`**). The separate **`build`** job (TypeScript + Docker) does **not** re-run Jest; branch protection should require **`test`** so sub-80% coverage blocks the PR. | Temporarily lower coverage or remove a test and confirm the **`test`** check turns **red**. |
| **Test results visible in PR checks** | **Requires branch protection** — the workflow job is named **`test`**, so the check appears as **`test`** on the PR. | **Settings** → **Branches** → `main` → require status check **`test`** (see **`docs/BRANCH_PROTECTION.md`**). Then each PR shows **test** (and **`lint`**, **`build`**, etc.) in the merge box. |

## Creating the GitHub repository (org admins)

If **`1commandai/platform`** does not exist yet:

1. GitHub org **1commandai** → **Repositories** → **New repository**.
2. Name: **`platform`**, visibility per policy, **no** auto-generated README if this monorepo already has content to push.
3. Push this codebase and configure **`main`** as default.
4. Apply branch protection per **`docs/BRANCH_PROTECTION.md`** (reviews, checks `lint` / `test` / `build`, signed commits, no force push, rules apply to administrators).

## Questions

Open a discussion or issue in **`1commandai/platform`** per team norms.
