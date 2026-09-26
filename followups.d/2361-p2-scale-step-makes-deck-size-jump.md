---
origin: 2361
priority: P2
recorded: 2026-09-26
---

# A projection-scaled deck changes type size from slide to slide

why now   — #2378 made `scale-*` step a slide down instead of clipping it, and steps the
            chrome with it by design ("chrome included"). On the agentic-practices talk at
            `class: scale-xl`, 45 slides rendered at 1.3x, 11 at 1.15x and 14 at 1x, so
            adjacent slides alternate size and the running header, eyebrow and page dots
            pulse as you click through. The owner saw it at a glance ("really made things
            look off"). The talk was reverted to scale 1 in 2361.
where     — lib/core/scale-fit.js (STEP), lib/base/base.modifiers.css (scale-*),
            engineering/decisions/2026-09-25-font-scale-fit.md, engineering/typography.md §7.
repro     — add `class: scale-xl` to the front matter of
            engineering/decisions/2026-09-24-agentic-practice-audit/agentic-engineering-practices.md
            and render it; the SCALE line lists the stepped pages (e.g. pages 4 and 6 at 1x
            beside 5 and 7 at 1.3x).
done when — the owner has picked a policy and it ships: chrome held at one size across a
            deck, a deck- or section-uniform step, per-slide scale only where asked, or STEP
            removed. A scaled deck then reads as one size to a viewer clicking through.
verify    — render the repro deck at scale-xl, look at consecutive pages, and measure the
            chrome and body sizes page to page.
