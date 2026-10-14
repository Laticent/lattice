---
origin: 2651
priority: P2
recorded: 2026-10-14
area: engine
severity: low
swimlane: engineering/decisions/2026-09-27-plugin-system.md
---

# Decide whether a zip plugin may contribute inline syntax such as avatars' `!{Name}`

why now   — phase E's door is a fence, which is block syntax. Inline syntax (`!{Ada Okafor}`) is a
            parser rule in markdown-it, not a fence, so a zip plugin cannot contribute one. Whether to
            add an "inline door" changes the plugin contract LPM 1.0 freezes in phase G, so it is the
            owner's call, with the option put first.
where     — `engineering/decisions/2026-09-27-plugin-system.md` (placeholder entry, 2026-10-13),
            `spec/LPM.md`, `lib/integrations/markdown-it/plugins.js`.
done when — the owner has chosen build or not-build, with the cost and the trust story (an inline rule runs
            on every line of the deck, unlike a fence) written into the decision note; if build, a new
            followup carries the work.
evidence  — the owner's answer to one `AskUserQuestion` round.
verify    — n/a (a decision).
