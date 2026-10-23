#!/usr/bin/env bash
# Brings the throwaway AWS test environment up, takes it down, or says what is there
# (decision T-43). The runner (CodeBuild project african-market-env, made by the bootstrap)
# runs this; so can you, from the repository root, with Docker for `up`:
#
#   AWS_PROFILE=aws-toolkit TTL_MINUTES=180 SCHEDULED_TEARDOWN=false \
#     bash infra/deploy/test-env.sh up                             # about 20-30 minutes
#   AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh status
#   AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh down     # about 10-15 minutes
#   AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh reap     # down, only if past its time
#   AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh unlock   # after a run that was stopped
#
# An environment lives TTL_MINUTES (45 to 180) from when it was first created; running `up`
# again keeps that deadline. `reap` takes it down once the deadline has passed: GitHub runs it
# every 30 minutes (.github/workflows/test-env.yml), and with SCHEDULED_TEARDOWN=true the
# environment also carries a one-time AWS schedule that starts the CodeBuild runner with
# ACTION=down, on the minute.
#
# Never stop an `up` (or a `down`) half way: Terraform keeps a lock while it works and would
# leave it behind, with resources it made but did not record. If it happens: `unlock`, then
# `down` (infra/terraform/README.md, "A run that was stopped").
#
# Needs terraform, jq, the AWS CLI, and for `up` Docker with buildx, node and pnpm.
set -euo pipefail

action="${1:-${ACTION:?say up, down, reap, status or unlock}}"
TF=infra/terraform/envs/test
DOMAIN=am.amahkudi.dev
tf() { terraform -chdir="$TF" "$@"; }
out() { tf output -json "$1"; }
vars=(-var "domain=$DOMAIN")
# Where Terraform keeps this environment's state and its lock (for `unlock`).
backend() { sed -n "s/^$1 *= *\"\(.*\)\"/\1/p" "$TF/backend.tfbackend"; }

section() { printf '\n== %s\n' "$*"; }

# Sets the task count of every service in the cluster, then waits until ECS has done it:
# `scale stopped` (0 tasks) or `scale running` (the counts in Terraform's desired_counts).
# Terraform sets a count only when it creates a service (ignore_changes in modules/ecs-service),
# so this starts and stops existing apps. It goes by the services ECS has, not by the output:
# outputs in the state are only as new as the last apply.
scale() {
  local cluster counts arn app count services i
  cluster="$(out cluster_name | jq -r .)"
  [ "$1" = running ] && counts="$(out desired_counts)"
  mapfile -t services < <(aws ecs list-services --cluster "$cluster" \
    --query 'serviceArns[]' --output text | tr '\t' '\n' | sed '/^$/d')
  for arn in "${services[@]}"; do
    app="${arn##*/}"
    count=0
    if [ "$1" = running ]; then
      count="$(jq -r --arg app "$app" '.[$app] // empty' <<< "$counts")"
      if [ -z "$count" ]; then
        echo "::warning::$app has no count in desired_counts; left as it is."
        continue
      fi
    fi
    aws ecs update-service --cluster "$cluster" --service "$arn" --desired-count "$count" \
      --query 'service.[serviceName,desiredCount]' --output text
  done
  # The waiter takes at most 10 services at a time. When it gives up, say which services did
  # not get there and what ECS last said about each, instead of only "max attempts exceeded".
  for ((i = 0; i < ${#services[@]}; i += 10)); do
    if ! aws ecs wait services-stable --cluster "$cluster" --services "${services[@]:i:10}"; then
      aws ecs describe-services --cluster "$cluster" --services "${services[@]:i:10}" \
        --query 'services[?runningCount != desiredCount].[serviceName, runningCount, desiredCount, events[0].message]' \
        --output text | while IFS=$'\t' read -r name running desired message; do
        echo "::error::$name: $running of $desired tasks running. ECS: $message"
      done
      return 1
    fi
  done
}

# The test account only: the AWS profile is shared with other projects, so check whose
# credentials these are before anything else (Terraform's allowed_account_ids checks again).
EXPECTED_ACCOUNT=726228202446
account="$(aws sts get-caller-identity --query Account --output text)"
if [ "$account" != "$EXPECTED_ACCOUNT" ]; then
  echo "::error::Signed in to AWS account $account; test environments live in $EXPECTED_ACCOUNT only. Nothing was changed." >&2
  exit 1
fi

tf init -input=false -reconfigure -backend-config=backend.tfbackend > /dev/null

case "$action" in
  up)
    # No defaults (decision T-45): how long it lives, and whether AWS also takes it down.
    vars+=(-var "ttl_minutes=${TTL_MINUTES:?TTL_MINUTES: how many minutes it lives, 45 to 180}")
    vars+=(-var "scheduled_teardown=${SCHEDULED_TEARDOWN:?SCHEDULED_TEARDOWN: true or false}")
    tag="$(git rev-parse HEAD)"

    section "1/6 Image repositories"
    # First, so the images have somewhere to go before the services that run them exist.
    tf apply -input=false -auto-approve "${vars[@]}" -target=module.platform.module.ecr

    section "2/6 Images (commit ${tag:0:12})"
    registry="$(out ecr_repositories | jq -r .gateway | sed 's#/gateway$##')"
    aws ecr get-login-password | docker login --username AWS --password-stdin "${registry%%/*}"
    docker buildx create --use --name am-builder > /dev/null 2>&1 || docker buildx use am-builder
    # The Next apps get this environment's addresses compiled in, and Google Maps from
    # GOOGLE_MAPS_BROWSER_KEY and GOOGLE_MAP_ID (GitHub variables of the `test` environment;
    # `none` for a site with lists only). No defaults (decision T-45): a missing one stops here.
    REGISTRY="$registry" TAG="$tag" BUILD_ID="$tag" \
      NEXT_PUBLIC_GATEWAY_URL="https://api.$DOMAIN" \
      NEXT_PUBLIC_WEB_URL="https://$DOMAIN" \
      NEXT_PUBLIC_SELLER_URL="https://seller.$DOMAIN" \
      NEXT_PUBLIC_SENTRY_DSN=none \
      NEXT_PUBLIC_SENTRY_ENVIRONMENT=test \
      NEXT_PUBLIC_GOOGLE_MAPS_KEY="${GOOGLE_MAPS_BROWSER_KEY:?set the GitHub variable, none for no map}" \
      NEXT_PUBLIC_GOOGLE_MAP_ID="${GOOGLE_MAP_ID:?set the GitHub variable, none for no map}" \
      docker buildx bake -f infra/docker/docker-bake.hcl --push phase1

    section "3/6 Infrastructure, apps not started"
    # Everything, with every app at 0 tasks: the apps start only after the migrations (step 5),
    # so new code never meets an old schema. (Not a -target apply: that misses dependencies
    # Terraform cannot see, such as the internet gateway the load balancer needs.)
    # An `up` on an environment that is already up stops its apps first, for the same reason.
    if out cluster_name > /dev/null 2>&1; then scale stopped; fi
    vars+=(-var "image_tag=$tag")
    tf apply -input=false -auto-approve "${vars[@]}" -var apps_running=false

    section "4/6 Migrations"
    bash infra/deploy/run-migrations.sh "$TF"

    section "5/6 Apps"
    scale running

    section "6/6 Made-up shops"
    secret="$(out otp_test_numbers_secret | jq -r .)"
    OTP_TEST_NUMBERS="$(aws secretsmanager get-secret-value --secret-id "$secret" \
      --query SecretString --output text)" \
      SEED_GATEWAY_URL="https://api.$DOMAIN" SEED_RUNNER=ecs SEED_TF_DIR="$TF" \
      node tools/test-env/seed.mjs

    section "Ready"
    out urls | jq -r 'to_entries[] | "\(.key): \(.value)"'
    echo "Deletes itself at $(out expires_at | jq -r .) (UTC)."
    inspection="$(out inspection_logins)"
    if [ "$inspection" != "{}" ]; then
      echo
      echo "Inspection pages (each asks for its own login):"
      out inspection_urls | jq -r 'to_entries[] | "  \(.key): \(.value)"'
      jq -r 'to_entries[] | "  \(.key) password (user \(.value.user); \(.value.note)):\n    aws secretsmanager get-secret-value --secret-id \(.value.secret) --query SecretString --output text --profile aws-toolkit --region eu-north-1"' <<< "$inspection"
    fi
    echo "Test sign-in codes: aws secretsmanager get-secret-value --secret-id $secret --query SecretString --output text --profile aws-toolkit --region eu-north-1"
    ;;

  down)
    section "Destroying the test environment"
    tf destroy -input=false -auto-approve "${vars[@]}"
    echo "Gone. The state bucket, the runner, the budget and the DNS zone stay (bootstrap)."
    ;;

  reap)
    if ! tf state list 2> /dev/null | grep -q .; then
      echo "Nothing is running."
      exit 0
    fi
    expires="$(out expires_at 2> /dev/null | jq -r . || true)"
    if [ -z "$expires" ] || [ "$expires" = "null" ]; then
      echo "::warning::An environment exists with no deadline (an \`up\` stopped early?); taking it down."
    elif [ "$(date -u +%s)" -lt "$(date -u -d "$expires" +%s)" ]; then
      echo "Up until $expires (UTC); nothing to do."
      exit 0
    fi
    section "Past its deadline ($expires): destroying"
    tf destroy -input=false -auto-approve "${vars[@]}"
    ;;

  unlock)
    # Only after a run that was stopped half way: a live run's lock must never be taken.
    # (The workflow refuses while another run of it is going; by hand, check that first.)
    lockfile="s3://$(backend bucket)/$(backend key).tflock"
    if ! lock="$(aws s3 cp "$lockfile" - 2> /dev/null)"; then
      echo "No lock: nothing to do."
      exit 0
    fi
    echo "Lock held: $(jq -r '"\(.Operation) by \(.Who), since \(.Created)"' <<< "$lock")"
    tf force-unlock -force "$(jq -r .ID <<< "$lock")"
    echo "Released. If that run had started creating things, run \`down\` now."
    ;;

  status)
    if tf state list 2> /dev/null | grep -q .; then
      echo "Up: $(tf state list | wc -l) resources."
      out urls 2> /dev/null | jq -r 'to_entries[] | "\(.key): \(.value)"' || true
      echo "Deletes itself at $(out expires_at 2> /dev/null | jq -r . || echo '?') (UTC)."
    else
      echo "Down: nothing is running."
    fi
    ;;

  *)
    echo "Usage: $0 up|down|reap|status|unlock" >&2
    exit 2
    ;;
esac
