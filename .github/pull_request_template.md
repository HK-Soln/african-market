## What and why

<!-- Directive task ID(s), e.g. F0-02, and a short summary. For a promotion PR (dev -> stage,
     stage -> main), list what is being promoted instead. -->

## Checklist

- [ ] Title is a conventional commit (`feat(shops): branch service areas`); it becomes the squash commit on `dev`
- [ ] `pnpm affected` is green locally
- [ ] Migration added for any entity change, and applied locally
- [ ] Gateway route changes: OpenAPI and `@am/api-client` regenerated
- [ ] UI strings added to `en`, `ar` and `fr`; Arabic (RTL) screens checked
- [ ] Directive ticked; `docs/DECISIONS.md` updated for any new architectural choice
- [ ] No secrets, tokens or personal data in code, logs or fixtures

## Notes for the reviewer

<!-- Judgement calls, anything blocked, anything that changes money flow or personal-data handling. -->
