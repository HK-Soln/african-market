# Branching and CI/CD

How code moves from a laptop to production, and what guards each step. Decision record: T-16 in
[`../DECISIONS.md`](../DECISIONS.md).

## Branches

| Branch       | Role                                  | Changes arrive by                          | Deploys to (from F0-14) |
| ------------ | ------------------------------------- | ------------------------------------------ | ----------------------- |
| `main`       | Production. Always releasable.        | Pull request from `stage` only             | production              |
| `stage`      | Release candidate, tested on staging. | Pull request from `dev` only               | staging                 |
| `dev`        | Integration. Default branch.          | Pull request from a feature branch, squash | nothing yet             |
| `<type>/<n>` | One task or a small group of tasks.   | Commits                                    | nothing                 |

```
feat/branch-service-areas ──squash──▶ dev ──merge──▶ stage ──merge──▶ main
```

Nobody pushes to `dev`, `stage` or `main` directly, admins included. There is no bypass list.

### Feature branches

- Start from an up-to-date `dev`: `git switch dev && git pull && git switch -c feat/branch-service-areas`.
- Name: `<type>/<short-name>` in lower case, with type one of `feat`, `fix`, `chore`, `docs`,
  `refactor`, `perf`, `test`, `ci`, `build`, `hotfix`, `revert`.
- Open the pull request against `dev`. The title must be a conventional commit
  (`feat(shops): branch service areas`); it becomes the single squash commit on `dev`.
- `dev` requires the branch to be up to date before merging, so rebase or merge `dev` in when asked.
- The branch is deleted automatically after the merge.

### Promotions

- `dev` → `stage` and `stage` → `main` are pull requests merged with a **merge commit**, never
  squashed, so the commits on `main` are the same commits that were tested on `stage`.
- Promote `dev` → `stage` when a coherent set of work is ready for staging. Promote `stage` → `main`
  after it has been verified on staging.
- A hotfix follows the same path, only faster: `hotfix/<name>` → `dev` → `stage` → `main`. There is
  no shortcut into `stage` or `main`.

## Checks

Every pull request, and every push to the three long-lived branches, runs:

| Check (job name)                           | Workflow            | What it proves                                                              | Required on      |
| ------------------------------------------ | ------------------- | --------------------------------------------------------------------------- | ---------------- |
| `Format · Lint · Typecheck · Test · Build` | `ci.yml`            | Prettier, then Nx affected lint, typecheck, unit tests and build            | dev, stage, main |
| `Migrations (PostGIS)`                     | `ci.yml`            | Every service's migrations apply, in order, to an empty PostGIS database    | dev, stage, main |
| `Secret scan (gitleaks)`                   | `security.yml`      | No secret in any commit                                                     | dev, stage, main |
| `Dependency audit`                         | `security.yml`      | No critical advisory in production dependencies (lower severities reported) | dev, stage, main |
| `PR source branch`                         | `branch-policy.yml` | The pull request comes from the branch the flow allows                      | dev, stage, main |
| `PR title`                                 | `branch-policy.yml` | Conventional-commit title on pull requests into `dev`                       | dev              |
| `CodeQL (JS/TS SAST)`                      | `security.yml`      | Static analysis; skipped until code scanning is available (see below)       | not required yet |

The security workflow also runs every Monday, so a newly disclosed vulnerability shows up even when
nothing changed. Dependabot opens weekly update pull requests against `dev` (npm and GitHub Actions);
framework majors pinned by T-07 are excluded.

Still to come, tracked in the Phase 0 directive: Playwright end-to-end tests (F0-11), container
builds and Trivy image scanning (F0-12), and deployment with a required `staging` deployment before
`main` plus a manual approval on the `production` environment (F0-14).

## Enforcement

The rules live in the repository as code:

- `infra/github/rulesets/{dev,stage,main}.json`: one GitHub ruleset per branch. Each blocks
  deletion and force pushes, requires a pull request with resolved conversations, fixes the merge
  method (squash into `dev`, merge commit into `stage` and `main`) and lists the required checks.
- `infra/github/apply-rulesets.sh`: applies them with the GitHub CLI and sets the repository
  options (default branch `dev`, rebase merging off, delete branches on merge).

To change a rule, edit the JSON in a pull request, then run the script after it merges.

**Plan requirement.** GitHub only enforces rulesets on a private repository for organisations on
the Team plan or higher. On the Free plan the checks above still run and report on every pull
request, but GitHub will not block a merge or a direct push. Until the plan is upgraded the flow is
a convention backed by visible checks, not a hard gate.

**Reviews.** The required approval count is 0 because the repository has one maintainer with write
access and GitHub does not let an author approve their own pull request. Raise
`required_approving_review_count` and turn on `require_code_owner_review` in the ruleset files once
a second person has write access.

**CodeQL.** Code scanning on a private repository needs GitHub Code Security. Set the repository
variable `CODEQL_ENABLED=true` once it is available, then add `CodeQL (JS/TS SAST)` to the required
checks.

## Renaming a check

Job names are the contract between the workflows and the rulesets. If a job's `name:` changes, the
matching `context` in all three ruleset files must change in the same pull request, and the script
must be re-run after the merge; otherwise the old name stays required and nothing can merge.
