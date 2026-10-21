---
origin: 2840
priority: P2
recorded: 2026-10-21
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-playground-focus-sync.md
source: https://github.com/Laticent/lattice/pull/2840
---

# Switching to Explore after editing a slide flickers through four wrong frames, then jumps

why now   — the owner sees flicker when switching to the preview after editing a slide. Measured on a 390 px phone viewport (Chromium, a probe sampling every frame): the old Edit preview shows at scroll 0 (about 80 ms), then a blank frame (about 40 ms), then the new document at slide 1 (about 50 ms), then a hard jump to the caret's slide. 60 slides at 4x CPU throttle: about 900 ms and an instant 8,000 px jump. Desktop is the same plus a reflow of the old preview at the new width.
where     — docs/src/components/playground/PlaygroundApp.tsx: `setViewMode` calls `freshRender()` on every switch (`frameSig` reset forces a full `srcdoc` write); the new document opens at the top and `landWalk` applies the position afterwards. The "open where the old document was" anchor (`anchorRef`, `renderDeck`) reads the OLD document's scroll, which is 0 for a hidden phone preview.
done when — the first frame the reader sees after the switch is the caret's slide, with no blank and no wrong-slide frame and no visible jump; and when the text, palette and mode are unchanged the switch reuses the document instead of rewriting it. Both directions (Explore to Edit too).
evidence  — a frame-by-frame probe (every rAF: pane, readiness, scroll, slide shown) before and after on a phone viewport and on desktop, at 1x and 4x CPU; the timeline above is the baseline. A real-browser spec that fails on the old behavior.
verify    — step 1: seed the anchor from the caret's slide and keep the frame covered (the existing skeleton) until positioned. Step 2, after step 1 is proven: reuse the document when unchanged (the phone's hidden preview was laid out at width 0, so it needs a re-fit; Explore's walk assumes a fresh render). Branch from `main` AFTER #2840 merges: it needs `enterExplore` / `leaveExplore` and the caret slide from #2840 (HARD RULE #17: no stacked PR).
