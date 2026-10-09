# Directives

Phase-by-phase implementation instructions for Claude Code. Each file is a checklist of tasks with
acceptance criteria. Work through them in order; each phase ends at a **gate** that must be true
before the next phase starts.

| File                                       | Phase             | Outcome                                                                                            | Gate to exit                                                     |
| ------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [00-foundations.md](00-foundations.md)     | 0                 | Sign-up and sign-in in English and Arabic on staging, CI/CD, infra as code                         | Sign-up works in English and Arabic on staging                   |
| [01-discovery-mvp.md](01-discovery-mvp.md) | 1 (public launch) | Shops, branches, catalogue, map search, WhatsApp/call/email, seller onboarding, admin verification | Verified shops in an emirate before search opens there           |
| [02-engagement.md](02-engagement.md)       | 2                 | In-app chat, notifications, favourites, staff, reviews, French, Boosts                             | Trade licence, bank account, Stripe Connect confirmed in writing |
| [03-commerce.md](03-commerce.md)           | 3                 | Single-shop cart, Stripe Connect direct charges, COD, orders, refunds, payouts mirror              | First paid orders settled and paid out correctly                 |
| [04-growth.md](04-growth.md)               | 4                 | Pro plan, coupons, bookings, BNPL, WhatsApp templates, UAE Pass, delivery line                     | n/a                                                              |

## How to use these with Claude Code

Start a session at the repo root (Claude Code reads `CLAUDE.md` automatically), then for example:

```text
/next-task
```

or in plain words:

```text
Read CLAUDE.md and docs/directives/00-foundations.md. Implement task F0-02 completely,
run the checks, tick it in the directive and commit.
```

Larger chunks work too ("implement F1-01 to F1-04"), but one task per commit keeps reviews easy.

## Task format

```
- [ ] **F1-03 Branch service areas** (depends on F1-02)
  What to build, where, and the acceptance criteria.
```

- IDs: `F<phase>-<nn>`. Dependencies are explicit; tasks without one can run in parallel.
- When done: change `[ ]` to `[x]`, and add an indented `> Note:` line for any judgement call.
- If a task is blocked on something outside the code (an account, a contract, a key), mark it
  `[~]` with a `> Blocked:` note and move to the next task.

## Definition of done (every task)

1. Code, migration, contracts, gateway route, regenerated `@am/api-client`, UI strings in en/ar/fr.
2. Tests: unit for logic, integration against PostGIS for queries, e2e when part of a core journey.
3. `pnpm affected` green; migration applied locally; Arabic screens checked.
4. Service README updated if the service's owned tables, patterns or events changed.
5. Directive ticked; DECISIONS updated for any new architectural choice.
