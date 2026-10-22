#!/usr/bin/env bash
# Runs one command in a service's image as a one-off ECS task and waits for it, failing if the
# command fails. The task gets the service's settings and secrets, like migrations do.
#
#   infra/deploy/run-once.sh <terraform env dir> <service> <command...>
#   e.g. infra/deploy/run-once.sh infra/terraform/envs/test identity node dist/scripts/grant-role.js +971500000011 admin
#
# Needs AWS credentials, jq, and `terraform init` already run in that folder.
set -euo pipefail

dir="$1"
service="$2"
shift 2
out() { terraform -chdir="$dir" output -json "$1"; }

cluster="$(out cluster_name | jq -r .)"
migration="$(out migration)"
subnets="$(jq -r '.subnets | join(",")' <<<"$migration")"
family="$(jq -r --arg s "$service" '.task_families[$s]' <<<"$migration")"
groups="$(jq -r --arg s "$service" '.security_groups[$s] | join(",")' <<<"$migration")"
command="$(jq -cn '$ARGS.positional' --args "$@")"

task="$(aws ecs run-task \
  --cluster "$cluster" \
  --task-definition "$family" \
  --launch-type FARGATE \
  --count 1 \
  --started-by "run-once" \
  --network-configuration "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$groups],assignPublicIp=DISABLED}" \
  --overrides "{\"containerOverrides\":[{\"name\":\"$service\",\"command\":$command}]}" \
  --query 'tasks[0].taskArn' --output text)"
echo "Task: $task ($service: $*)"

aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task"
exit_code="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task" \
  --query 'tasks[0].containers[0].exitCode' --output text)"
echo "Exit code: $exit_code"
[ "$exit_code" = "0" ]
