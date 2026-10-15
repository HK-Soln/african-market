# Branching and CI/CD

How code moves from a laptop to production, and what guards each step. Decision record: T-16 in
[`../DECISIONS.md`](../DECISIONS.md).

## Branches

| Branch       | Role                                  | Changes arrive by                          | Deploys to                      |
| ------------ | ------------------------------------- | ------------------------------------------ | ------------------------------- |
| `main`       | Production. Always releasable.        | Pull request from `stage` only             | production, after your approval |
| `stage`      | Release candidate, tested on staging. | Pull request from `dev` only               | staging                         |
| `dev`        | Integration. Default branch.          | Pull request from a feature branch, squash | nothing                         |
| `<type>/<n>` | One task or a small group of tasks.   | Commits                                    | nothing                         |

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
| `CodeQL (JS/TS SAST)`                      | `security.yml`      | Static analysis of the TypeScript code for security and quality problems    | dev, stage, main |
| `E2E (Playwright)`                         | `ci.yml`            | The core journeys in a browser, English and Arabic, against the real images | dev, stage, main |
| `Images (build · scan)`                    | `ci.yml`            | Affected apps' images build; Trivy findings go to the Security tab          | not required     |
| `Terraform (fmt · validate)`               | `ci.yml`            | `infra/terraform` is formatted and every stack is valid                     | not required     |
| a successful `staging` deployment          | `deploy.yml`        | The commit being promoted to `main` is running on staging                   | main             |

The security workflow also runs every Monday, so a newly disclosed vulnerability shows up even when
nothing changed. Dependabot opens weekly update pull requests against `dev` (npm and GitHub Actions);
framework majors pinned by T-07 are excluded.

Trivy is non-blocking for now: it reports HIGH and CRITICAL findings with a fix available, and the
job passes. Make it blocking once the first findings have been worked through.

## Deploys

`deploy.yml`, on every push to `stage` (staging) and `main` (production):

1. images for every app of the current phase, tagged with the commit, pushed to the
   environment's ECR;
2. the new task definitions, then every service's migrations as one-off ECS tasks (a failure stops
   the deploy with the old version still serving);
3. `terraform apply` rolls the services out; ECS rolls back a service that does not get healthy;
4. on staging, the `@smoke` end-to-end tests against the real site.

AWS access is GitHub OIDC: each job gets a short-lived role, and no AWS key is stored in GitHub.
The role trusts only jobs running in its GitHub environment, and GitHub lets only `stage` use
`staging` and only `main` use `production`, which also needs an approval (one reviewer: Henson,
decided 2026-10-16). Until an environment's role exists, its deploy is skipped with a notice. Setup:
`infra/terraform/README.md`.

`main` requires a successful `staging` deployment of the commit: a promotion to production must
already be running on staging. Until staging exists, nothing can merge into `main`, which is
intended: there is no production to deploy to either.

Staging runs 08:00-20:00 Dubai time, Monday to Friday; the **Staging on / off** workflow turns it
on or off outside those hours (`staging-power.yml`).

The Nx remote cache stays off until CI gets slow enough to need it (decided 2026-10-16).

## Enforcement

The rules live in the repository as code:

- `infra/github/rulesets/{dev,stage,main}.json`: one GitHub ruleset per branch. Each blocks
  deletion and force pushes, requires a pull request with resolved conversations, fixes the merge
  method (squash into `dev`, merge commit into `stage` and `main`) and lists the required checks.
- `infra/github/apply-rulesets.sh`: applies them with the GitHub CLI and sets the repository
  options (default branch `dev`, rebase merging off, delete branches on merge).

To change a rule, edit the JSON in a pull request, then run the script after it merges.

**Plan requirement.** The repository is public, which is what lets GitHub enforce these rulesets
on the organisation's Free plan. If it is ever made private again, enforcement stops (GitHub
answers 403 for rulesets) until the organisation moves to the Team plan; the checks would still run
but nothing would block a merge or a direct push.

**Reviews.** The required approval count is 0 because the repository has one maintainer with write
access and GitHub does not let an author approve their own pull request. Raise
`required_approving_review_count` and turn on `require_code_owner_review` in the ruleset files once
a second person has write access.

**CodeQL.** Code scanning is free on a public repository, so the job runs on every pull request
and is a required check. On a private repository it needs GitHub Code Security: the job is then
skipped unless the repository variable `CODEQL_ENABLED=true` is set.

## Renaming a check

Job names are the contract between the workflows and the rulesets. If a job's `name:` changes, the
matching `context` in all three ruleset files must change in the same pull request, and the script
must be re-run after the merge; otherwise the old name stays required and nothing can merge.
