---
origin: 2950
priority: P2
recorded: 2026-10-28
area: website
severity: high
swimlane: engineering/decisions/2026-10-21-playground-focus-sync.md §A late scroll event is still the move's echo
deferred: blocked — needs a physical iPad, which no agent sandbox or hosted runner can reach
---

# Run the Playground click test on a physical iPad

why now   — the echo-window fix (#2950) is verified on `webkit-tablet` and in Mobile Safari 26.5 on an iPad Pro
            13-inch simulator (`ios-safari-focus-sync`). A simulator is not a device: touch latency, the real
            scroll pipeline and thermal load are what a physical iPad adds. It is the last unverified surface.
where     — the Playground at `/playground/?view=edit` on the deployed docs, on an iPad held so the page is
            1032 px wide or wider (two panes: editor and preview side by side).
done when — 20 taps on editor lines, alternating between two slides far apart, and none of them moves the
            editor's scroll position; each tap centers its slide in the preview.
evidence  — a screen recording of the 20 taps, or the tap count written down with the iPad model and iPadOS
            version.
verify    — tier 0: the owner's own check on their own device. Emulation and the simulator suite do not
            count (HARD RULE #23).
