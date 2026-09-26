---
origin: 2361
priority: P2
recorded: 2026-09-26
---

# Give every component a capacity per venue, and keep type one size across modifiers

why now   — #2390 made a deck render at one size and added `venue:`, but only 16 components
            (plus code blocks) have a measured per-venue capacity, and it lives in a hard-coded
            table (`SCALE_CAPACITY`, lib/authoring/lint-core.js ~line 1140) rather than in the
            component. Authors and agents cannot choose a component that fits the room before
            writing, so they find out from the export's `↓ SCALE` line and trim afterwards. The
            agentic-practices talk hit this: at `venue: huddle` it needs 15 pages trimmed, mostly
            five-item lists. Separately, one size per deck only holds if no per-slide modifier
            changes a type role's size, and nobody has checked that. The owner asked for both on
            2026-09-26.
where     — (1) Budgets: `SCALE_CAPACITY` and `CODE_*` budgets in lib/authoring/lint-core.js;
            `capacity` in lib/components/*/*/*.manifest.json (26 of 70 carry one);
            tools/calibrate-capacity.js (the measuring rig); tools/build-component-docs.js
            (renders the "At a projection scale" docs line, present in 17 of 71 docs);
            dist/docs/components.pick.md (the one-line picker). (2) Type size: per-slide
            modifiers in lib/base/base.modifiers.css and base.variants.css, among them
            `claim-hero`, `claim-quiet`, `claim-bleed` and `compact`, plus the dense-cell step
            (`--fs-body-compact`, 13.5pt against the 16pt body) that every table, glossary and
            list-tabular gets. Governing notes: engineering/decisions/2026-09-25-font-scale-fit.md
            (Amendment 2026-09-26) and engineering/typography.md §7.
done when — (1) every component with a countable axis carries a measured capacity for each
            venue (laptop, huddle, conference, hall) in its manifest; `lint:deck` reads it from
            there; the docs and components.pick.md show it. A component with no countable axis
            says so. (2) A written rule, enforced by a check in tools/check-ownership.js, that a
            per-slide modifier may change spacing and chrome but never a type role's size, with
            any exception on a sanctioned allowlist with its reason. The dense-cell step is the
            expected exception; its size per venue is an owner decision.
evidence  — the calibrate-capacity output table per venue; `lint:deck` over the galleries at
            each venue; every gallery rendered at `venue: huddle` with one size throughout (the
            SCALE line); tools/pixel-check.js on the galleries showing no drift at `laptop`.
verify    — tier 1 checker, because this edits the shared lint kernel, every manifest and
            base CSS that all 70 components inherit.
