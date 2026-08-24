---
status: shipped
summary: #1804 landed the #1527 export-cascade flip and left one defect behind, which this closes. Letting a palette's real sequential ramp paint on the export path exposed that `word-cloud spectrum`'s quiet tier is not always large text: `sizeFromWeight` is lerp(14, 76, ((w-1)/4)**1.35) and the tier covers normalized weight [1.5, 2.5), so any weight in [1.5, 1.588) renders it BELOW the 18.66px large-text threshold — ordinary body text owing the full 4.5:1. `--seq-400` cannot pay that by construction: it is color-mix(78% anchor, 22% pole-low), a fifth of the way to the canvas, and it measured 3.17:1 at 18.2px/500 on concrete with six words of documented markup. Not a house-rule dispute — 13.7pt regular is large text under no reading of WCAG. The ramp now reads `--seq-900/700/600/500`, floor on the palette's own contrast-gated anchor; worst case 5.35:1 across all 32 palettes in both modes, measured on the tree it lands on. TWO GATES CERTIFIED IT: `composed-contrast` scored `word-cloud/seq-*` at `min: 3` (a survivor of the large-text allowance #1744 deleted) so 3.17 read as a pass, and the rendered-contrast tier gates three surfaces that all carry the DEFAULT `word-cloud`, so its flat 4.5 floor had never scored a single `--seq-*` run on any palette. The gate's own "what this does not cover" list enumerates ungated COMPONENTS and has no notion of an ungated VARIANT, which is exactly the shape of this hole. Both closed: the bar moves to 4.5 and a fourth surface renders the spectrum deck. The demo deck `examples/spectrum-ramp-floor.md` scores 6 runs below AA on main and 0 here, same tool.
---

# The quiet end of a sequential ramp is still text

**2026-08-24 · closes the gap #1804 left in #1527**

**Area:** `lib/components/chart/word-cloud/word-cloud.transform.js`,
`tools/composed-contrast.js`, `test/integration/invariants/slide-contrast.test.js`,
`tools/contrast-exemptions.js`

## What happened

#1804 flipped the export path to load the engine sheet before the palette, which
is correct and is what #1527 asked for. It also changed what paints: before it, a
palette's `--seq-*` ramp never reached a PDF, because the base's defaults loaded
last and won. `word-cloud spectrum` therefore painted the BASE's ramp, which on
several palettes had collapsed onto `--accent` and was effectively one flat ink.

Once the real ramp painted, its quiet end turned out to be below the bar.

## Why it is a WCAG failure and not a bar-policy argument

The tempting framing — and the one this spent a while stuck in — is whether
`word-cloud`'s ramp stops are "large text" entitled to WCAG's 3:1. That framing is
a trap, because the size is not fixed. `sizeFromWeight` is:

```js
lerp(14, 76, ((w - 1) / 4) ** 1.35)
```

and the spectrum's quiet tier covers normalized weight `[1.5, 2.5)`. Solving
`size >= 18.66` gives `weight >= 1.588`. **Any normalized weight in `[1.5, 1.588)`
puts that tier under the large-text threshold**, and weights are min-max normalized
from arbitrary author numbers, so the band is trivially reachable. Six words:

```markdown
- alpha `50` / bravo `40` / charlie `30` / delta `15.5` / echo `15.4` / foxtrot `10`
```

renders `delta` and `echo` at **18.2px weight 500** — 13.7pt regular, large text
under no reading of WCAG — at **3.17:1** on `concrete`. Measured, both trees, same
tool:

| | runs below AA |
|---|---|
| `main` (536e1cf) | 2 |
| with this change | **0** |

## The fix, and why not the other one

`--seq-400` cannot clear 4.5:1 by construction. It is `color-mix(78% anchor, 22%
pole-low)` — a fifth of the way to the canvas by definition — so asking it to be
legible body text is asking the quiet half of a ramp to stop being quiet.
Re-solving 32 palette anchors to force it would spend the headroom #1697 and #1724
just bought, and would make every palette's ramp shorter to fix one component.

Moving the tier instead costs one array literal. The spectrum reads
`--seq-900/700/600/500`: four monotone stops with the floor on `--seq-500`, the
palette's own curated and already contrast-gated anchor.

**Worst case 5.35:1**, across all 32 palettes in both modes, measured on this base
via `composed-contrast --all` rather than predicted. `--seq-600` and above never
approach the bar.

## Two gates certified the failure, for two different reasons

Worth writing down, because the second one is a class of hole, not an instance.

**`composed-contrast` scored the surface at `min: 3`.** That looked principled —
its comment derives the number from measured render sizes — but it is a survivor of
the large-text allowance that **#1744 deleted** when it made
`check-slide-contrast.js` a single flat `const AA = 4.5`. So the static gate
blessed 3.17 while the renderer failed it. Two gates disagreeing about one surface
is worse than either bar; the bar moves to 4.5 here.

**The rendered gate could not see the ramp at all.** Its three surfaces are
`gallery @ indaco`, `gallery @ indaco-dark`, and `gallery-jargon @ indaco` — and
all three carry the DEFAULT `word-cloud`. `spectrum` appears on none of them, so
the flat 4.5 floor had never scored a single `--seq-*` run on any palette, ever.

That is the reusable finding: **the file's own "what this still does not cover"
list enumerates ungated COMPONENTS, and has no notion of an ungated VARIANT.** A
component can be gated while the variant that carries the interesting tokens is
not. A fourth surface renders `examples/seq-ramp-canvas-aware.md`, which carries
`word-cloud spectrum dark`.

`minRows` becomes per-surface with that addition. The blanket `>= 400` row floor is
calibrated for the multi-hundred-slide galleries and would reject a focused deck;
the floor still has to exist, because its job is catching a probe that silently
stops reaching the deck.

## Gates

`npm run lint` · `npm test` · `npm run build` + `build:check` ·
`node tools/composed-contrast.js` (0 regressions / 0 unlisted / 0 degraded /
0 stale) · `node tools/contrast-audit.js` (0 failures, 864 pairs) ·
`node --test test/integration/invariants/slide-contrast.test.js` (8/8, with the
ramp now inside coverage).

**Verified on the surface, not the harness** (HARD RULE #23): every contrast figure
here comes from a real deck rendered through `lattice-emulator.js` into headless
Chromium and scored with the shipping tool, on the tree that ships. The demo deck
`examples/spectrum-ramp-floor.md` is the artifact — 6 runs below AA on `main`, 0
here.

## Not fixed here

- The rendered gate prints a standing ratchet for two pre-existing exempt-tier
  ceilings (`gallery @ indaco` and `@ indaco-dark`, 1 -> 0). Pre-existing on main
  and off this path, so left alone rather than folded in (HARD RULE #18).
