---
origin: 2376
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# panes are unverified on PPTX, image-set, player, Export-to-Marp and small Studio widths

why now   — the proof was verified on the CLI PDF and the Studio at 1440px only. Export-to-
            Marp cannot render a pane at all (marp-core has no carve); it should degrade to
            the two panes' content, stacked.
where     — lattice-emulator.js (pptx/imageset/player), lib/core/marp-bundle.js, the Studio
            at 820/390px, and the Studio slide strip, which labels a panes slide "text".
done when — each surface renders examples/panes.md legibly (or degrades as stated), with an
            artifact per surface (HARD RULE #23).
evidence  — decision note §4 "Not verified"; PR #2376 card.
verify    — render examples/panes.md to .pptx, .zip, --player and the Marp bundle; drive the
            Studio at 820 and 390.
