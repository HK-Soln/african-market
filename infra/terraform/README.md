# Terraform (AWS me-central-1)

Empty until Phase 0 task **F0-13** (see `docs/directives/00-foundations.md`).

Target layout:

```
infra/terraform/
  modules/  network/ ecr/ ecs-service/ rds-postgis/ redis/ rabbitmq/ s3-cdn/ secrets/ ses/
  envs/     staging/ production/
```

Rules: region `me-central-1` for all personal data; remote state in S3 with locking; no secrets in
`.tfvars` committed to git; CI deploys with GitHub OIDC, not access keys.
