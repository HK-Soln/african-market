---
description: Implement the next unchecked task from the current phase directive
---

1. Read `CLAUDE.md`, `docs/directives/README.md` and `docs/DECISIONS.md`.
2. Find the current phase: the lowest-numbered file in `docs/directives/` that still has `- [ ]` tasks.
3. Pick the first unchecked task whose dependencies are ticked (or the task named here: $ARGUMENTS).
4. Read the sections of `docs/PLAN.md` it references and the README of every service it touches.
5. Briefly state your plan (files, entities, patterns, events, routes, screens), then implement it
   completely following CLAUDE.md conventions, including tests and en/ar/fr strings.
6. Run the relevant checks (`pnpm affected` or nx targets), build and run migrations locally, fix until green.
7. Tick the task in the directive with a `> Note:` for judgement calls, update DECISIONS and service
   READMEs if needed, and commit with a conventional commit message on a feature branch cut from
   `dev` (`<type>/<short-name>`). Push the branch and open a pull request into `dev`; never push
   `dev`, `stage` or `main`.
8. Report what was done, what was verified, and anything blocked.
