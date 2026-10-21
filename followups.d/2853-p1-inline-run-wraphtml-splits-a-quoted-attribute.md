---
origin: 2853
priority: P1
recorded: 2026-10-21
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-20-inline-objects-audit.md
source: https://github.com/Laticent/lattice/pull/2853
---

# inline-run's string path can write its span into a quoted attribute value

why now   — the checker on #2853 found it; it predates that PR (from #2831) and the PR neither adds nor widens it.
            `TAG_RE` in lib/core/inline-run.js stops at the first `>`, so a `>` inside a quoted attribute ends the tag
            early. `wrapHtml('<ul><li title="a><img src=x onerror=alert(1)>"><em>e</em> w</li></ul>',[1])` returns
            `<li title="a><span class="lat-run"><img src=x onerror=alert(1)>">…`, and the text that was inside `title`
            becomes a live `<img onerror>`. Plugin fences and spans cannot reach it (inline-run runs before the code-fences
            slot); a code-package slide may, since its slot runs first. Not tested end to end.
where     — lib/core/inline-run.js (TAG_RE and the tag walk), test/unit/core/inline-run.test.js
done when — the tokenizer reads a quoted attribute value as one piece, the repro returns the input unchanged, and a
            seeded fuzz arm covers a `>` inside quotes.
evidence  — the repro before and after; a code-package slide carrying the payload, rendered.
verify    — npm test; the inline-run differential fuzz.
