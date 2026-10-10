#!/usr/bin/env bash
# Applies the repository settings and branch rulesets in this folder to GitHub. Idempotent:
# a ruleset with the same name is updated, otherwise it is created.
#
#   infra/github/apply-rulesets.sh [owner/repo]
#
# Needs the GitHub CLI (`gh`) logged in as a repository admin, and the dev, stage and main
# branches to exist. Rulesets on a PRIVATE repository need a paid plan (GitHub Team for an
# organisation); on the Free plan GitHub answers 403 and nothing is enforced.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rulesets"

echo "Repository settings for $REPO"
# dev is where pull requests land by default. Squash (feature -> dev) and merge commits
# (promotions) only; rebase merging is off so promoted history is never rewritten.
gh api -X PATCH "repos/$REPO" \
  -f default_branch=dev \
  -F allow_squash_merge=true \
  -F allow_merge_commit=true \
  -F allow_rebase_merge=false \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY \
  --silent

for file in "$DIR"/dev.json "$DIR"/stage.json "$DIR"/main.json; do
  name="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).name)' "$file")"
  id="$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id")"
  if [ -n "$id" ]; then
    echo "Updating ruleset: $name"
    gh api -X PUT "repos/$REPO/rulesets/$id" --input "$file" --silent
  else
    echo "Creating ruleset: $name"
    gh api -X POST "repos/$REPO/rulesets" --input "$file" --silent
  fi
done

echo "Done. Active rulesets:"
gh api "repos/$REPO/rulesets" --jq '.[] | "  \(.name) (\(.enforcement))"'
