---
origin: 2324
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2324
---
# Check the Compose chip picker's scroll behavior on a real iPhone

why now   — #2324's fix (the picker follows its block when the editor scrolls, and
            hides once the block leaves) was verified in headless Chromium at 1440 and
            390 only. #2289's mobile bugs were first reported from a real iPhone, and
            iOS Safari touch scrolling is the surface nothing here can reach.
where     — docs/src/components/studio/ComposeView.tsx `onChipClick` / `liveChip`;
            docs/src/components/studio/code-controls.tsx `FencePicker` (`anchor`,
            `hideWhenDetached`).
done when — on a real iPhone: Studio, then Compose, then a deck with a code block below
            the fold; tap the block's language chip and scroll. The picker stays on its
            block, then hides once the block leaves the editor. Any defect is fixed, or
            filed with a screen recording.
evidence  — a screen recording or screenshots from the device, attached to the PR or
            issue that closes this item.
verify    — tier 0 gates, because it is a device check of shipped behavior; a fix it
            turns up gets its own tier.
