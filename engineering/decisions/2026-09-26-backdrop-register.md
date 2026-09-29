---
status: in-progress
summary: Backdrop restraint (strength, clear-behind-content, spotlight) works only on a fabricated finish, only deck-wide, and only in the Studio, because #695 made it a baked layer of the finish and retired the author-facing `backdrop:` map. This proposes a finish-independent `backdrop:` register plus per-slide `backdrop-*` classes that override the baked value (slide beats deck beats finish), on every render path including the CLI. Partly supersedes the FINAL revision of 2026-07-01-finish-restraint-controls.md.
---

# The `backdrop:` register — restraint for any finish, on any slide

**Status:** in progress 2026-09-26. Owner confirmed the name (`backdrop:`), the 20/40/60/80
steps, and keeping `finish-override.backdrop` with the register winning (§7).
**Partly supersedes:** the 2026-07-02 FINAL revision of
[`2026-07-01-finish-restraint-controls.md`](2026-07-01-finish-restraint-controls.md), which
retired the top-level `backdrop:` map. This note keeps that revision's *baked* layer and
brings back an author-facing override on top of it.

## 1. The symptom

An author who wants a quieter finish on one deck, or clean canvas behind a dense chart on one
slide, has no way to say so unless all of these hold:

| Condition | Why it is required today |
|---|---|
| The finish is a **fabricated** one | `backdropSlots` (`docs/src/components/studio/finish-generate.ts:582`) is the only code that writes `--fin-backdrop-*`. Built-in presets (atrium, halo, …) have no recipe, so `finish-override:` has nothing to merge into. |
| The change is **deck-wide** | `finish-override:` is a front-matter map. No class sets strength or a mask on one slide; the 07-01 note left "per-slide strength" as an open question (§10) and nobody answered it. |
| The deck renders **in the Studio** | `StudioShell.tsx:2011` regenerates the finish CSS from the merged recipe. The CLI renders whatever finish CSS is already embedded, so a hand-edited `finish-override:` does nothing there. |

So Fabricate's Strength slider, "Clear behind content" toggle and "Spotlight one area" toggle
describe the finish's **default** look well, and give the author no **per-use** control.

## 2. Why the retirement left this gap

#695 retired the `backdrop:` map on the grounds that backdrop is a design element of the
finish. That is right for the default: a finish designer should be able to ship a finish that
is already restrained. It is wrong as the only tier, because restraint also depends on the
*content*. A title slide, a dense table and a photo slide need different amounts of finish
under the same preset. Content is decided per deck and per slide, not per finish.

## 3. The mechanism is already finish-independent

`lib/base/base.finish.css` never mentions a preset in the restraint path:

- `section.finish > .backdrop { opacity: var(--fin-backdrop-strength, 1) }` (line 147)
- `section.finish > .backdrop > .backdrop-mask { background: var(--fin-backdrop-mask, none) }` (line 254)
- the clearance shape `--backdrop-clear-mask` and its hard `-opaque` export mirror live on
  `section.finish`, and both export flips (`@media print`, `.lattice-exporting`) swap the mask
  to its `-opaque` mirror.

Every finish slide gets the same `.backdrop` wrapper on all three render paths
(`lib/core/backdrop.js`, the runtime's `injectBackdrops`, and the splitter). So the new work is
a **second source** for those two values, not a new compositor.

## 4. The proposal

### 4.1 Three tiers, most specific wins

| Tier | Written as | Reaches |
|---|---|---|
| Slide | `<!-- _class: backdrop-40 backdrop-clear -->` | one slide |
| Deck | front matter `backdrop: 40 clear` | every finish slide |
| Finish | Fabricate's baked `--fin-backdrop-*` | every slide wearing that finish |

The deck value uses the slide vocabulary without the prefix: `backdrop: 40 clear` stamps
`backdrop-40 backdrop-clear` on every section, the way `lift: on` stamps `lifted`. A slide that
carries any `backdrop-*` token of an axis drops the deck's token for that axis, the same
slide-over-deck rule `lift:` uses (`plugins.js:416`). Strength and mask are separate axes, so a
slide can take the deck's strength and override only its mask.

### 4.2 The vocabulary

| Axis | Tokens | Meaning |
|---|---|---|
| Strength | `backdrop-20` `backdrop-40` `backdrop-60` `backdrop-80` `backdrop-full` | opacity 0.2 … 0.8; `full` restores 1 and discards a baked dim |
| Mask | `backdrop-clear` | the existing clearance ellipse |
| Mask | `backdrop-spot-<pos>`, `<pos>` ∈ `tl t tr l c r bl b br` | a fixed-radius spotlight window at one of nine anchors |
| Mask | `backdrop-open` | no mask; discards a baked clearance or spotlight |

Why discrete steps rather than any number: a class cannot carry a free value without an inline
style, and inline style from author text is a sanitizer surface (HARD RULE #22). Four steps of
20% and nine anchors cover what the Fabricate controls are used for; a finish that needs an
exact value still bakes it in Fabricate.

Two names are already taken and stay out of the vocabulary: `backdrop-none` (the back-compat
alias for `finish-none`) and `backdrop-mask` (the overlay element inside the wrapper, never a
section class). Hence `backdrop-open` and `backdrop-full` rather than a `-none` spelling.

`finish-none` stays the per-slide *off switch*. `backdrop-*` only restrains a finish that is
present, and is inert on a slide without one.

### 4.3 The CSS

A separate token namespace, read first, so no specificity contest with a fabricated finish's
`section.finish.finish-<slug>` (0,3,1) rule:

```css
section.finish > .backdrop {
  opacity: var(--backdrop-opacity, var(--fin-backdrop-strength, 1));
}
section.finish > .backdrop > .backdrop-mask {
  background-image: var(--backdrop-scrim, var(--fin-backdrop-mask, none)),
                    var(--backdrop-dim-scrim, none);
}
section.backdrop-40 {
  --backdrop-opacity: 1;   /* cancel a baked dim so the step replaces it */
  --backdrop-dim-scrim: linear-gradient(color-mix(in srgb, var(--fin-canvas) 60%, transparent) 0 0);
}
section.backdrop-clear {
  --backdrop-scrim: var(--backdrop-clear-mask);
  --backdrop-scrim-opaque: var(--backdrop-clear-mask-opaque);
}
section.backdrop-open { --backdrop-scrim: none; --backdrop-scrim-opaque: none; }
/* both export flips gain one line: */
@media print { section.finish { --backdrop-scrim: var(--backdrop-scrim-opaque); } }
```

When no `backdrop-*` class is present, `--backdrop-scrim-opaque` is undefined, so the print flip
makes `--backdrop-scrim` invalid and the `var()` fallback reaches the baked value. A deck with no
new token renders **byte-identical**. That is the acceptance test for the no-opt-in path.

**Strength is a veil, not an opacity.** The first cut set `opacity` on `.backdrop`, as the
baked strength does. The demo PDF then showed a large dark wedge across every slide that
combined a step below 100% with `clear`, in poppler (pdftoppm, and so Evince and Okular). A
minimal page isolated it: a hard-edged mask nested inside a group with `opacity < 1` draws the
wedge; the same mask with no group opacity renders clean. PDFium drew all variants correctly.
So a strength step now lays a flat sheet of the canvas at (100 − N)% in the mask layer, which
is the same pixel math on a flat canvas and creates no transparency group. It rendered clean
in poppler and PDFium. The token names end in `-scrim` / `-opacity` because the ownership gate
requires a role suffix on any token in a `var()` fallback chain (HARD RULE #11).

**The same wedge through a finish's BAKED dim.** A fabricated finish can bake
`--fin-backdrop-strength < 1`, which is still a group opacity. Put any register mask on it and
the wedge returns, which the maker-checker pass found and pinned in poppler. So every mask class
also converts the baked dim into the veil: `--backdrop-opacity: 1` plus a veil of
`calc(100% − strength × 100%)` (verified in Chromium 141: a baked 0.5 resolves to a 50% veil, no
baked value to a transparent one). A strength class, later in source, overrides both.

**Found, not caused:** a fabricated finish that bakes BOTH `strength < 1` and its own clearance,
with no register token on the slide, still hits the wedge. That predates this register and is
logged in `followups.d/`. The poppler hairline along any hard mask edge (the shipped clearance
included) is also pre-existing; PDFium draws none.

**Two more checker findings, fixed.** `finish-none` / `backdrop-none` now reset the register's
variables: a deck-wide `backdrop: clear` still stamps its tokens on an opted-out slide, and the
mask used to paint an ellipse hairline on every `finish-none` bookend. And the veil covered the
overflow QA ring (an inset shadow on the section, under `.backdrop`), fading it to pink, so the
mask layer steps in by the ring's 4px wherever the ring is drawn.

### 4.4 Anchor slides

The bug that made bookends a concern (#1656: the clearance mask painted a light ellipse over a
dark title slide) is fixed at the root by `--fin-canvas`, which every mask already paints in.
This register reuses those masks, so a deck-wide `backdrop: clear` on an inverse or accent
bookend paints the bookend's own canvas, not the deck's. The demo deck (§6) renders a title,
a closing and a `finish-none` divider bookend in both modes to prove it rather than assume it. The `bookend-finish-contrast`
lint stays as it is.

### 4.6 What "clear" clears: the content box, not an ellipse

**Symptom (owner, 2026-09-26):** with `clear`, content on the stage was still muddled by the
finish. **Root cause:** clearance was a fixed central ellipse, inherited from the 07-01 design,
which chose "a fixed safe-margin approximation" and left measuring the content box as an open
question. Measured against the real frame: the export face's hard edge (64% of an 84% × 78%
ellipse at 50% × 45%) misses the top-left eyebrow and heading outright, and the screen face
only reaches full canvas inside 44% of the radii, so behind the start of the body text the finish
was only 65% cleared and behind the heading 41%. This note's first verification measured a
centre box (25–75% × 30–70%), which the ellipse covers by construction; it never looked where
the text is. That was the gap in the evidence, not only in the code.

**Decision (owner):** clear = the frame's content box, heading and body both, for the register
and for Fabricate's baked clearance alike; soft edge on screen, hard edge in exports. (§4.7 made
the export edge soft as well.)

**Mechanism:** the section's padding IS the frame margin, and `.backdrop` covers the section's
padding box, so `.backdrop` and `.backdrop-mask` inherit that padding and the mask's `::before`
inherits it again: its content box is the section's content box on every layout, with no
geometry restated. A solid `--backdrop-clear-fill` layer is painted there, extended by
`--backdrop-clear-bleed` (5cqi) and blurred by `--backdrop-clear-blur` (2.5cqi) on screen, so
the fade runs across the whole margin and the content box stays canvas (≥97.7% at its very edge).
A first cut used 1.5cqi / 0.6cqi: a ~20px fade that the owner, reviewing the Studio on an iPhone,
read as a panel with a defined edge. The wide fade removes the edge. Both export guards zero
the bleed and set `--backdrop-clear-filter: none`. A 0px blur is not enough: Chromium still
treats `blur(0px)` as a filter when it prints, rasterizes the whole page (the demo PDF grew
from 251 KB to 466 KB with four full-page images) and poppler outlines the content box in gray.
A tone slide's 8px rail inset is offset back. `open`, the spotlights and `finish-none` switch the
layer off.

**Zero-padding layouts:** `split-panel` and `split-compare` set the section padding to 0, so their
content box is the whole slide and `clear` removes the finish from them entirely. That is the rule
applied faithfully: their panels already fill the slide, and there is no margin to frame.
*Superseded by #2457 (owner, 2026-09-28):* a split slide now carries one finish across the whole
slide, and `clear` clears behind the supporting zone's content box, as on any other slide
(split-panel.styles.css `--_clear-box`); the feature panel is a 90% pane over the finish.

**Strength: the veil for the register and for masks; opacity only for a bare baked strength.**
Poppler mis-draws both ways to dim a finish. Group opacity around a hard-edged mask draws a dark
wedge (or the finish at full strength). Without a mask it only seams: faint gray lines at the
texture's tile boundaries at thumbnail zoom (≈40–72 dpi). A flat veil survives a mask and seams
at 100 dpi instead. No drawing is seam-free in poppler, and PDFium and Ghostscript draw neither,
so the wedge decides:
- `--backdrop-veil-weight` is 1 for every register step. A deck's `backdrop: 40` can sit over a
  finish saved before this PR with a baked mask the CSS cannot see, and opacity there is the wedge.
- It is also 1 for a register mask class, and for a mask Fabricate bakes (the generator emits
  `--fin-backdrop-veil-weight: 1`).
- Only a finish's own baked strength with no mask keeps opacity, exactly as on main, so a deck that
  never names the register exports the same bytes.

Two cuts on the way here each failed a checker. Veiling every finish slide added a transparent
object to every built-in finish page. Opacity for register steps put opacity around legacy baked
masks (the wedge). Both checkers measured seams at a single zoom, which hid that both drawings
seam. Measured on the final rule against the build before the content-box change:
- `accent-finishes`, `finish-split-covers`, `finish-backdrops`, `finish-override`,
  `finish-per-slide`, a baked-strength deck and a `backdrop: 40` deck export at the same byte count.
- A register step over a legacy baked-mask finish no longer wedges. A legacy finish that bakes
  both a strength and a mask still does, as on main (followup `2388-p3-legacy-saved-finish-wedge`).
- The seams are followup `2388-p3-veil-tile-seams`.

**Fabricate:** a newly saved clearance emits `--fin-backdrop-clear-scrim: var(--backdrop-clear-fill)`
instead of the ellipse. Finishes saved before this change keep their generated CSS, which names
the legacy `--backdrop-clear-mask` ellipse; it stays defined for them until they are re-saved.

**Verified at the real content box:** 9 built-in finishes × {prose, four-card grid, title
bookend, tone slide} × light/dark, all `60 clear`, measured inside the content box and inside
every text element's box read from the DOM, against the same slides with `finish-none`: screen
face 0.0 difference everywhere behind the content (72 slides), print face at most 2/255
(anti-aliasing at the edge). The finish remains in the margin (mean difference 1.6–2.6).

### 4.7 The export edge is soft too (reverses §4.6's "hard edge in exports")

**Symptom (owner, 2026-09-26, iPhone):** a deck with `backdrop: clear` showed a soft fade in the
Studio but a hard-edged panel in the exported PDF, in both Adobe Acrobat and Safari.

**Why §4.6 chose a hard edge:** a blurred layer is not vector. Chromium embeds a CSS `filter` as an
image when it prints, and the note wanted a fully vector page.

**Candidates, measured on `examples/backdrop-register.md` (10 pages, 8 cleared):**

| Candidate | PDF size | Result |
|---|---|---|
| Hard edge (§4.6) | 253 KB | Vector. The panel the owner rejected |
| Keep the blur in print | 909 KB | Matches the Studio. Chromium embeds ONLY the clear layer as a 300 ppi image with an alpha channel (about 82 KB a slide); the finish under it and the text stay vector |
| Gradient `mask-image` (two axis ramps, `mask-composite: intersect`) | 342 KB | Vector and within 1–3 levels of the blur, but Apple PDFKit drops CSS masks (`engineering/gotchas/export.md`), and PDFKit is the owner's viewer. It could not be checked on iOS from the sandbox |
| Nine gradient tiles (a solid centre, four edge ramps, four radial corners) | ~vector | Poppler and Ghostscript both draw a 1px lighter seam where a corner tile meets an edge tile: each rasterizer paints the shared boundary pixel from both tiles |
| Nested solid rectangles, one alpha step each | ~vector | Visible banding and square corners |

**Decision (owner):** keep the blur in every face. Both export guards stop zeroing
`--backdrop-clear-bleed` and `--backdrop-clear-filter`. A slide without the clear layer carries
no filter work in the PDF: `finish-backdrops`, `accent-finishes` and `finish-per-slide` export at
the same byte count before and after. The `blur(0px)` warning in §4.6 still holds: a 0px blur
rasterizes the page for nothing and poppler outlines the box in gray.

### 4.8 The Studio download (2026-09-27)

The Studio's PDF download is a different export from the CLI's: html-to-image photographs
each slide with `.lattice-exporting` on, and a pdf-lib worker packs the pictures. The owner's
first hard-edged PDF came from here. Measured through html-to-image on the owner's own deck:

- **The switch has to stay.** Without `.lattice-exporting`, html-to-image draws the screen
  face's `color-mix(…, transparent)` washes as solid color blobs, as `deck-export.js` warns.
- **The spotlight** printed a solid arc: the switch swapped in the hard-edged mirror meant for
  the vector PDF. Its feathered scrim is a transparent-to-canvas radial with no color-mix, and
  html-to-image draws it cleanly, so the Studio switch no longer flips `--backdrop-scrim` or a
  baked `--fin-backdrop-mask`.
- **The clear edge.** Keeping the blur (§4.7) made it soft, but over a dot texture (strata)
  html-to-image drew the blurred layer as vertical stripes. The Studio switch draws the same
  falloff with a two-axis gradient MASK instead. §4.7 rejected a mask for the vector PDF because
  Apple PDFKit can drop it; a Studio PDF is pictures, so the mask is flattened to pixels before
  any viewer sees it.

**Every mask type, through html-to-image with `.lattice-exporting`** (the Studio's capture),
light and dark, against the live Studio: `clear`, `open`, `spot-c`, `40`, `40 spot-bl`, halo and
gallery (whose looks are spotlights) with `clear`, a Fabricate finish with a baked clearance and
one with a baked spotlight, and a finish saved with the legacy ellipse. All draw soft. The
Fabricate spotlight needed its own fix: `generateFinishCss` writes the finish's Studio export
rule itself and flipped `--fin-backdrop-mask` to the hard mirror there too; it now flips it for
print only. **A Fabricate spotlight finish saved before this change keeps the old generated rule,
and so its hard-edged Studio download, until it is re-saved.**

### 4.9 Saved finishes in the Studio exports (2026-09-28)

**Symptom (followup `2388-p1`, closed by this fix):** a finish saved in Fabricate showed in the live preview, but the
Studio's Share → Images, PDF and PowerPoint exports came out identical to `finish: none`.

**Cause, found in the real capture document:** the saved finish's class and CSS both reached the
capture. Its layers still computed to `none` under `.lattice-exporting`. The Studio scopes the
engine stylesheet under `article.lattice >`, so the engine's export flip
(`--fin-texture: var(--fin-texture-opaque, none)`, and the wash, mark and edge siblings) is
`article.lattice > section.finish.lattice-exporting`, specificity (0,3,2). The saved finish's own
export rule is `section.finish.finish-<slug>.lattice-exporting`, (0,3,1), so the flip won. A
built-in preset survives it because it declares `--fin-*-opaque` mirrors; a generated finish
declared none, so every layer fell to `none`. The CLI was not affected, because its stylesheet is
not scoped.

**Fix:** `generateFinishCss` writes the four mirrors (`--fin-wash-opaque`, `--fin-texture-opaque`,
`--fin-mark-opaque`, `--fin-edge-opaque`) in the finish's rich rule, the same shape a preset has.
The flip then lands on the finish's own opaque face at any specificity. The Studio regenerates a
saved finish's CSS from its recipe on every read, so finishes already in a library are fixed
without a re-save.

**Verified on the real Studio** (Fabricate save → `finish:` → Share), comparing each export of a
slide wearing the saved finish against the same slide with `finish: none`: 0% of pixels differed
before the fix on every lane; after it, 10.6% (Images), 8.6% (PDF) and 10.6% (PowerPoint) in
light, and 9.4% (Images) in dark: the wash and the grid. A record saved with no recipe (only its
CSS text) cannot be regenerated and keeps its old CSS.

**Cost, measured on the real Studio** (10-slide deck, a Fabricate finish with a glow wash, grid,
margin bar and margin rule; median of two exports; poppler draws the whole PDF at 110 dpi, best
of three). Before the fix every slide matched `finish: none` to within 0.02% of pixels. After it,
the saved finish costs what a built-in finish with a similar look costs:

| Export | `finish: none` | Saved, before | Saved, after | atrium (built-in) |
|---|---|---|---|---|
| PDF | 146 KB, 3.1 s | 197 KB, 4.1 s | 351 KB, 4.1 s | 336 KB, 4.1 s |
| PDF, poppler draw | 1.36 s | 1.28 s | 1.95 s | 1.90 s |
| PowerPoint | 1.93 MB, 3.1 s | 2.10 MB, 4.3 s | 4.81 MB, 5.5 s | 4.66 MB, 5.4 s |
| Images | 1.51 MB, 4.6 s | 1.69 MB, 5.7 s | 4.45 MB, 6.9 s | 4.33 MB, 7.1 s |

The CLI output does not change (the independent checker rendered nine finish variants through
the default writer, `--chrome-pdf` and PNG: 0 pixels differ). `docs/e2e/saved-finish-export.spec.ts` pins the Images lane and fails without
the fix.

**The three paths the fix argued but did not run (followup `2445-p2`, closed 2026-09-29).** Studio
Print, `finish-override:` and a baked spotlight all reach the same mirrors. The same spec now
drives each one on the real Studio and compares slide 2 against `finish: none`:

| Path | How the spec drives it | Mirrors off | Mirrors on |
|---|---|---|---|
| Share → Images, saved finish | the original case | 0% | 10.6% |
| `finish-override:` (`texture: intensity: 18`) | Share → Images | 0% | 15.0% (and 5.1% vs the same finish without the override) |
| Spotlight, 70% radius | Share → Images | 0% | 12.1% |
| Print deck → Print (desktop, 1-up) | see below | 0% | 12.5% |

"Mirrors off" means `opaqueMirrorDecls` returned nothing, with the docs rebuilt, which is the
pre-#2445 generator. Every case read exactly 0 there, so the Print path had the same defect as the
export flip and #2445 fixed it too. Print is driven up to `print()`, which Playwright cannot
dismiss, so the spec stubs it and takes the offscreen frame's exact document. It then prints that
document through Chromium's own print pipeline (`page.pdf()` with print media) and draws page 2
with poppler. That exercises the print engine the dialog uses, but not the dialog itself. The
spotlight case opens the window to its 70% maximum because at the default 38% it paints correctly
but covers only 2.5% of the slide, under the 3% bar.

### 4.10 The frame keyline in exports (2026-09-28)

**Symptom:** the `frame` edge (the gallery preset, Fabricate's "Inset frame") showed on screen and
was missing from every export: the CLI's PDF through both writers, and the Studio's images, PDF
and PowerPoint. It had been missing since the frame existed; gallery's export wash was the same
before #2387.

**Cause:** the frame was an inset `box-shadow` on the section (`--fin-frame`). The section is a
stacking context (`isolation: isolate`) and `.backdrop` sits inside it at `z-index: -2`, so every
finish layer paints over the section's own shadow. On screen those layers are mostly transparent
and the line shows through; an export face's wash ends on solid canvas and covers it. Fabricate
labels the frame "EDGE z4", the top of the stack, but it was drawn at the bottom.

**Fix:** the keyline is drawn a second time, on top, on the mask layer's `::after`, colored by
`--fin-frame-mark` (the keyline color, written by the generator for a `frame` edge). The pseudo sits
at the keyline's outer edge and paints the line as a spread `box-shadow`, which lands above the veil
and the clear layer in every face. It is not an `outline`: Chrome snaps outline widths to whole
pixels, so the ring drew 2px against the shadow's 2.8px and did not cover the line beneath it. The
canvas-colored mat stays the section's shadow, underneath, so a texture still shows through it.
Measured on screen, the ring lands on the old line: switching it off versus on changes only edge
anti-aliasing (at most 17 levels, gallery), and the exported line is as wide as the screen's (6-7px
at 2x). Two slide states move the section's own ring, and the pseudo follows them: a tone slide
(`left` 8px further out, for the tone rail) and an overflowing slide with the overflow ring (4px
further out on every side). Without those offsets the keyline jumped 4-8px on those slides.

**The `backdrop:` register does not restrain the frame.** The register dims and masks the layers
behind the content; the keyline sits at the slide edge and never competes with a word, so it stays
crisp at every strength. Say so in review if a dimmed frame is wanted; it would be one more
`opacity` read on the pseudo.

**A hand-written finish must set `--fin-frame-mark`** to get the top keyline. A frame declared only
through `--fin-frame` keeps the old behavior: visible on screen, gone in exports. The generator,
the gallery preset, `design/skills/finish.md` and the Finishes docs all carry the mark. `finish-none`
and print mode clear it with the rest of the finish.

**Known caveat:** on an overflowing slide in an export, the "Content clipped" tag sits on the
bottom keyline. It is cosmetic, appears only on a slide that is already flagged broken, and is not
fixed here.

**The inset moved from 2.6-2.82 to 1.1-1.32 section-cqi** (14-17px at 1280). At the old inset the
keyline struck through the header (28-52px) on screen, which exports never showed only because
they had no frame; drawing it in exports would have spread that collision to every PDF. At the new
inset the frame encloses the header, the footer (to 696px) and the page number. This moves the
gallery frame outward on screen too.

**Measured:** decks without a frame export byte-identical (`accent-finishes`, both writers). In
`finish-per-slide` and `finish-backdrops` the only pages that change are the gallery ones (page 4
of 6, page 10 of 15), in both writers. On the real Studio, the saved Fabricate frame and gallery
both carry the frame in Images, PDF and PowerPoint, including a tone slide.
`docs/e2e/saved-finish-export.spec.ts` samples the keyline in an exported gallery slide and fails
without the fix. Closes followups `2388-p3-studio-inset-frame-missing`,
`2400-p3-gallery-frame-missing-studio-download` and `2388-p3-gallery-frame-crosses-header`.

### 4.5 `finish-override.backdrop`

Keep it working. It still tunes the baked tier of a fabricated finish, and removing it would
break saved decks. The register sits above it: when both are set, the register wins, because
it is the more specific statement of intent. The `retired-backdrop-key` lint narrows to the
old *map* form (an indented child under `backdrop:`) and its fix text points to the scalar.

### 4.11 One export face for every finish (2026-09-29)

**Problem (followup `2400-p2`, closed by this change):** two writers each restated which finish
slots flip to their `-opaque` mirror in an export, and for which target. The engine's flip in
`base.finish.css` covers the built-in presets; a saved finish's `generateFinishCss` wrote its own,
because its selector `section.finish.finish-<slug>` (0,2,1) out-specifies the engine's
`section.finish` (0,1,1). The hard clear edge and the hard spotlight arc were each fixed twice
(#2400, #2404).

**Change:** one table, `EXPORT_FACES` in `lib/finishes/finish-generate.js`, names each slot's
face per target: `print` (`@media print`: the CLI's vector PDF and the Studio's desktop Print)
and `raster` (`.lattice-exporting`: the Studio's html-to-image capture). The four layers flip on
both targets. The backdrop mask flips on `print` only, because the raster keeps a spotlight's
feathered mask (§4.8). Both writers emit from the table:

- `tools/build-packages-index.js` writes the engine flip into a second generated region of
  `base.finish.css` (`BEGIN/END GENERATED EXPORT FLIP`), after the presets it must out-order.
  `--check` and `finish-generate.test.js` fail on a hand edit.
- `generateFinishCss` writes the same list at the saved finish's specificity. It now points at
  the mirrors its rich rule already declares (#2445), so it restates no value.

A unit test reads each flip back out of both writers' output and requires the table's list.

**The table lives in `finish-generate.js`, not in its own module.** The docs dev server serves
that file through `vite-cjs-lib-dev.mjs`, which refuses any file with a `require(` of its own, so
a separate kernel would have broken the Studio in dev.

**Refused alternatives.** An `!important` engine flip would let the engine's flip win at any
specificity and delete the saved finish's rules, but it would also flip an author's own per-slide
`--fin-*` override, which the `:where()` guard deliberately lets win today. Renaming every slot to
`--fin-*-rich` / `--fin-*-opaque` and letting only the engine choose would remove the specificity
race, but it breaks every finish written as CSS (a deck `<style>`, a saved record with no
recipe). Both are export-face changes for a problem that is only duplication.

**Verified: no PDF or image export changes a byte.** Five finish decks through the CLI
(`backdrop-register`, `finish-override`, `finish-split-covers`, `finish-canvas-print-face`,
`finish-backdrops`) produce byte-identical PDFs before and after. The ten PNGs
`saved-finish-export.spec.ts` exports on the real Studio (a saved finish, a `finish-override:`,
a spotlight, Print and their `finish: none` controls) are byte-identical too. The Webpage export
embeds the CSS text, so its bytes change: the flip's comments moved, and a saved finish's export
rules now read `var(--fin-*-opaque, none)` instead of the literal opaque values. The computed
values are the same.

## 5. Surfaces

- **Engine:** `lib/core/resolve-backdrop.js` (the name the retired resolver used, reborn as a
  scalar register like `resolve-lift.js`), wired into the three paths that already read `lift:`.
- **CSS:** `lib/base/base.finish.css`, the rules in §4.3.
- **Lint:** `lib/authoring/lint-core.js` — `unknown-backdrop` (an unknown word, or a second word
  on one axis) and the retired-map warning, now pointing at the scalar form. Per-slide tokens are
  checked by the universal modifier vocabulary (`MODIFIER_GROUPS` gains a `backdrop` group).
- **Studio:** a Backdrop row in deck settings and in `SlideContext.tsx` (strength steps + mask
  choice), with the same provenance badge the finish row shows (slide / deck / finish).
- **Docs:** `lib/base/base.registers.docs.md` § finish gains a `backdrop:` subsection; the
  07-01 note gets a pointer to this one.

## 6. Verification

- Unit (`test/unit/core/backdrop-register.test.js`): the resolver, slide-over-deck per axis on
  the engine AND the real runtime bundle, the CSS contracts (read order, export-flip order,
  opt-out reset, mask-converts-baked-dim, ring inset) and the lint rules. A deck without the key
  gets no backdrop class; that is what the unit arm proves. It does NOT diff rendered bytes: the
  compositor's CSS changed for every finish slide, and the claim that its computed values are
  unchanged without a register token rests on the checker's real-Chromium probe (`none` scrim,
  baked mask and opacity preserved, both media), not on a committed test.
- Studio (`docs/e2e/backdrop-register.spec.ts`): the deck and slide rows write the source the
  engine reads, with screenshots at 1440, 820 and 390px.
- Demo deck `examples/backdrop-register.md` (HARD RULE #9): a built-in finish (atrium) and a
  fabricated one that bakes a 60% dim and a clearance, each at deck level and overridden per
  slide, plus title, closing and a `finish-none` divider bookend. Rendered in light and dark and
  rasterized in poppler and PDFium.
- **All nine built-in finishes** (atrium, meridian, strata, halo, ledger, nimbus, loom, savile,
  gallery), each at baseline, `60 clear`, `40 spot-tr`, `20` and as a `title` bookend with
  `60 clear`, in light and dark: 90 slides through the CLI (rasterized in poppler and PDFium) and
  again through the Studio's Images export. Measured as the per-pixel difference from the same
  slide with `finish-none`: `clear` leaves 0.00 ink behind the content on every finish; `20`
  keeps roughly a fifth of each finish's ink; the spotlight keeps the top-right window and hides
  the rest; no wedge on any slide in either renderer; the Studio export matches the CLI to a
  mean 2.1 (light) / 1.4 (dark) out of 255 outside the text.
- **A Studio export defect the matrix surfaced, fixed here.** The Images export repaints the
  spectrum ribbon as a background strip (html-to-image mis-renders a gradient `border-image`),
  and the strip sat in the padding box, under `.backdrop`. Most finishes' own wash already hid it
  (pre-existing), and a register mask erased it where the clearance reached the top edge. The
  strip is now anchored to the border box (`deck-export.js` `withCaptureFixups`), pinned by
  `capture-ribbon.test.ts`, and the bar measures 100% intact across all 36 light content slides.
- **Export sign-off:** this alters exported bytes for decks that opt in, so the demo PDFs go to
  the owner in dark and light before merge.
- Maker-checker: one checker agent (engine CSS + three render paths). Its four confirmed
  findings are fixed above and pinned in the unit file.

## 7. Owner decisions (2026-09-26)

All three recommendations were taken: the name is `backdrop:`, the steps are 20/40/60/80,
and `finish-override.backdrop` stays with the register winning. The original questions:

1. The register name: reuse `backdrop:` (matches the Fabricate header and the wrapper element)
   or pick a fresh word to avoid confusion with the retired map.
2. The strength steps: 20/40/60/80, or a finer 10% grid.
3. Whether `finish-override.backdrop` stays supported indefinitely (§4.5) or is deprecated with
   a migration warning.
