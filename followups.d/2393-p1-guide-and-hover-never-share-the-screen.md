---
origin: 2393
priority: P1
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2393
---

# While the Guide plays, the chart hover must not override it

why now   — measured in the built Studio (2026-09-26): with the Guide playing on the bar slide and
            focused on LATAM, moving the mouse over EMEA dimmed the narrated LATAM bar, raised
            EMEA and opened EMEA's detail card over the playing slide. Present mounts the hover
            layer (`ChartDetailLayer enabled={open}`) whether or not the Guide plays, and the
            hover's inline `opacity` beats the Guide's `.lat-guide-dim` class. Owner (2026-09-26):
            "these are two different features. hover is for interaction. guide should still
            highlight and recess but shouldn't open the popup."
where     — docs/src/components/studio/PresentOverlay.tsx (gate `ChartDetailLayer` and its number
            keys); docs/src/playground/chart-interact.js.
proposal  — while the Guide plays, the hover and its number keys are off; on pause the Guide lifts
            its focus and the hover comes back; on play the Guide takes over at the next sentence.
            One owner of emphasis at a time. NOT yet agreed with the owner: confirm first.
also open — the owner is open to the Guide itself opening a focused mark's detail card, behind a
            setting. Recommended: a deck front-matter key, off by default, and only for a detail
            the narration does not already read aloud (Mayer's redundancy principle). Where the
            setting lives (deck key, viewer toggle, or preset field) is the owner's call.
done when — hovering a chart during playback changes nothing on the slide; pausing hands the
            chart to the pointer; an e2e test pins both.
evidence  — the same probe (Guide on LATAM, pointer on EMEA) showing LATAM stays focused and no
            card opens, and the paused case showing the card.
