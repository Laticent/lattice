---
origin: 2513
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2513
---

# One spelling per deck: lint aliases and shortcuts, with an autofix (Segno decision 7)

why now   — Segno decision 7 (engineering/decisions/2026-09-28-segno-unified-inline-notation.md):
            a deck that mixes two spellings of one meaning (`[x]` on ten slides, `{done}` on one;
            `total` and `sum` on one waterfall) should get a warning and an autofix to the
            spelling it uses most. Phase 2 shipped without it; the owner chose to file it, 2026-10-05.
where     — lib/authoring/lint-core.js (HARD RULE #7). Every Segno bind already reports the
            spellings an author used (`spellings` on each bind result, docs/src/lib/segno/schema.ts);
            the work is handing them from each reader (lib/core: inline-pills, inline-sparks,
            state-marks, gantt-pill, state-pill, chart-status, waterfall markers, flowchart style)
            to one lint rule, per deck.
done when — `lint:deck` warns on a deck that writes one meaning two ways, names the spelling it
            uses most, and `--fix` rewrites the minority spans in place; a shortcut is swapped only
            when it is alone in its span (`{done, note=…}` gets the warning without a fix).
evidence  — a fixture deck mixing `[x]`/`{done}` and `total`/`sum`, linted before and after `--fix`.
verify    — tier 1: `npm run lint:deck -- <fixture>` and the unit test for the rule.
