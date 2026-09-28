---
origin: 2446
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2446
---

# The export panel's audio switch can stick on and disabled if the cloud key drops mid-panel

why now   — #2446 made NarrationExportOptions re-read availability on `db-model-changed`. If an
            author has audio ON with a cloud voice and the OpenRouter key disconnects while
            Share → Webpage is open, `cloudReady` turns false. With no on-device voice loaded,
            `audioUnavailable` then disables the switch while it is still checked, so the author
            cannot turn audio off, and the bake would refuse. That state predates #2446, which
            only makes it reachable mid-panel. No control inside the Share sheet disconnects a key
            today, so there is no known trigger yet. Found by the #2446 checker (finding 4).
where     — docs/src/components/studio/NarrationExportOptions.tsx: `audioUnavailable` and the
            audio `<Switch disabled=…>`.
done when — a checked audio switch stays operable (it can always be turned OFF), or availability
            dropping clears `value.audio` and says why. A unit case dispatches `db-model-changed`
            with `openRouterReady: false` while audio is on and asserts the author can turn it off.
evidence  — the unit case, and the real panel with a key disconnected in a second tab
            (`db-model-changed` fires in both).
verify    — tier 0 gates, because the change is local to one panel and spends nothing.
