---
origin: 2424
priority: P2
recorded: 2026-09-28
---

# The Studio's "Fix all" test races the fixable-issue count

```text
  P2 · [no ticket] Make the Studio "Fix all" test wait for the button, not just the count.
       why now   — `docs/src/components/studio/studio.controls.test.tsx` ("Fix all" clears
                   an unknown component flagged inline) waits for "N issue" with findByText,
                   then clicks `getAllByRole('button', { name: 'Fix all' })`, a one-shot
                   query. The Architect banner's button (StudioShell.tsx:3913) renders only
                   once `fixableIssues > 0`, which the editor computes separately from the
                   issue count, so there is a window where the count shows and the button
                   does not. Found on #2424 (which does not touch the Studio): the whole
                   file run twice on one commit passed once and failed once; the test alone
                   passed 3 of 3. It will fail an unrelated PR's vitest run now and then.
       where     — docs/src/components/studio/studio.controls.test.tsx ~423.
       done when — the test awaits the button (findAllByRole), and the whole file passes
                   10 of 10 runs in a row under the full vitest suite's load.
       evidence  — the 10-run tally before and after.
       verify    — tier 1.
```
