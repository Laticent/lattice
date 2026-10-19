---
origin: 2749
priority: P4
recorded: 2026-10-19
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2
---

# `URL_RE` in the CSS safety scanner takes about 10 s on `url(` repeated 50 000 times.

Found by the checker on the stylesheet-gate fix (2026-10-19); the code predates that change, and the new
`findAddressStrings` walk takes 12 ms on the same input.

why now   — `findCssExfil` runs on untrusted package stylesheets and in the Studio's live CSS view, and the file
            already records fixing two pathologies of this kind (9.5 s, 17 s).
where     — lib/core/css-scan.js `URL_RE` and its `matchAll` in `findCssExfil`.
done when — `findCssExfil('url('.repeat(50000))` returns in well under a second, with a timing test beside the
            existing ones, and every shipped sheet's findings are unchanged.
evidence  — the timing before and after.
verify    — self-review with the gates.
