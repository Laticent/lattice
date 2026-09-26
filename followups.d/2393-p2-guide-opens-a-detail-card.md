---
origin: 2393
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2393
---

# Should the Guide open a focused mark's detail card? (behind a setting)

why now   — owner (2026-09-26), after #2393 turned the chart hover off while the Guide plays:
            "guide should still highlight and recess but shouldn't open the popup. i'm okay with it
            opening it but this needs a settings. let's talk about it." Today the Guide never opens
            a card; an author's per-mark detail ("Three renewals landed.") is only reachable by
            pausing and hovering.
open      — whether to do it at all, and where the setting lives. Options put to the owner:
              - a deck front-matter key, off by default (recommended: it is the author's call and
                travels with the deck, like `delivery:`);
              - a viewer toggle in Present, next to CC (the watcher decides; most never find it);
              - a preset field (no new key, but it ties tone to a separate choice).
            Cons to weigh: a card that repeats what the narration says hurts comprehension (Mayer's
            redundancy principle); it covers part of the chart while it is explained; it is a second
            thing appearing per moment. So: only for a detail the narration does not read aloud.
            Related: `2393-p2-read-a-detail-with-its-item.md` changes how details are narrated,
            which decides which details are "not read aloud".
where     — docs/src/components/studio/PresentOverlay.tsx (the Guide beat, `guidePlaying`),
            docs/src/playground/chart-interact.js (`reveal`), lib/core/resolve-delivery.mjs or the
            front-matter registers if it becomes a key.
done when — the owner has picked the setting's home, and a focused mark with an unread detail shows
            its card for that moment only, never two at once, pinned by an e2e test.
