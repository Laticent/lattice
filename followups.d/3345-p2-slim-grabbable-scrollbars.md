---
origin: 3345
priority: P2
recorded: 2026-11-21
area: website
severity: low
swimlane: docs/src/styles/native-widgets.css (the scrollbar rules #3345 added)
deferred: blocked — it rewrites the scrollbar rules #3345 adds, so it waits for #3345 to merge (HARD RULE #17, no stacked PR); the owner chose a follow-up PR on 2026-11-21
source: https://github.com/Laticent/lattice/pull/3345
---
# Slimmer, still-grabbable scrollbars in Chrome and Edge on Windows

why now   — The owner, on Windows after #3345: "windows scrollbars are thinner but I wonder if they can get
            thinner", "as thin as the iPhone scroll bar or whatever is most appropriate to allow the user to
            grab them". `scrollbar-width` has only auto / thin / none, so `thin` is the floor for the
            standard property; Firefox has no finer control at all.
what was measured (Chromium, classic scrollbars) — OS default 15px; `thin` 10px; `::-webkit-scrollbar`
            6px and 4px both work. Since Chromium 121 the standard properties switch `::-webkit-scrollbar`
            off: `thin` + a 6px webkit bar measured 10px, and an inherited `scrollbar-color` alone (no width)
            made it fall back to the 15px default. So the slim bar must turn BOTH standard properties off on
            the elements it styles.
the design (prototyped, not shipped) — look thin, grab wide: an 8px track holding a 3px visible thumb
            (`border: 2.5px solid transparent; background-clip: padding-box`) that widens to 6px and darkens
            on `:hover`, accent on `:active`. No arrow buttons. A drag on it scrolled the pane 0 to 463px.
how       — Chrome/Edge on Windows only: a small boot script flags Windows (`navigator.userAgentData
            .platform`, falling back to the UA string) on `<html>`, and the rule applies under that flag plus
            `@supports selector(::-webkit-scrollbar)`. Never on macOS: styling `::-webkit-scrollbar` there
            swaps the auto-hiding overlay bar for an always-visible one (native-widgets.css's own header).
            Firefox keeps `thin`. Mind the cascade: keep the rules unlayered, as the `*` rule is.
also offered — Mac-style fade when idle for Chrome/Edge on Windows (owner did not pick it yet; ask).
done when — on a Windows runner or the owner's machine, Chrome/Edge show the 3px thumb at rest and a 6px
            one on hover, an inner pane reserves 8px, a drag on the thumb scrolls; macOS keeps overlay bars;
            Firefox unchanged. Evidence at 1440/820/390 (docs-site QUALITY BAR).
