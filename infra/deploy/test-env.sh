#!/usr/bin/env bash
# Brings the throwaway AWS test environment up, takes it down, or says what is there
# (decision T-43). The runner (CodeBuild project african-market-env, made by the bootstrap)
# runs this; so can you, from the repository root, with Docker for `up`:
#
#   AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh up       # about 20-30 minutes
#   AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh status
#   AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh down     # about 10-15 minutes
#
# `up` deletes itself after TTL_HOURS (default 3): the environment carries a one-time schedule
# that starts the runner with ACTION=down. Running `up` again keeps the first deadline.
#
# Needs terraform, jq, the AWS CLI, and for `up` Docker with buildx, node and pnpm.
set -euo pipefail

action="${1:-${ACTION:-status}}"
TF=infra/terraform/envs/test
DOMAIN="${DOMAIN:-am.amahkudi.dev}"
TTL_HOURS="${TTL_HOURS:-3}"
tf() { terraform -chdir="$TF" "$@"; }
out() { tf output -json "$1"; }
vars=(-var "domain=$DOMAIN" -var "ttl_hours=$TTL_HOURS")

section() { printf '\n== %s\n' "$*"; }

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
      -target=module.platform.module.next -target=aws_scheduler_schedule.teardown

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
    echo "Usage: $0 up|down|status" >&2
    exit 2
    ;;
esac
