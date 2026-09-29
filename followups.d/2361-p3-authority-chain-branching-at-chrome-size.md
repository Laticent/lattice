---
origin: 2361
priority: P3
recorded: 2026-09-29
---

# `authority-chain branching` sets its descriptions at the chrome size

why now   — found by the red-team review of the one-reading-size change, not caused by it:
            `authority-chain.styles.css:150` sets the branching variant's descriptions in
            `--fs-meta` (15px at laptop), 341 of the slide's 370 visible characters. They are
            reading text, so they belong at `--fs-body`. The gallery's branching sample already
            clips at laptop on `main`, so moving the size needs the layout to make room first.
where     — lib/components/legal/authority-chain/authority-chain.styles.css (the `branching`
            rules); its manifest's `venueCapacity` once re-measured.
done when — `npm run audit:reading-size -- --only=authority-chain` lists `authority-chain
            branching` at `--fs-body` with no SECOND SIZES entry, and the authority-chain gallery
            renders with no clipped page.
evidence  — the audit line and the gallery's OVERFLOW line, before and after.
verify    — self-review with the gates.
