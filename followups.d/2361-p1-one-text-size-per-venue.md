---
origin: 2361
priority: P1
recorded: 2026-09-29
---

# Components set their own text size; one venue should set one size for all of them

why now   — The owner's rule: a venue picks the type size, and components follow it.
            Today each component picks one of three size roles for its main text:
            `--fs-message` (21pt at laptop), `--fs-body` (16pt) or `--fs-body-compact`
            (13.5pt). One deck therefore shows lists at three sizes on the same venue.
            The agentic-practices talk (PR #2361, `venue: laptop`) shows it:
            `list takeaway` rows at 21pt, cards and comparisons at 16pt, and
            `list-tabular` rows and tables at 13.5pt. #2399 made each component
            keep one size across its modifiers; nobody has yet made components agree
            with each other. Every deck on every venue has the problem, so fixing it
            unblocks the "boardroom" consistency bar for all of them.
where     — The size roles and who uses them: `engineering/typography.md` (the role table
            near line 40 says which components use `--fs-body-compact` and `--fs-message`).
            The venue register: `lib/base/base.registers.docs.md` §`venue:` and
            `lib/core/resolve-venue.js`. Per-component budgets: each
            `lib/components/<bucket>/<name>/<name>.docs.md` "By venue" line, measured by
            `tools/calibrate-capacity.js`. Components that set main text in the
            `--fs-message` role (grep, 2026-09-29): agenda, closing, compare-prose, decision,
            divider, image, inventory, list (the `takeaway` rows via `--list-row-fs`),
            policy-recommendation, premise, pricing, q-and-a, quote, scene, split-panel,
            title, topic, video, big-number. Components in the `--fs-body-compact` role:
            actors, code, compare-code, contact, content, flowchart, glossary, inventory,
            journey, list-tabular, matrix-2x2, matrix-grid, obligation-matrix, pricing,
            roadmap, split-panel, state-chart, table, team-profile, verdict-grid, and every
            plain markdown table.
            Step 1, the audit: for every component, measure the computed size of its main
            text at each venue, and sort the components into "title/hero text" (a
            statement, a big number, a divider title: bigger on purpose) and "reading text"
            (list rows, card bodies, table cells, glossary definitions, code). Step 2, the
            design note: `engineering/decisions/<date>-one-reading-size-per-venue.md` proposing
            one reading size per venue, with any exception (code, dense tables) named and
            justified with a measurement. It changes the meaning of `typography.md` and every
            component's capacity budget, so put the options to the owner in one
            AskUserQuestion round, with the measured capacity cost of each, before editing
            CSS (CLAUDE.md second filter, "a canonical doc's meaning"). Step 3, the fix:
            move every reading-text role to the chosen size, re-run
            `tools/calibrate-capacity.js`, update each "By venue" line and the lint budgets.
done when — At each venue, every component's reading text measures the same computed size
            (a script prints the table: component × venue → px), apart from exceptions the
            design note names and the owner approved. The talk in PR #2361 renders its
            `list takeaway`, `list-tabular`, table and card slides at one size, with an
            empty OVERFLOW line.
evidence  — The measured size table before and after, in the PR body. The six long-running
            galleries and the #2361 talk rendered at laptop and huddle, before and after,
            sent via SendUserFile, plus `tools/pixel-check.js`. A visual sweep per
            `engineering/visual-review.md`, because every component changes.
verify    — tier 2 adversarial trio, because the change touches every component on every
            venue and re-sets the capacity budgets that `lint:deck` and the fit check rely on.
