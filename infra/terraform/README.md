# Terraform (AWS me-central-1)

Everything the apps run on in AWS, in the UAE region: **staging** and **production**, each in its
own AWS account, both calling the same `platform` module with their own sizes.

**Not applied yet.** The code validates offline (`terraform validate`, a CI job), but nothing has
been planned against an AWS account. That needs credentials and is the first step below.

```
infra/terraform/
  bootstrap/         per account, applied once by a person: the state bucket, and the role
                     GitHub Actions deploys with (OIDC, no stored keys)
  envs/staging/      sizes and names, then `module "platform"`
  envs/production/   the same, bigger and protected
  modules/
    platform/        one whole environment, wired together (the diagram is at the top of main.tf)
    network/         VPC over 3 zones: public, private (tasks) and database subnets; NAT; S3 endpoint
    ecr/             a container repository per app, immutable tags, scan on push
    ecs-cluster/     Fargate cluster, Cloud Map namespace, task execution role
    ecs-service/     one app: task definition, service, logs, security group, ALB rule, Cloud Map name
    alb/             public load balancer, HTTPS (ACM certificate), HTTP → HTTPS
    rds-postgis/     PostgreSQL 16, encrypted, TLS only, backups and point-in-time recovery
    redis/           ElastiCache Redis with TLS and an auth token
    rabbitmq/        Amazon MQ for RabbitMQ, private, AMQPS
    s3-media/        public media bucket behind CloudFront; private, KMS-encrypted KYC bucket
    secrets/         one Secrets Manager secret per environment variable
    ses/             SES domain identity with DKIM, MAIL FROM and DMARC; SMTP credentials (optional)
    schedule/        working hours: apps and database on and off (staging)
```

## Test environments (now)

AWS's UAE region is unavailable for now, so infrastructure is tested in **throwaway
environments** (decision T-43): up for a session, then gone. Made-up data only.

- `envs/test`: the whole platform at the smallest sizes in `eu-north-1`, at
  `https://am.amahkudi.dev` (web), `api.`, `seller.` and `admin.am.amahkudi.dev`. It deletes
  itself **3 hours** after it was created: a one-time EventBridge schedule starts the runner with
  `ACTION=down`.
- `bootstrap` (applied once, kept): the state bucket, the $10/month budget and its email alerts,
  the `am.amahkudi.dev` zone (delegated from Vercel with four NS records), and the runner: the
  CodeBuild project `african-market-env`, which checks out `dev` (or `GIT_REF`) and runs
  `infra/deploy/test-env.sh`.
- About $1 per 3-hour session; about 20-30 minutes up (most of it building images), 10-15 down.

```bash
# start the runner (or run the script yourself: AWS_PROFILE=aws-toolkit bash infra/deploy/test-env.sh up)
aws codebuild start-build --profile aws-toolkit --project-name african-market-env   --environment-variables-override name=ACTION,value=up      # or down, status; name=GIT_REF,value=<branch>
```

Sign in with the test numbers: `+971500000010` is the seeded seller, `+971500000011` the admin.
Their codes are generated per environment:
`aws secretsmanager get-secret-value --profile aws-toolkit --secret-id african-market/test/OTP_TEST_NUMBERS --query SecretString --output text`.

Why CodeBuild and not GitHub Actions: projects in AWS's new experience may not create identity
providers, so GitHub cannot sign in without stored keys (the bootstrap's `github_oidc` stays
off). The staging and production setup below is for an account where it can.

## The environments

| Host              | Goes to                      |
| ----------------- | ---------------------------- |
| `<domain>`        | web (the customer app)       |
| `seller.<domain>` | seller                       |
| `admin.<domain>`  | admin                        |
| `api.<domain>`    | gateway (`/api/v1`, `/docs`) |

- One load balancer routes by host name. Every task runs in a private subnet with no public IP.
- The gateway reaches services over TCP at `<service>.<environment>.am.internal` (Cloud Map). The
  Next apps call the gateway from the server the same way; the browser uses `api.<domain>`.
- **Only the current phase runs.** `current_phase = 0` runs the gateway, identity and the three Next
  apps. Raising it starts the next phase's services (the same list as `SERVICES` in
  `libs/contracts/src/services.ts`). Every app has its ECR repository from the start.
- Postgres, Redis and RabbitMQ accept connections only from the backend tasks' security group, and
  sit in subnets with no route to the internet.

|                     | staging                                   | production                      |
| ------------------- | ----------------------------------------- | ------------------------------- |
| Domain              | `staging.africanmarket.ae` (expected)     | `africanmarket.ae` (expected)   |
| Postgres            | `db.t4g.micro`, single zone               | `db.t4g.medium`, Multi-AZ       |
| NAT gateways        | one                                       | one per zone                    |
| Redis               | one node                                  | primary and replica, failover   |
| RabbitMQ            | one `mq.t3.micro`                         | three-node cluster across zones |
| Tasks per app       | one                                       | two (admin one)                 |
| Running             | **08:00-20:00 Dubai time, Monday-Friday** | always                          |
| Test phone numbers  | two (for the smoke tests)                 | none (identity refuses them)    |
| Deletion protection | off, so it can be rebuilt                 | on, with final snapshots        |

Decided 2026-10-16: Multi-AZ in production only, and staging only in working hours.

### Working hours (staging)

EventBridge Scheduler, inside AWS, so it works whether or not anyone is around:

- **07:45** the database starts; **08:00** every app gets its task back.
- **20:00** every app goes to 0 tasks; **20:05** the database stops.
- Monday to Friday. The UAE weekend (Saturday, Sunday) stays off.

That stops Fargate and RDS, the larger part of staging's bill. The load balancer, NAT gateway,
Redis and Amazon MQ cannot be paused and keep running. A deploy outside the hours starts the
database for its migrations, deploys, and skips the smoke tests (there are no tasks to test).
To use staging outside the hours, run the **Staging on / off** workflow from the `stage` branch;
the schedule takes over again at its next time.

## Secrets

Each variable is its own secret, `african-market/<environment>/<NAME>`, injected into the tasks
by ECS.

| Secret                                      | Value                                                 |
| ------------------------------------------- | ----------------------------------------------------- |
| `JWT_ACCESS_SECRET`, `OTP_HMAC_SECRET`      | generated by Terraform (64 random characters)         |
| `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL` | built from what Terraform created, with its passwords |
| `SMTP_URL`                                  | SES SMTP credentials, or set by hand (see Email)      |
| `OTP_TEST_NUMBERS` (staging)                | the test numbers and their generated codes            |
| anything in `manual_secrets`                | a placeholder; set the real value by hand (below)     |

The generated passwords are in the Terraform state, which is why the state bucket is encrypted,
private, versioned and TLS-only. Nothing secret is in this folder or in `terraform.tfvars`.

Set a manual secret:

```bash
aws secretsmanager put-secret-value --region me-central-1 \
  --secret-id african-market/staging/<NAME> --secret-string '<value>'
```

then restart the service (`aws ecs update-service --force-new-deployment ...`) so it reads it.

### Test phone numbers (staging)

`+971500000001` and `+971500000002` sign in with a fixed code that is never sent (identity's
`OTP_TEST_NUMBERS`). Terraform generates the codes. The smoke tests read the same secret after
each deploy, so the codes are never copied anywhere. Everything else about the code is real: five
minutes, five tries, used once, the rate limits. Identity refuses to start with test numbers in
production. To sign in by hand on staging with one, read the code with
`aws secretsmanager get-secret-value --secret-id african-market/staging/OTP_TEST_NUMBERS`.

## Deploys

`.github/workflows/deploy.yml`: a push to `stage` deploys to staging, a push to `main` to
production after your approval in GitHub. Each deploy:

1. builds and pushes every current-phase image, tagged with the commit (`infra/docker/docker-bake.hcl`);
2. registers the new task definitions (`terraform apply -target=...task_definition`);
3. runs every service's migrations as one-off tasks (`infra/deploy/run-migrations.sh`), and stops
   there if one fails, with the old version still serving;
4. `terraform apply`: the services roll out, and one that does not get healthy rolls back on its own;
5. waits until every service is stable;
6. staging only: the `@smoke` end-to-end tests (sign in with a test number, English and Arabic)
   against the real site.

An environment's deploy is skipped, with a notice, until its role exists (step 5 below).

## Bootstrap (first time, per account, needs AWS credentials)

You need the AWS account with administrator access for the first run, the AWS CLI signed in to
it (`aws sso login` or `aws configure`), Terraform 1.10 or newer, and the domain.

1. **State bucket and deploy role.** Bucket names are global: if the default is taken, choose
   another and use it in `envs/<env>/backend.tfbackend` too.

   ```bash
   cd infra/terraform/bootstrap
   terraform init
   terraform apply                      # staging account (defaults)
   # production account, from a copy of this folder or a fresh checkout:
   # terraform apply -var deploy_environment=production \
   #   -var state_bucket=african-market-production-terraform-state
   ```

   Keep the `terraform.tfstate` this writes somewhere safe (a password manager is fine). It only
   describes the bucket and the role.

2. **Settings.** `cp envs/staging/terraform.tfvars.example envs/staging/terraform.tfvars` and set
   `domain`, plus `route53_zone_id` if the domain's DNS is in Route 53.

3. **Plan.** Read it before applying.

   ```bash
   cd ../envs/staging
   terraform init -backend-config=backend.tfbackend
   terraform plan -out staging.tfplan
   ```

4. **First apply, in two passes.** The services need their images, and the images go into the
   repositories this creates.

   From the repository root:

   ```bash
   TF=infra/terraform/envs/staging
   terraform -chdir=$TF apply -target=module.platform.module.ecr
   export REGISTRY=$(terraform -chdir=$TF output -json ecr_repositories | jq -r .gateway | sed 's#/gateway$##')
   aws ecr get-login-password --region me-central-1 \
     | docker login --username AWS --password-stdin "${REGISTRY%%/*}"
   TAG=$(git rev-parse HEAD) \
     NEXT_PUBLIC_GATEWAY_URL=https://api.<domain> NEXT_PUBLIC_WEB_URL=https://<domain> \
     docker buildx bake -f infra/docker/docker-bake.hcl --push
   terraform -chdir=$TF apply -var image_tag=$(git rev-parse HEAD)
   bash infra/deploy/run-migrations.sh $TF
   ```

   **DNS outside Route 53:** while the second apply waits for the certificate, add the records from
   `terraform output dns_records` (certificate and email), and point the four host names at
   `terraform output load_balancer_dns_name` with CNAME records.

5. **Hand over to GitHub.** In the repository's Settings → Secrets and variables → Actions →
   Variables, add:

   | Variable                                                                     | Value                                                         |
   | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
   | `AWS_STAGING_ROLE_ARN`                                                       | `terraform output deploy_role_arn` from the staging bootstrap |
   | `STAGING_DOMAIN`                                                             | e.g. `staging.africanmarket.ae`                               |
   | `STAGING_ROUTE53_ZONE_ID`                                                    | only if DNS is in Route 53                                    |
   | `AWS_PRODUCTION_ROLE_ARN`, `PRODUCTION_DOMAIN`, `PRODUCTION_ROUTE53_ZONE_ID` | the same, for production                                      |

   Then run `infra/github/apply-rulesets.sh` once, if it has not been run since F0-14: it creates
   the `staging` and `production` environments (production needs your approval for every deploy).
   From then on, merging into `stage` deploys staging.

6. **Email.** With SES, a new account is in the sandbox and only sends to verified addresses.
   Request production access in the SES console (Account dashboard → Request production access)
   before real people sign up by email. With another provider, see Email below.

## Email

Identity sends email over SMTP through its `EmailProvider` interface, so the provider is a setting,
not code. `email_provider` picks how `SMTP_URL` is made:

- `ses` (default): Terraform creates the SES domain identity and SMTP credentials and fills the
  secret.
- `smtp`: any provider with an SMTP endpoint, such as Resend or Postmark. Terraform creates nothing
  for email; verify the domain in the provider's dashboard (it lists the DNS records), then set the
  secret by hand:

  ```bash
  aws secretsmanager put-secret-value --region me-central-1 \
    --secret-id african-market/staging/SMTP_URL \
    --secret-string 'smtps://resend:<api key>@smtp.resend.com:465'
  ```

Before choosing a provider outside AWS, check where it stores data: recipients' email addresses are
personal data, and product rule 8 keeps personal data in the UAE.

## Seller verification (Didit)

The shops service sends sellers to Didit's hosted page (decision T-28). Before the first deploy:

- Set `didit_workflow_id` in `terraform.tfvars`.
- Put the API key and the webhook secret in Secrets Manager (Terraform creates them empty):
  `african-market/<env>/DIDIT_API_KEY` and `.../DIDIT_API_SECRET`. Only the shops service gets them.
- In Didit Console, point the webhook at `https://api.<domain>/api/v1/webhooks/didit`.

## Traces and error reports

- **Traces** (on by default, `tracing`): each backend task runs the AWS Distro for OpenTelemetry
  collector next to the app. The app sends spans to it on `localhost:4318`; it sends them to X-Ray
  in the same region, so traces stay in the UAE with the rest of the data. Look at them in the
  CloudWatch console, X-Ray traces, or search the logs for a `traceId` (also the `x-request-id`
  header of every gateway response).
- **Error reports** (Sentry) are off until `sentry_dsn_backend` / `sentry_dsn_frontend` are set in
  `terraform.tfvars`. Sentry stores data in the US or the EU, not the UAE, so turning it on is the
  owner's decision (DECISIONS T-22). The apps send no user fields, cookies, bodies or query strings.
  The frontend DSN is compiled into the Next images, so changing it needs a deploy.

## Known gaps

- **Phone codes for real people on staging.** Identity's real SMS/WhatsApp provider is still a stub
  that answers `SMS_PROVIDER_NOT_CONFIGURED`; only the test numbers can sign in by phone until the
  WhatsApp provider (P-09) is built. Its credentials will be `manual_secrets`.
- **With SES, the SMTP credentials are an IAM access key**, scoped to sending from the domain.
- **The deploy role is an administrator** in its account, because it applies Terraform. It is fenced
  by the GitHub environment (only `stage` or `main`, production only after approval) and by
  separate accounts.
- **Production images are built from `main`**, not copied from staging: the backend images are the
  same commits rebuilt; the Next images must be rebuilt anyway, since each environment's public
  URLs are compiled in.
- **Media domain.** Public media is served from the `*.cloudfront.net` address. A custom name needs a
  certificate in us-east-1 and can come later. CloudFront caches public shop images at edge
  locations outside the UAE; personal and KYC files are never in that bucket.
- **X-Ray in me-central-1** is assumed, not yet seen working: the collector configuration was
  run locally (v0.49.0), the AWS side waits for the account. If it is missing there, set
  `tracing = false` (spans are still made and their ids logged) until it is.
- **ARM.** Tasks run on x86 because CI builds x86 images. Graviton (ARM64) is cheaper; it needs
  multi-architecture builds.

## Social sign-in (F1-09)

Off until it is set up. To switch it on in an environment:

- **Google:** create an OAuth client (Google Cloud console > APIs & Services > Credentials, type
  "Web application") with the web and seller origins as authorised JavaScript origins, and set
  `google_client_ids = ["<client id>"]`.
- **Facebook:** create an app with Facebook Login (Meta for Developers), add the web and seller
  domains, set `facebook_app_id = "<app id>"`, and put the app secret in Secrets Manager as
  `african-market/<environment>/FACEBOOK_APP_SECRET` (only identity can read it).
