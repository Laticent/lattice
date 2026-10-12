---
status: proposed
summary: >
  A new `collage` imagery component packs 4 to 6 mixed-aspect photos edge to edge from their real
  aspect ratios, with free-order packing by default, an `ordered` variant, trailing-code photo
  hints, full slide chrome and no page number, and hover focus plus click-to-enlarge on live
  surfaces. Spec after three design tracks, a judge and an adversarial review.
---

# `collage`: a mixed-aspect photo collage component

Status: proposed spec, before the adversarial trio (HARD RULE #25). Nothing is built yet.

## 1. Decision

Add `collage` to the `imagery` bucket (`lib/components/imagery/collage/`). An author writes a bulleted list of 4 to 6 photos. The build packs them edge to edge into the space the slide leaves, from each photo's real aspect ratio. On live surfaces, hovering a photo focuses it, clicking enlarges it, and Escape or a click away puts it back where it was.

It is a **justified collage**, not staggered masonry: every tile is a rectangle and every edge is flush. `masonry` and `mood-board` ship as manifest tags so the catalog search finds it.

How it was chosen: three tracks ran the `design-competition` workflow (editorial, reuse-first, robustness-first), a fresh critic reviewed each, one fact-check pass checked the claims against the repo, and one judge scored them (Track 2 8.2, Track 1 7.6, Track 3 6.6). The owner then chose to combine them and set the points in section 2. Full candidate text is in the session record; this file is the spec.

## 2. What the owner decided

1. **Free order is the default; fixed order is a variant (`ordered`).** The packer may reorder tiles to fit. It stays deterministic: the same photos always give the same layout, so PDFs stay byte-reproducible.
2. **The slide has full chrome:** eyebrow, title, subtitle, a description paragraph (the only caption), header and footer. There are no per-photo captions. The paragraph is written above the list and prints in every export.
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

Each pair starts as a last carved to one foot. Leather is cut by hand and finished over fourteen weeks.

- ![Tan derby, apron toe](shoes/tan-derby.jpg) `hero`
- ![Black grained derby, macro](shoes/macro.jpg) `top`
- ![Wingtip brogue, hand-punched](shoes/brogue.jpg) `3:2`
- ![Suede chelsea boot](shoes/chelsea.jpg)
- ![Burnished chelsea pair](shoes/pair.jpg) `hero, bottom`
```

The order an author writes is the order on the slide: eyebrow, title, subtitle, the description paragraph, then the list of photos.

| Piece | Meaning |
|---|---|
| `` `Eyebrow` `` above the heading, `` `Subtitle` `` below it | The existing auto-detected patterns in `lib/base/base.docs.md`. |
| `_header`, `_footer` | The existing Marp directives. |
| Paragraph after the subtitle | The description (the caption) for the whole slide. It sits in the text column, is visible and prints in every export. |
| Alt text | Required. It is the screen-reader label and the label in the enlarged view. It is not drawn on the tile. |

**Slide classes** (after `collage`, any order): `ordered` keeps the written order; `fill` allows up to 8% crop to close empty space (default `tight` crops nothing and leaves a matte); `above` puts the text above the photos (default is beside); `bleed` runs the collage across the whole slide, stretched to the slide's own shape, with the header, footer and page number off and the title on a translucent card; `mirror` is the existing modifier that flips the text side.

**Per-photo hints** go in one trailing inline-code span on that list row, comma-separated: `hero` (largest tile); one focal word `top` `bottom` `left` `right` `center` (which part of the photo stays in view if cropped); a ratio like `3:2` (the shape of a remote image the build cannot measure). The collage consumes the span, so it never renders as the usual metadata pill. **All or nothing:** if any word is unknown, no hint applies, nothing is drawn for the span, and lint names the word. A hint is plain code, not a Segno `{…}` record, so the notation spec is untouched. Hints only ever select from fixed tables; author text never reaches a `style` attribute (HARD RULE #22). Parsing rules: a ratio with a zero part or a part over 1000 is rejected; when a ratio hint and a readable file disagree, **the file wins**; the CLI drops remote images unless `--allow-remote` is passed, and then the ratio hint sizes the placeholder tile (1:1 without one); two photos with the same ratio break ties by written index.

**Rules.** 4 to 6 photos; past six, split into two collages. Written order is always keyboard order and the order `<!-- _focus: item 3 -->` counts in, whatever the picture shows. A collage is **atomic**: it never splits across slides (section 5.3).

## 4. Layout

Base: Track 2 (reuse). The pure kernel `lib/core/collage-pack.js` lays out at build time and emits a flat CSS grid (`ul > li > img`, `minmax(0, Nfr)` tracks, one `grid-area` per tile), so no JavaScript lays out a PDF.

- **Aspect source.** `lib/core/image-dimensions.js` reads each photo's header. **EXIF orientation must be read there** (IFD0 tag `0x0112`, swap w/h for orientations 5 to 8); today `jpegSize` ignores it, so a rotated phone photo would be stamped with the wrong shape. The fix is shared with `image`, which has the same latent bug, so some existing rotated-JPEG slides may change. Unreadable source falls to a plain even grid and lint warns.
- **Free order (default).** Search every guillotine layout (a way to cut the box into rows and columns with straight cuts) over every ordering, by dynamic programming over subsets of the photos. Deduplicate by aspect to bound the work. Rank by empty share first, then score the best candidates with a penalty for a tile that is much smaller than the largest. Ties break on a canonical tree string, so output is deterministic. Prototype on the owner's six photos: about 1% empty, 0% cropped.
- **Ordered variant.** The same search, restricted to splits whose left part is a prefix of the written order. The same prototype measured 0% empty and a smaller smallest tile (size ratio 0.37 against 0.53 for free order).
- **DOM order.** `li` elements stay in written order; only `grid-area` places them. Tab order, ordinals and lint messages all use written order.
- **Photo limit enforced in the kernel.** The packer refuses more than 6 photos and returns the even grid. A subset search over 7 photos took 162 ms and over 8 took 4.8 s in review, so lint alone is not enough: a Playground preview re-rendering while someone pastes a seventh photo must never hang the tab. A test times 6 and 7 photos.
- **Browser path.** `image-dimensions.js` reads files with `fs` and runs only in the CLI (`lattice.js`), so the Playground, Studio and VS Code preview cannot read headers. They use the `image-adaptive.js` pattern instead: `lib/transformers/collage.js` exports `applyToDom`, which measures each photo with `naturalWidth` and `naturalHeight`, holds the section as pending with the same 4 s cap as `image`, packs **once** with the same kernel, and stamps the grid. When the CLI already stamped the grid (`--collage-ar` present), `applyToDom` trusts it and does not measure or repack. Build and browser paths use one kernel and one gap table, and a test asserts they pick the same layout for the same aspects.
- **Fit.** The grid fits the real container with container-query units, so a wrong estimate of the stage costs a little matte and can never overflow. `tight` (default) allows no crop; `fill` allows up to 8%, and the focal word decides where a crop falls.
- **Gaps.** The kernel solves gutters inside the tree, so a tile spanning several tracks keeps its exact aspect.
- **Compositions.** Text beside (default) or above, and `bleed`. Prototype on six mixed photos: text beside packs at 1% empty; text above at 7% empty and smaller tiles, which is why beside is the default.
- **Chrome.** Reuse the existing slide chrome. The description paragraph is written between the subtitle and the list and renders in the text column; the build step confirms which existing body-paragraph slot it uses, and the collage does not claim a trailing-paragraph coda. The component hides the page number by composing the existing `no-paginate` arms in `base.variants.css`, which hide both the `::after` page number and `.lat-pagination`. It does not use `silent`, which would also remove the header and footer. `image.styles.css` records that a single-class rule changed zero pixels and that a doubled class is needed; the collage copies that idiom and ships a pixel test. This overrides the plane-model principle against deleting a page number the author asked for with `paginate:`; the owner decided it. `mirror` is implemented per component, so the collage ships its own `mirror` rule.
- **Registry position.** The collage transform runs before `focus` and `pillTag`, because both read the final `li > code` shape.
- **CSS rules.** Tokens only (#3), no margin (#20; a bare `margin: 0` reset is allowed), typography from the 12-token `--fs-*` set (#4), unlayered (#26), no typed glyphs (#29), the close control drawn as a shape.

## 5. Interaction

### 5.1 States

`IDLE → HOT(i)` on hover or keyboard focus (CSS only). `activate(i)` (click, tap, Enter or Space) goes `OPENING → OPEN`. Escape, a click on the backdrop, the drawn close button or a slide change goes `CLOSING`, a reverse animation to the tile's **live** position, then `IDLE` with focus back on tile `i`. Closing during opening reverses from the current position, with no jump.

### 5.2 Hover

Hover recedes the other tiles with opacity only (no saturation shift, so leather colors stay true). The hovered tile lifts by a bounded amount and its transform origin points at the collage interior, so an edge tile cannot spill off the slide. Recede and ring key on `:focus-visible`, so nothing sticks after a click or a lightbox close. The layout packs once and never repacks after first paint.

### 5.3 Atomic for auto-split

`lib/core/auto-split.js` splits slides one member per page on non-wide decks, and `deriveAxis` (`lib/core/split-envelope.js`) vetoes only `col` and `cell`; any other declared axis missing from the DOM falls through to the `ul`, which maps to the splittable `item`. Review reproduced this: capacity axes `tile`, `figure`, `atomic` and `none` all split a collage. **The collage declares no `capacity.axis` and no `adapt.capacity.axis`**, as `image` and `logo-wall` do, so `capacityForClass` returns null and the slide stays whole. It does not borrow `col`, which would claim the collage reads across. Capacity lint is skipped as a consequence; the `collage-count` lint rule covers the 4 to 6 limit instead. Tests run `structuralSplit` with the real `splitCapacityFrom(manifests)` on a six-photo collage at 1:1 and 4:5 and assert one slide.

### 5.4 Lightbox hosting

One host-agnostic core, `lib/core/collage-lightbox.mjs`: DOM only, no imports, **fully self-contained** so `.toString()` inlining works (`present-transport.mjs` requires every inlined export to close over nothing at module scope). It carries its own small frame-driven glide, with a handle that can reverse mid-flight; `image-adaptive.js`'s `morphFrom` closes over module constants and returns no handle, so it cannot be inlined or reversed. **No `flip-morph.js` extraction and no change to `image-adaptive.js`**, which removes a shared-code commit from the plan.

- **Playground** (same-origin `srcdoc` frame) and **Studio and Present** (slide box is `pointer-events-none`): parent-hosted, the pattern `chart-interact.js` and `video-overlay.js` already use. An in-frame overlay would be clipped to the scaled frame and would never receive clicks in Studio.
- **Exported HTML player:** the core is inlined into the player's single CSP-hashed `<script>` **only when the deck contains a collage** (a `hasCollage` gate, like `hasScene`), because `player-core.mjs` promises that a deck without the feature stays byte-identical. The player's CSP allows `img-src data:` only, so the enlarged image is the photo's already-embedded `data:` asset; no second copy is embedded. It uses a native `<dialog>` with `showModal()` (native focus trap, inert background, Escape, backdrop). **This changes exported bytes, so the QUALITY BAR sign-off applies:** render the demo deck to HTML in dark and light and send both before merge. If sign-off is refused, the fallback is stated plainly: exported HTML does not enlarge images in v1.
- **Audience window in Present** (`docs/src/components/studio/present/stage-window.js`): shows the collage with hover state mirrored from the presenter and **no lightbox in v1**. The presenter's view owns the enlarge. Stated gap.
- **VS Code Marp preview:** collage and hover only, no lightbox. A stated gap.
- **PDF, PPTX, PNG:** a clean static collage. No hover or open state reaches the slide DOM, and no animation runs in export or print.

### 5.4a Security shape (HARD RULE #22)

The parent-hosted lightbox copies frame content (the image source and the alt text) into the docs-site document. That is a fifth shape beyond the four the rule names, and `checkRuntimeMarkupSinks` scans only `lib/runtime`, `lib/plugins` and `RUNTIME_MARKUP_EXTRA_FILES`. The label is set with `textContent` only. The image source is rebuilt from an allowlist (http(s), blob, `data:image/`), as `video-overlay.js` does for its source. Both `lib/core/collage-lightbox.mjs` and `docs/src/playground/collage-host.js` are added to the census, or sanctioned with this justification in the PR.

### 5.5 Scope cut from v1

Stepping between photos, pinch zoom and digit keys move to `followups.d/`. This shrinks the Present and player key surface. v1 opens on click or tap, Enter or Space on a focused tile, and closes on Escape, click-away or the close button.

### 5.6 Input precedence

Parent-hosted hosts lay a hit surface over the collage, because the slide box is `pointer-events-none`. Under `bleed` that surface covers the whole slide, so it discriminates tap from swipe and passes a swipe through, and **Space stays the deck's advance key unless a tile has focus**. 
While open, the lightbox listens in the capture phase and consumes Escape, arrows, Space, wheel and swipe, and traps Tab inside the dialog. When closed, a click on a tile opens it and a tap or swipe anywhere else keeps whatever the host already does. **Open question for review (Present only):** the owner asked for click to enlarge. Track 3 proposed single-tap-advances and double-tap-opens in Present. The implementer confirms each host's existing click handler before wiring and records the result; the spec default is that a tile click opens.

## 6. Export and print

Static collage by construction. `<!-- _focus: item 3 -->` already tags `.lat-focus` and `.lat-recede` on the first list through `lib/transformers/focus.js` (the list stays flat), so a presenter gets a printable focus state with no new code. `_focusStyle: pop` and `blur` scale `li.lat-focus`, so the bounded transform origin of section 5.2 applies to them too, or an edge tile spills. When no build stamp exists (export-to-Marp, an unreadable image, an expired measure cap), the section falls back to an even CSS grid, two columns for four or fewer photos and three for five or six.

## 7. Accessibility

Alt text required. The list keeps `ul` and `li` semantics and written order. The lightbox is `role="dialog"` with `aria-modal="true"`, focus moves to the close control, is trapped while open and returns to the tile that opened it, and background scroll is locked. Keyboard and screen-reader access in frame hosts uses focusable proxy buttons mounted only for the active slide, with the in-frame list `aria-hidden` while they exist. Forced-colors mode maps the focus outline to `Highlight`. Recede never carries information alone. Reduced motion becomes a crossfade.

## 8. Files

**Separate PR first (HARD RULE #17: it builds with only `main`):** EXIF orientation in `lib/core/image-dimensions.js`, with Orientation 1, 6 and 8 fixtures. None of the 16 committed JPEGs carries an orientation other than 1, so no committed slide moves; only users' own decks can change, and they change toward what the browser already shows. **Then:** `collage.manifest.json`, `collage.styles.css`, `collage.transform.js`, `lib/transformers/collage.js`, `lib/core/collage-pack.js`, `lib/core/collage-lightbox.mjs`, `docs/src/playground/collage-host.js`, `examples/collage.md`, `changelog.d/collage-component.added.md`. **Touch:** `lib/transformers/registry.js`, `lib/core/image-dimensions.js` (`stampCollage`), `lattice.js`, `lib/authoring/lint-core.js` (rules `collage-alt`, `collage-count`, `collage-hint`), `PlaygroundApp.tsx`, `docs/src/playground/deck-preview.js` (the in-frame tap bridge), `StudioShell.tsx` (the Studio parent hit-test beside `tapVideoAt`), `single-slide-render.ts`, `lib/export/player-core.mjs` (gated on `hasCollage`), `lib/base/base.variants.css` or the collage styles (the `no-paginate` arms), and `tools/check-ownership.js` (the census entry in 5.4a). Proxy buttons for keyboard and screen-reader access in frame hosts get their own file, `docs/src/playground/collage-proxies.js`, with tests. **Generated, never by hand:** `collage.docs.md`, `collage.gallery.md`, `dist/docs/components.*`. Graduation to the gallery is a separate later commit (#8).

## 9. Tests and evidence

- **Packer:** deterministic; tree counts 1, 2, 6, 22, 90, 394; the ordered variant keeps written order; gap-compensated tiles hit their aspect; every emitted value is finite. **Measure the free-order search time at six photos** before building (the prototype was fast, but it has not been timed).
- **Reader:** EXIF fixtures, and a Chromium arm asserting the build-time aspect equals the browser's `naturalWidth/Height`.
- **Transform:** build and browser paths produce identical output; idempotent; a HARD RULE #22 arm proving alt text and hint words never reach a `style` attribute or markup.
- **Atomic:** the 1:1 and 4:5 deck arms from section 5.3, run through `structuralSplit` with the real `splitCapacityFrom(manifests)`.
- **Free versus fixed order:** a measurement over random mixed photo sets of 4, 5 and 6 photos, recorded in this file, with a pinned test that the free search scores at least as well as the fixed one on the same set (the score weighs empty space and tile-size spread, so its empty share can differ).
- **Page number:** a pixel test that the doubled-class rule hides both the page number and `.lat-pagination`.
- **Hints:** a collage consumes a valid span; an invalid span is left in the markup, not drawn (`collage.styles.css` hides a stray `li > code`), and lint names the word.
- **Lightbox:** every state transition with a fake host, capture-phase Escape, close during opening, focus trap and restore, scheme filter on the image source.
- **Real surfaces (HARD RULE #23):** the Playground and Studio driven with `tools/screenshot.js` at 1440, 820 and 390 px; the exported HTML player opened in real Chromium in dark and light; `tools/pixel-check.js`; `npm run check:jank`; a PDF page with `_focus: item 3`. iOS Safari touch stays **UNVERIFIED** unless driven on a device.
- **Demo deck:** `examples/collage.md` (HARD RULE #9). Nine slides: 4, 5 and 6 photos; free versus ordered; tight versus fill; text beside, above and bleed; a portrait-heavy set with an EXIF-rotated phone JPEG; `_focus: item 3`. The owner's nine shoe photos are not in the repo; the deck uses the existing `lib/samples/photo-{wide,tall,square,pano}` files (plus one new 4:5 sample if needed) until the owner supplies photos they have cleared.

## 10. Known risks

1. Blast radius: a shared reader (the EXIF fix may move existing rotated-JPEG slides), a shared kernel extraction, the registry, and exported bytes. Maker-checker at minimum; this spec goes to the adversarial trio.
2. The stage-aspect estimate only steers which layout wins; the CSS fit against the real container bounds it.
3. Free order puts the picture out of step with keyboard order by design. The mitigation is that `ordered` exists, and tab order and ordinals stay in written order.
4. The player lightbox may be refused at sign-off; the fallback is stated in section 5.4.
5. Export-to-Marp may not carry the grid; the even-grid fallback must be verified and its behavior stated.
6. Full-resolution first paint can stall WebKit; unproven on this surface.
7. A trailing code span is claimed by the collage instead of becoming a pill. That is a documented exception to the metadata-pill rule in `base.docs.md`.

## 11. As built (static component), and where it differs from the sections above

Written after the first build. Where this section and an earlier one disagree, this one is current.

- **Gap.** The packer's gutter is a fraction of the stage height (`DEFAULT_GAP`, 0.012), and the CSS reads the same number as `--collage-gap-ratio`. Section 4's "gap token" wording is replaced by this; the two numbers are pinned by a comment in each file.
- **Frame.** The manifest declares `stage: "canvas"`, so the frame does not wrap the body in a `.cell-stage`. The section's children are the header, the `.cell-masthead` (eyebrow, title, subtitle), the description paragraph, the `.collage-fit`, then the footer. The text-beside layout is a grid on the section itself. A trailing paragraph after the photos still becomes the frame's below-note (it spans both columns); `collage` is in the CSS-only fallback union in `lib/base/base.modifiers.css`.
- **Projection.** `projection.figure` is `bare`, as `image` declares (the schema requires one for an imagery component). `collage` joins `MEDIA_COMPONENTS`; it is not data.
- **Split.** The component declares no `capacity` block; `test/unit/components/collage.test.js` runs `structuralSplit` with the real `splitCapacityFrom` on portrait, square and story decks and asserts one slide, with a splittable control that does split.
- **Lint.** `collage-count`, `collage-alt`, `collage-bg` and `collage-hint` live in `lib/authoring/lint-core.js`. The hint grammar is duplicated there on purpose (lint-core imports nothing from `lib/components`), and a test pins it against `parseHints`.
- **`_focus`.** `focus.js` adds `lat-focus` / `lat-recede` to tile classes between the structure and stamp steps, so both stamp paths match the class token, not the whole attribute. The demo deck's `_focus: item 3` slide caught this: the CLI stamp had silently skipped it.
- **Tags.** `masonry` and `mood-board` joined the tag vocabulary and `SINGLETON_TAGS` (each is used by `collage` alone).
- **Readers (added after the owner asked about documentation, narration and the Guide).** Checked on the real code paths with the demo deck:
  - *Narration.* The generic speech walk skipped the photo list (an image has no text), so a listener heard a title and a paragraph about pictures they were never told about. `speakCollage` in `lib/transformers/prose-projection.mjs` now speaks the prose and then each photo by its alt text, one sentence apiece. An author can still override a slide with `<!-- say: -->`.
  - *Guide and gestures.* Each tile carries `data-label` set to its alt text (`collage.transform.js`; the file is listed in `SANCTIONED_MARK_IDENTITY`). A sentence that opens with the alt lets the Present Guide land its pointer on that tile. Measured with `node tools/sweep-guide-gestures.mjs --deck examples/collage.md`: 75 cues, 100% resolve, 34 of them (45.3%) answered by a mark; before the change, 38 cues, 0 by a mark. The manifest declares `gesture: { archetype: "grid" }`.
  - *Article view.* The media branch re-hosts only the first picture, so a six-photo slide read as one photo. `projectCollage` re-hosts every photo as its own `.lp-figure` in written order, which needs no new CSS in any article host and no change to the exported player's bytes.
  - *Documentation.* `collage.docs.md` and `collage.gallery.md` are generated from the manifest; the metadata-pill section of `lib/base/base.docs.md` records the trailing-span exception; the four lint rules are in `spec/diagnostics.md`.
- **Fixes from the independent check of the built code (all reproduced, all fixed, each with a test):**
  - *Negative tracks.* Two cuts in different branches closer than one gutter gave a track of negative size, which is invalid CSS and voids the whole grid (51 of 2000 random sets). The packer now skips any layout with a track at or below 1e-6, and falls back to the even grid if none is valid. 0 of 300 random sets now.
  - *Dedupe dropped the layout a `hero` needs.* Keying on the outer shape alone left a 53% empty result where another layout leaves 6%, and free order scored worse than ordered in 2.3% of random sets. The dedupe key now carries the tile-area spread and the hero's share, and every candidate is scored (the 250-candidate cut is gone). Six photos take about 24 ms on average and 146 ms at worst. Free order never scores worse than ordered on 300 random sets. `hero` is a scoring preference, not a hard rule: on 8 of 300 random sets no layout let the hero hold the largest tile.
  - *CLI sizes depended on the working directory.* `stampCollage` now takes the deck's folder (`deckBaseUrl`) and resolves deck-relative photos against it.
  - *Live path stamped more than once.* The list moves to `data-collage="measuring"` at once, a WeakSet guards it, the cap timer is cleared on stamp, and a photo that already failed (`complete`, width 0) no longer waits out the 4 s cap.
  - *Silent failures.* A loose list now builds the same collage as a tight one; `*` and `+` bullets are counted; `collage-tail` and `collage-hero-dup` are new lint rules.
  - *An unstamped collage was invisible.* An unstamped list now shows an even grid; only `measuring` is hidden.
  - *Docs said more than the code did.* Click-to-enlarge is out of the manifest until it is built; an unknown hint is not applied and not drawn (the stylesheet hides a stray `li > code`), not "shown as a pill"; the gap and snap constants are pinned between `collage-pack.js` and the stylesheet by a test.
  - *EXIF.* The CLI ignores EXIF orientation until PR #2627 lands, so a rotated phone JPEG gets landscape dimensions there. The demo deck's rotated-photo slide waits for that PR (a follow-up).
- **Lightbox, as built:** `lib/core/collage-lightbox.mjs` is the one opener. `docs/src/playground/collage-host.js` hosts it in the parent document for the Playground (the frame's link guard calls `window.__collageOpen`) and the Studio (`tapCollageAt`, because the slide box is `pointer-events-none`), and loads the opener on the first click so no route carries it at startup. The exported player inlines it only when the deck has a `<ul data-collage>`, in a native `<dialog>`, and reuses the tile's embedded `data:` photo. **The photo is the button, not the `<li>`:** the host (live frames) and the player stamp `tabindex`, `role="button"` and an `aria-label` on the tile's `<img>` at run time, so the list keeps its list semantics. The print and capture frames never run that stamp, so no exported markup carries it; an earlier draft stamped from the frame script and did leak into the Studio export. While open, the lightbox consumes every key, so Home, End and `n` cannot move the deck. A pointer open does not restore focus on close (a native `<dialog>` would otherwise hand it back as keyboard focus and Space would reopen the photo). Enter or Space opens a photo only when it is `:focus-visible`. The player ignores a click that ends a drag of more than 8 px. Stepping, pinch zoom and digit keys are in `followups.d/` (#2635 p1 to p3). Both lightbox files are on the runtime-markup census (`RUNTIME_MARKUP_EXTRA_FILES`). Still open: the Present stage window and the VS Code preview do not enlarge, as §5.4 states, the Studio's own click path (`tapCollageAt`) does not yet tell a mouse drag from a tap, and the player change waits on the owner's dark and light render sign-off.
- **Bleed, as built:** the photos fill the whole slide, stretched to its shape, with the header, footer and page number off, so an author's footer line (for example a confidentiality note) does not show on a bleed slide. The title card is translucent and pinned to the top edge at the frame's left inset. The description shows inside the same card, under the header rule: the section is a one-column grid and the title block and the description are two stacked items with one width and one background.
- **Not yet verified on the real surface:** hover and focus states on a live surface, the live preview packing (Playground and Studio), and the exported player. The PDF and PNG paths are verified by the demo deck render.
