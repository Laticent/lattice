# `collage`: a mixed-aspect photo collage component

Status: proposed spec, before the adversarial trio (HARD RULE #25). Nothing is built yet.

## 1. Decision

Add `collage` to the `imagery` bucket (`lib/components/imagery/collage/`). An author writes a bulleted list of 4 to 6 photos. The build packs them edge to edge into the space the slide leaves, from each photo's real aspect ratio. On live surfaces, hovering a photo focuses it, clicking enlarges it, and Escape or a click away puts it back where it was.

It is a **justified collage**, not staggered masonry: every tile is a rectangle and every edge is flush. `masonry` and `mood-board` ship as manifest tags so the catalog search finds it.

How it was chosen: three tracks ran the `design-competition` workflow (editorial, reuse-first, robustness-first), a fresh critic reviewed each, one fact-check pass checked the claims against the repo, and one judge scored them (Track 2 8.2, Track 1 7.6, Track 3 6.6). The owner then chose to combine them and set the points in section 2. Full candidate text is in the session record; this file is the spec.

## 2. What the owner decided

1. **Free order is the default; fixed order is a variant (`ordered`).** The packer may reorder tiles to fit. It stays deterministic: the same photos always give the same layout, so PDFs stay byte-reproducible.
2. **The slide has full chrome:** eyebrow, title, subtitle, a descriptive caption paragraph, header and footer.
3. **No page number.** The collage hides it. There are no progress marks. (The owner's word "pagination" means the visible page number.)
4. **Authoring uses classes for the slide and a trailing code span for per-photo hints** (section 3).
5. **Interaction:** hover focuses, click enlarges, Escape or click-away resets.

## 3. Authoring

```markdown
<!-- _class: collage -->
<!-- _header: "Marché & Fils, Bespoke Footwear" -->
<!-- _footer: "Photography: the atelier, Milan" -->

`The atelier`

## Hand-lasted, one pair at a time.

`Six photographs from the autumn bench`

- ![Tan derby, apron toe](shoes/tan-derby.jpg) `hero`
  - Tan derby, apron toe
- ![Black grained derby, macro](shoes/macro.jpg) `top`
- ![Wingtip brogue, hand-punched](shoes/brogue.jpg) `3:2`
- ![Suede chelsea boot](shoes/chelsea.jpg)
- ![Burnished chelsea pair](shoes/pair.jpg) `hero, bottom`

Each pair starts as a last carved to one foot. Leather is cut by hand and finished over fourteen weeks.
```

| Piece | Meaning |
|---|---|
| `` `Eyebrow` `` above the heading, `` `Subtitle` `` below it | The existing auto-detected patterns in `lib/base/base.docs.md`. |
| `_header`, `_footer` | The existing Marp directives. |
| Trailing paragraph | The descriptive caption for the whole slide. |
| Nested bullet under a photo | That photo's own caption, shown in the enlarged view. Matches `logo-wall`. |
| Alt text | Required. It is the screen-reader label and the enlarged-view caption fallback. |

**Slide classes** (after `collage`, any order): `ordered` keeps the written order; `fill` allows up to 8% crop to close empty space (default `tight` crops nothing and leaves a matte); `above` puts the text above the photos (default is beside); `bleed` runs the collage edge to edge; `mirror` is the existing modifier that flips the text side.

**Per-photo hints** go in one trailing inline-code span on that list row, comma-separated: `hero` (largest tile); one focal word `top` `bottom` `left` `right` `center` (which part of the photo stays in view if cropped); a ratio like `3:2` (the shape of a remote image the build cannot measure). The collage consumes the span, so it never renders as the usual metadata pill. **All or nothing:** if any word is unknown, no hint applies, the span stays a pill, and lint names the word. A hint is plain code, not a Segno `{…}` record, so the notation spec is untouched. Hints only ever select from fixed tables; author text never reaches a `style` attribute (HARD RULE #22).

**Rules.** 4 to 6 photos; past six, split into two collages. Written order is always keyboard order and the order `<!-- _focus: item 3 -->` counts in, whatever the picture shows. A collage is **atomic**: it never splits across slides (section 5.3).

## 4. Layout

Base: Track 2 (reuse). The pure kernel `lib/core/collage-pack.js` lays out at build time and emits a flat CSS grid (`ul > li > img`, `minmax(0, Nfr)` tracks, one `grid-area` per tile), so no JavaScript lays out a PDF.

- **Aspect source.** `lib/core/image-dimensions.js` reads each photo's header. **EXIF orientation must be read there** (IFD0 tag `0x0112`, swap w/h for orientations 5 to 8); today `jpegSize` ignores it, so a rotated phone photo would be stamped with the wrong shape. The fix is shared with `image`, which has the same latent bug, so some existing rotated-JPEG slides may change. Unreadable source falls to a plain even grid and lint warns.
- **Free order (default).** Search every guillotine layout (a way to cut the box into rows and columns with straight cuts) over every ordering, by dynamic programming over subsets of the photos. Deduplicate by aspect to bound the work. Rank by empty share first, then score the best candidates with a penalty for a tile that is much smaller than the largest. Ties break on a canonical tree string, so output is deterministic. Prototype on the owner's six photos: about 1% empty, 0% cropped.
- **Ordered variant.** The same search, restricted to splits whose left part is a prefix of the written order. The same prototype measured 0% empty and a smaller smallest tile (size ratio 0.37 against 0.53 for free order).
- **DOM order.** `li` elements stay in written order; only `grid-area` places them. Tab order, ordinals and lint messages all use written order.
- **Fit.** The grid fits the real container with container-query units, so a wrong estimate of the stage costs a little matte and can never overflow. `tight` (default) allows no crop; `fill` allows up to 8%, and the focal word decides where a crop falls.
- **Gaps.** The kernel solves gutters inside the tree, so a tile spanning several tracks keeps its exact aspect.
- **Compositions.** Text beside (default) or above, and `bleed`. Prototype on six mixed photos: text beside packs at 1% empty; text above at 7% empty and smaller tiles, which is why beside is the default.
- **Chrome.** Reuse the existing slide chrome. The component hides the page number itself (the author should not have to write `_paginate: false`). It does not use `silent`, which would also remove the header and footer.
- **CSS rules.** Tokens only (#3), no margin (#20; a bare `margin: 0` reset is allowed), typography from the 12-token `--fs-*` set (#4), unlayered (#26), no typed glyphs (#29), the close control drawn as a shape.

## 5. Interaction

### 5.1 States

`IDLE → HOT(i)` on hover or keyboard focus (CSS only). `activate(i)` (click, tap, Enter or Space) goes `OPENING → OPEN`. Escape, a click on the backdrop, the drawn close button or a slide change goes `CLOSING`, a reverse animation to the tile's **live** position, then `IDLE` with focus back on tile `i`. Closing during opening reverses from the current position, with no jump.

### 5.2 Hover

Hover recedes the other tiles with opacity only (no saturation shift, so leather colors stay true). The hovered tile lifts by a bounded amount and its transform origin points at the collage interior, so an edge tile cannot spill off the slide. Recede and ring key on `:focus-visible`, so nothing sticks after a click or a lightbox close. The layout packs once and never repacks after first paint.

### 5.3 Atomic for auto-split

`lib/core/auto-split.js` splits slides one member per page on non-wide decks. A collage declares a capacity axis outside the splittable set so it stays one slide. Tests: a six-photo collage on a 1:1 deck and on a 4:5 deck renders as one slide.

### 5.4 Lightbox hosting

One host-agnostic core, `lib/core/collage-lightbox.mjs`: DOM only, no imports, inlinable with `.toString()` the way `present-transport.mjs` is. It animates a full-resolution image from the tile's rectangle to a contained fit, with a frame-driven glide lifted out of `image-adaptive.js`'s `morphFrom` into `lib/core/flip-morph.js` as its own first commit.

- **Playground** (same-origin `srcdoc` frame) and **Studio and Present** (slide box is `pointer-events-none`): parent-hosted, the pattern `chart-interact.js` and `video-overlay.js` already use. An in-frame overlay would be clipped to the scaled frame and would never receive clicks in Studio.
- **Exported HTML player:** the core is inlined into the player's single CSP-hashed `<script>` and uses a native `<dialog>` with `showModal()` (native focus trap, inert background, Escape, backdrop). **This changes exported bytes, so the QUALITY BAR sign-off applies:** render the demo deck to HTML in dark and light and send both before merge. If sign-off is refused, the fallback is stated plainly: exported HTML does not enlarge images in v1.
- **VS Code Marp preview:** collage and hover only, no lightbox. A stated gap.
- **PDF, PPTX, PNG:** a clean static collage. No hover or open state reaches the slide DOM, and no animation runs in export or print.

### 5.5 Scope cut from v1

Stepping between photos, pinch zoom and digit keys move to `followups.d/`. This shrinks the Present and player key surface. v1 opens on click or tap, Enter or Space on a focused tile, and closes on Escape, click-away or the close button.

### 5.6 Input precedence

While open, the lightbox listens in the capture phase and consumes Escape, arrows, Space, wheel and swipe, and traps Tab inside the dialog. When closed, a click on a tile opens it and a tap or swipe anywhere else keeps whatever the host already does. **Open question for review (Present only):** the owner asked for click to enlarge. Track 3 proposed single-tap-advances and double-tap-opens in Present. The implementer confirms each host's existing click handler before wiring and records the result; the spec default is that a tile click opens.

## 6. Export and print

Static collage by construction. `<!-- _focus: item 3 -->` already tags `.lat-focus` and `.lat-recede` on the first list through `lib/transformers/focus.js` (the list stays flat), so a presenter gets a printable focus state with no new code. When no build stamp exists (export-to-Marp, an unreadable image, an expired measure cap), the section falls back to an even CSS grid, two columns for four or fewer photos and three for five or six.

## 7. Accessibility

Alt text required. The list keeps `ul` and `li` semantics and written order. The lightbox is `role="dialog"` with `aria-modal="true"`, focus moves to the close control, is trapped while open and returns to the tile that opened it, and background scroll is locked. Keyboard and screen-reader access in frame hosts uses focusable proxy buttons mounted only for the active slide, with the in-frame list `aria-hidden` while they exist. Forced-colors mode maps the focus outline to `Highlight`. Recede never carries information alone. Reduced motion becomes a crossfade.

## 8. Files

**Commit 1:** `lib/core/flip-morph.js` (new), `lib/transformers/image-adaptive.js` (import it; its existing tests prove the refactor). **Commit 2:** EXIF orientation in `lib/core/image-dimensions.js`, with Orientation 1, 6 and 8 fixtures. **Then:** `collage.manifest.json`, `collage.styles.css`, `collage.transform.js`, `lib/transformers/collage.js`, `lib/core/collage-pack.js`, `lib/core/collage-lightbox.mjs`, `docs/src/playground/collage-host.js`, `examples/collage.md`, sample photos, `changelog.d/collage-component.added.md`. **Touch:** `lib/transformers/registry.js`, `lib/core/image-dimensions.js` (`stampCollage`), `lattice.js`, `lib/authoring/lint-core.js` (rules `collage-alt`, `collage-count`, `collage-hint`), `PlaygroundApp.tsx`, `single-slide-render.ts`, `present-guide.ts`, `lib/export/player-core.mjs`. **Generated, never by hand:** `collage.docs.md`, `collage.gallery.md`, `dist/docs/components.*`. Graduation to the gallery is a separate later commit (#8).

## 9. Tests and evidence

- **Packer:** deterministic; tree counts 1, 2, 6, 22, 90, 394; the ordered variant keeps written order; gap-compensated tiles hit their aspect; every emitted value is finite. **Measure the free-order search time at six photos** before building (the prototype was fast, but it has not been timed).
- **Reader:** EXIF fixtures, and a Chromium arm asserting the build-time aspect equals the browser's `naturalWidth/Height`.
- **Transform:** build and browser paths produce identical output; idempotent; a HARD RULE #22 arm proving alt text, captions and hint words never reach a `style` attribute or markup.
- **Atomic:** the 1:1 and 4:5 deck arms from section 5.3.
- **Hints:** a collage consumes a valid span; an invalid span stays a pill and lint names the word.
- **Lightbox:** every state transition with a fake host, capture-phase Escape, close during opening, focus trap and restore, scheme filter on the image source.
- **Real surfaces (HARD RULE #23):** the Playground and Studio driven with `tools/screenshot.js` at 1440, 820 and 390 px; the exported HTML player opened in real Chromium in dark and light; `tools/pixel-check.js`; `npm run check:jank`; a PDF page with `_focus: item 3`. iOS Safari touch stays **UNVERIFIED** unless driven on a device.
- **Demo deck:** `examples/collage.md` (HARD RULE #9). Nine slides: 4, 5 and 6 photos; free versus ordered; tight versus fill; text beside, above and bleed; a portrait-heavy set with an EXIF-rotated phone JPEG; `_focus: item 3`. The owner's nine shoe photos are not in the repo; the deck uses sample stand-ins until the owner supplies photos they have cleared.

## 10. Known risks

1. Blast radius: a shared reader (the EXIF fix may move existing rotated-JPEG slides), a shared kernel extraction, the registry, and exported bytes. Maker-checker at minimum; this spec goes to the adversarial trio.
2. The stage-aspect estimate only steers which layout wins; the CSS fit against the real container bounds it.
3. Free order puts the picture out of step with keyboard order by design. The mitigation is that `ordered` exists, and tab order and ordinals stay in written order.
4. The player lightbox may be refused at sign-off; the fallback is stated in section 5.4.
5. Export-to-Marp may not carry the grid; the even-grid fallback must be verified and its behavior stated.
6. Full-resolution first paint can stall WebKit; unproven on this surface.
7. A trailing code span is claimed by the collage instead of becoming a pill. That is a documented exception to the metadata-pill rule in `base.docs.md`.
