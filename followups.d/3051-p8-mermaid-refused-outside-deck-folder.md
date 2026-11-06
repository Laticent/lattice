---
origin: 3051
priority: P8
recorded: 2026-11-06
area: engine
severity: low
swimlane: engineering/mermaid.md
deferred: off-path — pre-existing on main; this PR's Mermaid bump neither caused nor changed it
---

# Rendering a deck to another folder warns that the vendored Mermaid "resolves outside the deck folder"

why now   — `node lattice.js lib/components/diagram/diagram/diagram.gallery.md <out>.pdf` with `<out>` outside the deck's folder prints `⚠ refused file:///…/lib/plugins/mermaid/vendor/mermaid.min.js: it resolves outside the deck folder`. The path is the vendored copy resolved relative to the OUTPUT directory, not the repo, so the warning names a file that does not exist there. Seen on main at dd1fb87 and on PR #3051 alike; the PDF's diagrams still render.
where     — the local-asset confinement check that emits "resolves outside the deck folder", and whatever hands it the vendored Mermaid path relative to the output.
done when — rendering a Mermaid deck to an output in another folder prints no "refused" line for the engine's own vendored file, and a test pins it.
evidence  — the command above, before and after.
verify    — tier 0 gates; the export-confine suite.
