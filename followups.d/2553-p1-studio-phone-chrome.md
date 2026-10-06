---
origin: 2553
priority: P1
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2553
---

# The Studio on a phone: search in one tap, an action row per pane, a 44px floor, lessons that work

why now   — on a 390px phone search is two taps deep (☰ → Search / commands), Theme / Fix all /
            Reshape have no button, and four lessons stop or fall back while one ("Write a slide")
            names a control a phone does not have. Plan: engineering/decisions/2026-10-06-studio-phone-chrome.md.
where     — docs/src/components/studio/StudioShell.tsx (header, pane bar, strip, phone menu), the
            command palette, lessons/{basics,building,polish}.ts + lines.ts (re-record clips).
done when — ☰ opens the palette with the menu rows + Learn as its empty state; Source and Preview
            carry action rows; every phone control has a ≥44px hit area; all 17 lessons let the learner
            do every step at 390px; 1440 and 820 unchanged.
evidence  — tools/screenshot.js @390/820/1440; a tap-target census before/after; the 17-lesson
            phone e2e run.
verify    — tier 1 checker, because the palette, pane bar and strip are shared Studio chrome.
