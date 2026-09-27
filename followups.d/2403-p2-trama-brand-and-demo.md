---
origin: 2403
priority: P2
recorded: 2026-09-27
---

# Trama's brand mark, its /trama demo page and its Libraries menu entry

why now   — Every other workspace library (Suono, Lente, Vetrina, Cadenza) ships a mark, a
            demo page driven by the real library and a Libraries menu entry. Trama ships only
            its README, so nobody outside the repo can see what it does. The owner chose, on
            2026-09-27, to ship it as a follow-up rather than in #2403, and chose the palette.
where     — engineering/decisions/2026-07-18-sibling-brand-system.md (the family DNA: a 128
            viewBox, the ringed hub with a pale halo, round caps, one accent plus one warm
            accent, an inline dark-mode swap, a Fraunces lockup built like lattice-lockup.svg);
            docs/public/<name>-{mark,mark-min,lockup}.svg; docs/src/pages/lente.astro (the
            storyboard page to follow); nav.mjs `librariesNav`; docs/src/lib/trama/README.md.
done when — - `docs/public/trama-{mark,mark-min,lockup}.svg` on the family DNA. The metaphor is
              the weft: a few right-angled threads woven over and under each other around the
              hub, with one warm thread for the main path. The min mark holds at 16px.
            - Palette (owner's pick): TERRACOTTA, about #a0522d light / #e0916a dark, with a
              gold warm accent. Record the locked table in the brand-system note, as Suono's is.
            - `/trama`: a framework-free storyboard on the real built library. Type list rows
              and watch the layout; flip lr/tb; turn on the wrapping chain; drag a box and watch
              `route()` re-weave the lines; show the quality counters at zero. Favicon is the mark.
            - The Libraries menu entry, and a README link to the page.
evidence  — tools/screenshot.js at 1440 / 820 / 390 in light and dark; the marks rendered at
            128px and 16px; the demo driven in real Chromium (typing, the direction flip, a drag).
verify    — tier 1 checker, because it is a new public page and a brand asset (visual review on
            the real site, per the QUALITY BAR).
