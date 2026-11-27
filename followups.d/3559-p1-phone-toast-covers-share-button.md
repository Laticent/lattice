---
origin: 3559
priority: P1
recorded: 2026-11-27
area: website
severity: low
swimlane: engineering/development.md
deferred: blocked — the owner's call on where the Studio-wide Toaster sits on narrow screens (`docs/src/components/ui/sonner.tsx`, `position="bottom-center"`, shared by every toast in the Studio and the Playground); asked on PR 3559 as decision D1
source: https://github.com/Laticent/lattice/pull/3559
---

# On a phone, a Share failure toast covers the bottom of the Download button it tells the author to press again

why now   — PR 3559 adds "Webpage failed: the step … did not finish within 60 s … Try again", and on a 390×844 phone
            box the toast that carries it overlaps the Share sheet's "Download webpage" button: button y 682–728,
            toast y 716–828 (desktop Chromium emulating the width). A Playwright trial click on the button timed out
            while the toast showed. At 820×900 it overlaps too: the toast (x about 232–588) covers the button's left
            part (x 401–800), cutting its label to "ownload webpage"; a trial click passes there only because the
            button's center is clear. The toast leaves on its own after a few seconds (about 3 s at 820 wide), so the
            author can retry once it goes. Every Share failure toast has had the same placement before this PR.
where     — docs/src/components/ui/sonner.tsx (the one Toaster's `position` and offset), the Share sheet's
            bottom-anchored action rows (WebpageOptionsPanel.tsx and its siblings).
done when — at 390 wide, no toast overlaps the Share sheet's primary button, and the button takes a click while the
            toast shows; the same at 820 and 1440.
evidence  — tools/screenshot.js at 1440, 820 and 390 with a failure toast up, plus an e2e trial click on the button
            while the toast is visible.
verify    — tier 0 plus the screenshots: one shared UI primitive, reversible, no engine or export bytes.
