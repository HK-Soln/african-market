# Cloud test environment (GitHub Codespaces)

Decision T-39: when a machine cannot run Docker, the stack runs in a GitHub codespace instead.
It is private to the person who creates it, holds **made-up data only** (it is not in the UAE),
and is deleted after each test unless someone asks to keep it.

The codespace is a 4-core, 16 GB machine with Docker. It runs the same `docker compose` stack as
`pnpm stack:up`, limited to the Phase 0-1 apps, and its ports are forwarded to `localhost` on your
machine, so the apps work exactly as they do locally.

## Use it

```bash
# 1. Create one (from any branch that has this folder), stopping after 30 idle minutes and
#    deleted a day after it stops.
gh codespace create -R HK-Soln/african-market -b <branch> -m standardLinux32gb \
  --idle-timeout 30m --retention-period 24h

# 2. Build, start and seed it (the first build takes a while).
gh codespace ssh -c <name> -- bash tools/test-env/up.sh

# 3. Open the apps on localhost (leave this running).
gh codespace ports forward -c <name> 3000:3000 3001:3001 3002:3002 4000:4000 9000:9000 8025:8025

# 4. Delete it when done.
gh codespace delete -c <name> --force
```

`gh codespace list` shows the names. Creating and managing codespaces needs the `codespace`
scope: `gh auth refresh -h github.com -s codespace`.

## What the seed makes

`tools/test-env/seed.mjs` works through the gateway the way people do:

- Four verified shops: two in Dubai, one in Sharjah, one in Abu Dhabi. Each has a branch, hours
  and products. One is closed on Sundays and one is a service.
- Search is opened in Dubai and Sharjah. Abu Dhabi stays closed, to show that state.
- Sign in with the fixed codes in `devcontainer.json` (`OTP_TEST_NUMBERS`):

| Who             | Phone         | Code   |
| --------------- | ------------- | ------ |
| Seller          | +971500000010 | 314159 |
| Admin           | +971500000011 | 271828 |
| End-to-end test | +971500000001 | 135790 |

Other numbers get their code in the identity log: `docker compose logs identity`. Emails are in
Mailpit at http://localhost:8025.

## Settings

- **Google Maps:** add `NEXT_PUBLIC_GOOGLE_MAPS_KEY` as a Codespaces secret (GitHub → Settings →
  Codespaces → Secrets, for this repository). Allow `localhost` on the key. Without it, the apps
  show lists and emirates only.
- **Cost:** codespaces of an organisation on GitHub's free plan are paid by the person who
  creates them, from their monthly free hours (about 30 hours of this machine). Keep the
  Codespaces spending limit at $0 so it can never charge.
