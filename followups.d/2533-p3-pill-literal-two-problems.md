---
origin: 2533
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2533
---

# `pill-literal` stays silent on a pill with two problems, or a reserved-marker label

why now   — found by the checker on #2533's reconciliation with #2537. `pill-literal` warns when
            quoting the label would make the span a pill (#2537) or when the pill's `icon=` names
            no icon (#2533). A span with BOTH problems, `{A|B, icon=nope}`, gets neither: the slot
            rejects the unquoted label before the icon is read, and the quoted form still fails on
            the icon. `{x, icon=code}` renders as code because `x` is reserved for a state mark, and
            nothing says so (only `pill-not-a-checkbox` covers the bare `{x}`). Not a regression:
            main is silent on both.
where     — lib/authoring/lint-core.js `findLiteralPills` / `pillWouldRenderQuoted`;
            lib/core/inline-pills.js `iconProblem`, `diagnose`.
done when — each span above warns once with the advice that makes it render (quote the label AND
            fix the icon; pick a label that is not a state marker), and no corpus deck gains a
            warning (`lint:deck` over examples/ and test/integration/baseline-decks/ before/after).
evidence  — the before/after `lint:deck` output on a fixture holding the cases.
verify    — tier 1 checker.
