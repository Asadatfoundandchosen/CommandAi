# Branch protection (`main`)

Canonical repo: **`github.com/1commandai/platform`**. This document matches product policy for **`main`**: **required PR reviews (1 approver)**, **dismiss stale reviews** when new commits are pushed, **require review from CODEOWNERS**, **require signed commits**, **require linear history**, plus **passing CI** via **required status checks** (e.g. `lint`, `test`, `build`), **no force push**, and rules **apply to administrators** (no bypass).

Apply in the GitHub UI (or **Repository rulesets** API) for branch pattern **`main`**.

## GitHub UI: classic branch protection

1. **Settings** → **Branches** → **Add rule** (or edit) for **`main`**.
2. Enable:

   | Setting | Value |
   |---------|--------|
   | **Require a pull request before merging** | On |
   | **Required approvals** | **1** |
   | **Dismiss stale pull request approvals when new commits are pushed** | On |
   | **Require review from Code Owners** | On (requires `.github/CODEOWNERS` with real `@org/team` or `@username`) |
   | **Require status checks to pass before merging** | On — add required checks named exactly as your workflows publish them, e.g. **`lint`**, **`test`**, **`build`** (names must match the check run title in GitHub Actions / other CI) |
   | **Require branches to be up to date before merging** | Recommended On |
   | **Require signed commits** | On |
   | **Require linear history** | On (use **Squash** or **Rebase** merge; no merge commits) |
   | **Do not allow force pushes** | On |
   | **Do not allow deletions** | On (optional, protects `main`) |
   | **Do not allow bypassing the above settings** | On — including for **administrators** (leave “bypass” list empty so admins follow the same rules) |

3. Save.

> **Note:** GitHub’s wording varies (“Include administrators”, “Allow administrators to bypass”). For **one policy for everyone**, do **not** grant administrators a bypass of required reviews, checks, or signatures.

## Repository rulesets (alternative)

Under **Settings** → **Rules** → **Rulesets**, target `main` with: PR required, 1 review, code owners, required workflows **`lint`**, **`test`**, **`build`**, signed commits, linear history, block force push, no bypass for admins.

## CI check names

Your GitHub Actions jobs must **expose** check runs named **`lint`**, **`test`**, and **`build`** (or rename the rows above to match). Example job `name:` in workflow YAML:

```yaml
jobs:
  lint:
    name: lint
    runs-on: ubuntu-latest
    ...
```

## Related files

| File | Purpose |
|------|---------|
| `.github/CODEOWNERS` | Code owners for required reviews |
| `.github/pull_request_template.md` | PR template |
| `docs/CONTRIBUTING.md` | Trunk-based workflow, branches, commits |
| `docs/GPG_SETUP.md` | Signed commits |

Replace placeholder handles in **CODEOWNERS** with real GitHub identities.

## Acceptance criteria (verification)

These checks assume **`github.com/1commandai/platform`** exists and **`main`** protection is configured as above. This workspace cannot query GitHub for you — run the checks in the browser or with `gh` CLI.

| Criterion | How to verify | Repo / config |
|-----------|----------------|---------------|
| **Repository exists and accessible** | Open `https://github.com/1commandai/platform` while logged in (or `gh repo view 1commandai/platform`). Clone over HTTPS/SSH. | Documented in `docs/CONTRIBUTING.md` |
| **Branch protection rules active** | **Settings** → **Branches** → rule on `main` shows as enabled, or **Rules** → **Rulesets** lists an active ruleset for `main`. | `docs/BRANCH_PROTECTION.md` (this file) |
| **Direct push to `main` blocked** | With a non-admin test account (or PAT) with write access: `git push origin HEAD:main` on a commit not from a PR merge → **rejected**. Admins must also have **no bypass** if you require the same behavior for them. | Enable **Require a pull request before merging** and **Do not allow bypassing** |
| **PR without review cannot merge** | Open a test PR: merge button disabled until **at least one approving review** (and **CODEOWNERS** approval if that rule is on and owners are assigned). | **1** required approval + **Require review from Code Owners** |
| **Unsigned commits rejected** | Push a branch with an **unsigned** commit, open PR to `main` → merge blocked or commit marked not verified per policy. Signed-only merges require **Require signed commits** on `main`. | `docs/GPG_SETUP.md` |
| **CODEOWNERS notified on PR** | Open a PR that touches e.g. `src/...` → **Reviewers** panel should list owners from `.github/CODEOWNERS` for matched paths. **Insights** → **Dependency graph** → **Codeowners** can surface issues. | `.github/CODEOWNERS` — **must use real `@user` / `@org/team`**; placeholder `@1commandai/...` teams that do not exist will **not** notify anyone until replaced |

### Quick negative tests (optional)

1. **Unsigned commit:** create commit without signing, push to `feature/test-unsigned`, open PR → expect policy failure on `main`.
2. **No review:** approve yourself only if policy forbids (or use second account); with **1** external reviewer required, solo merge should fail.
3. **CODEOWNERS:** change a file under `/infrastructure/terraform/modules/vpc/` and confirm reviewers include the team/person mapped to that path.

## PR merge policy (six acceptance criteria)

| Criterion | In-repo / docs | Live on GitHub |
|-----------|----------------|----------------|
| **PR requires 1 approval to merge** | `docs/BRANCH_PROTECTION.md` → **Required approvals: 1** | Turn on in branch protection / ruleset for `main`. |
| **New commit dismisses previous approval** | Same doc → **Dismiss stale pull request approvals when new commits are pushed** | Same. After push to PR branch, prior approval should clear until re-approved. |
| **Unsigned commit rejected** | **Require signed commits** on `main`; `docs/GPG_SETUP.md` | Same. PR head commits must be signed (or merge blocked per org policy). |
| **PR template appears on new PRs** | **`.github/pull_request_template.md`** (default template path GitHub uses) | File must exist on the **default branch**; open **New pull request** and confirm body is pre-filled. |
| **CODEOWNERS auto-requested for review** | **`.github/CODEOWNERS`** + **Require review from Code Owners** | **Require review from Code Owners** must be On. Owners must be **valid** `@user` / `@org/team` — placeholders like `@1commandai/platform-engineering` do not auto-request until replaced. |
| **Merge blocked without passing checks** | Doc requires **Require status checks** (`lint`, `test`, `build`). | Protection must list those checks **and** workflows must publish them. **This repo has no `.github/workflows/` yet** — add CI (or checks will never run / merge may stay blocked or checks missing until configured). |
