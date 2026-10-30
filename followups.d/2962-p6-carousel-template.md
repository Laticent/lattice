---
origin: 2962
priority: P6
recorded: 2026-10-29
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §14
deferred: blocked — the packing and fit-whole rules need Fluid's measured split plan (2026-10-27-fluid-layout-library.md P2), which is not built; the presentation half shipped in the PR that rewrote this item
---

# Auto-split becomes a carousel: the packing half

why now   — the owner judged today's auto split bunk (the four-slide test deck split into 25 pages, the repeated title took up to half of each page, words hid under the "next" pills) and set the carousel's rules. The PRESENTATION half is built (§14): the title and eyebrow appear on the cover only, content pages carry no header, footer, repeated title, "(cont.)", pointer pill, rail or page number, the ending page drops the title, and every content page starts on one line. An independent judge scored it about one point above today's split (a six-slide demo deck 3.5 to 4.5, examples/auto-split.md 2.5 to 3.5) and put its ceiling at 5 to 5.5 without the other half. The DENSITY half is not built: a slide that fits whole stays a normal slide, never leave one item alone, pages 60-85% full, never split a paired unit, one type scale per carousel. Each needs a measured decision; today's split is structural (one member a page, `planSlide` in docs/src/lib/fluido/plan.ts), and a measured cut in the CLI alone would make the CLI and the Studio split one deck differently (HARD RULE #1). The judge's estimate with packing and fit-whole: about 8 to 8.5, with 9 needing a judgment of real packed pages (type sized up when two rows fit, an ending page with a real composition). Owner rulings kept for that work: no navigation control on content pages, the key insight keeps its callout styling, keep the prototype's vertical timeline and vertical cycle with the cycle drawing its return to step 1. The social v3 prototype itself lived in a session's .scratch and is gone; its rules are the ones above.
where     — the split plan (docs/src/lib/fluido/plan.ts, lib/core/auto-split.js) as Fluid's P2 builds it, then the envelope (lib/core/split-envelope.js) packing several members a page.
done when — the auto split renders as cover / packed content / ending in the engine on every surface, the four-slide deck and examples/carousel-split.md pass the export probes with 0 clipped, unreadable or lost, and an independent judge, comparing it with today's split, scores it 9 or higher.
evidence  — judged contact sheets of both decks in a light theme, its dark variant and a second theme, at portrait and story; the fit ratchet diff.
verify    — npm run fit:harness -- --sizes square,portrait,story --venues laptop,hall --packs none --edits none --ratchet test/fit/baseline.json
