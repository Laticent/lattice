---
origin: 2341
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2341
---
# A Playground tour step over a split slide has no browser test

why now   — #2341 made the Playground split portrait decks live, and `walkUnits` groups a
            split run's pages under one tour step, so a "plan" walk addresses the authored
            slide rather than its cover. No test drives it: every shipped tour is
            landscape, where nothing splits, so the grouping has never run in a browser.
            The first portrait tour would find out.
where     — `docs/src/components/playground/PlaygroundApp.tsx` `walkUnits` / `frameBands`
            (the `byAuthored` flag, passed as `walkRef.current?.kind === 'plan'`);
            `docs/e2e/playground-explore.spec.ts` is the nearest existing spec.
done when — A Playwright spec seeds a `size: portrait` deck with an inventory slide,
            starts a plan walk, and asserts the step for that slide spans every page of
            its run (cover through the last body page) and the next step lands on the
            next authored slide. The spec fails with `byAuthored` forced to false.
evidence  — the spec's pass, plus its failure with the flag forced off (the arm that
            proves it can fail).
verify    — tier 0 gates, because it adds a test and touches no product code.
