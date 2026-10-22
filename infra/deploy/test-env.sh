#!/usr/bin/env bash
# Brings the throwaway AWS test environment up, takes it down, or says what is there
# (decision T-43). The runner (CodeBuild project african-market-env, made by the bootstrap)
# runs this; so can you, from the repository root, with Docker for `up`:
#
#   AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh up       # about 20-30 minutes
#   AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh status
#   AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh down     # about 10-15 minutes
#   AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh reap     # down, only if past its time
#
# An environment lives TTL_HOURS (default 3) from when it was first created; running `up` again
# keeps that deadline. `reap` takes it down once the deadline has passed: GitHub runs it every
# 30 minutes (.github/workflows/test-env.yml), and with SCHEDULED_TEARDOWN=true the environment
# also carries a one-time AWS schedule that starts the CodeBuild runner with ACTION=down.
#
# Needs terraform, jq, the AWS CLI, and for `up` Docker with buildx, node and pnpm.
set -euo pipefail

action="${1:-${ACTION:-status}}"
TF=infra/terraform/envs/test
DOMAIN="${DOMAIN:-am.amahkudi.dev}"
TTL_HOURS="${TTL_HOURS:-3}"
tf() { terraform -chdir="$TF" "$@"; }
out() { tf output -json "$1"; }
vars=(-var "domain=$DOMAIN" -var "ttl_hours=$TTL_HOURS" -var "scheduled_teardown=${SCHEDULED_TEARDOWN:-false}")

section() { printf '\n== %s\n' "$*"; }

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
    tag="$(git rev-parse HEAD)"

    section "1/6 Image repositories"
    # First, so the images have somewhere to go before the services that run them exist.
    tf apply -input=false -auto-approve "${vars[@]}" -target=module.platform.module.ecr

    section "2/6 Images (commit ${tag:0:12})"
    registry="$(out ecr_repositories | jq -r .gateway | sed 's#/gateway$##')"
    aws ecr get-login-password | docker login --username AWS --password-stdin "${registry%%/*}"
    docker buildx create --use --name am-builder > /dev/null 2>&1 || docker buildx use am-builder
    # The Next apps get this environment's addresses compiled in.
    REGISTRY="$registry" TAG="$tag" BUILD_ID="$tag" \
      NEXT_PUBLIC_GATEWAY_URL="https://api.$DOMAIN" \
      NEXT_PUBLIC_WEB_URL="https://$DOMAIN" \
      NEXT_PUBLIC_SENTRY_ENVIRONMENT=test \
      docker buildx bake -f infra/docker/docker-bake.hcl --push phase1

    section "3/6 Task definitions"
    # The services start only after the migrations, so new code never meets an old schema.
    vars+=(-var "image_tag=$tag")
    tf apply -input=false -auto-approve "${vars[@]}" \
      -target=module.platform.module.service -target=module.platform.module.gateway \
      -target=module.platform.module.next -target=time_static.created

    section "4/6 Migrations"
    bash infra/deploy/run-migrations.sh "$TF"

    section "5/6 Everything else"
    tf apply -input=false -auto-approve "${vars[@]}"
    cluster="$(out cluster_name | jq -r .)"
    mapfile -t services < <(aws ecs list-services --cluster "$cluster" \
      --query 'serviceArns[]' --output text | tr '\t' '\n')
    aws ecs wait services-stable --cluster "$cluster" --services "${services[@]}"

    section "6/6 Made-up shops"
    secret="$(out otp_test_numbers_secret | jq -r .)"
    OTP_TEST_NUMBERS="$(aws secretsmanager get-secret-value --secret-id "$secret" \
      --query SecretString --output text)" \
      SEED_GATEWAY_URL="https://api.$DOMAIN" SEED_RUNNER=ecs SEED_TF_DIR="$TF" \
      node tools/test-env/seed.mjs

    section "Ready"
    out urls | jq -r 'to_entries[] | "\(.key): \(.value)"'
    echo "Deletes itself at $(out expires_at | jq -r .) (UTC)."
    echo "Test sign-in codes: aws secretsmanager get-secret-value --secret-id $secret --query SecretString --output text"
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
    echo "Usage: $0 up|down|reap|status" >&2
    exit 2
    ;;
esac
