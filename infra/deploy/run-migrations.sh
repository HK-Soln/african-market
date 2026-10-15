#!/usr/bin/env bash
# Runs every service's pending migrations as one-off ECS tasks, one service after another, and
# fails if any of them fails. Called by the deploy workflow after the new task definitions are
# registered and before the services roll out, so new code never runs against an old schema.
#
#   infra/deploy/run-migrations.sh <terraform env dir>      e.g. infra/terraform/envs/staging
#
# Needs AWS credentials, jq, and `terraform init` already run in that folder.
set -euo pipefail

dir="$1"
out() { terraform -chdir="$dir" output -json "$1"; }

cluster="$(out cluster_name | jq -r .)"
migration="$(out migration)"
subnets="$(jq -r '.subnets | join(",")' <<<"$migration")"

for service in $(jq -r '.task_families | keys[]' <<<"$migration"); do
  family="$(jq -r --arg s "$service" '.task_families[$s]' <<<"$migration")"
  groups="$(jq -r --arg s "$service" '.security_groups[$s] | join(",")' <<<"$migration")"
  echo "::group::Migrations: $service ($family)"

  task="$(aws ecs run-task \
    --cluster "$cluster" \
    --task-definition "$family" \
    --launch-type FARGATE \
    --count 1 \
    --started-by "deploy-migrations" \
    --network-configuration "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$groups],assignPublicIp=DISABLED}" \
    --overrides "{\"containerOverrides\":[{\"name\":\"$service\",\"command\":[\"migrate\"]}]}" \
    --query 'tasks[0].taskArn' --output text)"
  echo "Task: $task"

  aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task"
  result="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task" \
    --query 'tasks[0].{exit: containers[0].exitCode, reason: stoppedReason}' --output json)"
  exit_code="$(jq -r '.exit // "none"' <<<"$result")"
  echo "Exit code: $exit_code ($(jq -r .reason <<<"$result"))"
  echo "::endgroup::"

  if [ "$exit_code" != "0" ]; then
    echo "::error::Migrations failed for $service; nothing was rolled out. See the task's logs in CloudWatch (/ecs/$cluster/$service)."
    exit 1
  fi
done
