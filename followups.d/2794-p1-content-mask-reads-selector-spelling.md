---
origin: 2794
priority: P1
recorded: 2026-10-19
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §7
source: https://github.com/Laticent/lattice/pull/2794
---

# The engine's content mask reads the selector's spelling, so unminified CSS is masked differently from minified

why now   — found while closing 2780-p8. `isPaginationTarget` (lib/engine/css.js) decides whether a rule targets a slide's OWN `::after` with `^section(?![\w-])[^\s>+~]*::?after$`. On the minified text the default render ships, `:is(.chart-frame,.big-number)` has no space and the mask fires (`content: none` is commented out). On the source spelling, `:is(.chart-frame, .big-number)` has one, the regex reads it as a descendant combinator, and `content: none` stays live. So `lattice deck.md -c <any unminified layout CSS>` renders `claim.md` differently from the default, with no module missing. A caller's own layout CSS is the case that matters.
where     — `PAGINATION_AFTER_RE` and `isPaginationTarget` in lib/engine/css.js; repro in the note §7 and test/unit/tools/style-subset-default-path.test.js (the arm that feeds unminified modules and finds 1,024 foreign rules).
done when — the mask depends on the selector's meaning, not its whitespace: normalize whitespace inside functional pseudo-classes before the test (so minified output does not change a byte), and a test shows the minified and source spellings of `claim.md`'s layout CSS mask the same rules. This changes the bytes of exports that use an unminified `-c` file, so it needs the owner's dark and light sign-off (QUALITY BAR, export changes).
evidence  — the two renders' masked-rule sets, before and after.
verify    — tier 1 checker; export sign-off.
