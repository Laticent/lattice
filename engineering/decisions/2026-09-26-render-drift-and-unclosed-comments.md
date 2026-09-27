---
status: shipped
summary: The render tier had drifted 25–50% over its blessed baseline on the blessing machine, and an unclosed `<!--` made the render and the linter quadratic (one 250 KB line: 148 s render, 89 s lint). Bisecting found no single culprit; profiling found two repeat-work costs and five comment readers that rescan from every unclosed opener. What was fixed, what was measured, and what the rest of the drift is.
---

# Render drift since 2026-09-08, and the unclosed-comment quadratics

**Status:** shipped 2026-09-26 on `claude/performance-follow-ups-i9ye53`, from
`followups.d/2248-p2` (re-bless the stale bench rows) and `followups.d/2328-p4` (lint
super-linear on untrusted input). Every number below is one sandbox, `linux/x64, 4× Intel
Xeon @ 2.10GHz, node v22` — the fingerprint `baseline.json` was blessed on, so its wall clock
gates.

## 1. The bench was red for a reason nobody had looked at

`bench:check` on `main` (a325105) failed WORKLOAD on four rows, as the follow-up said: `charts`
rendered 23 slides against a blessed 22, and the CLI page counts were 15/33/43 against
5/9/30. It also failed TIMING, which the follow-up did not mention: `normal` +25%, `math`
+24%, `stress` +50%, confirmed on the second pass. Re-blessing over that would have recorded
a slowdown as the new normal.

## 2. There is no culprit commit

The render tier was last blessed at a2397b0 (2026-09-08, #2129). With the three dataset decks
pinned to today's copies, so only engine code moves, the `stress` row climbs across ~150
commits: ~170 ms → ~185 → ~210 (#2250) → ~230 (#2270 window) → ~260 at HEAD. `charts` climbs
57 → 63 → 68 → 73 → 83 → 86 ms over the last ~50. A `git bisect run` on a threshold landed on
noise (the "bad" commit measured 215.2 ms against a 215 threshold). Each step is inside the
±12% band on its own, so no single PR ever showed a regression.

## 3. Where the time went (CPU profile, a2397b0 vs HEAD, per cold render)

| cost | a2397b0 | HEAD | cause |
|---|---:|---:|---|
| section walk (`split-sections.mjs` DIRTY scan + fallback) | ~6 ms | ~16 ms | #2345 moved every walker onto the tokenizer-backed walk; a render calls it 16–22 times, and 9–10 of those are on a string it already walked |
| CSS comment walk (`eachCssRun`) | ~1.6 ms | ~4 ms | one `urlTokenStart` call per character of a 2.3 MB bundle |
| `lib/engine/css.js` pack + compose | ~15 ms | ~19 ms | the bundle grew 14% (2.02 → 2.30 MB) — feature weight, not code |
| `top-level-h2.mjs` tokenizer | — | ~3.6 ms | nearly all of it is the section walk's own fallback path |

Fixed: the walk memoizes its section-tag offsets for the last four strings (never the pieces,
which callers own), and the CSS walk jumps between the four characters that can open a run.
Same-session means of three alternating runs, `main` → branch: charts 81.2 → 69.0 ms (−15%),
math 75.4 → 63.7 (−16%), stress 261.8 → 224.5 (−14%), normal 74.5 → 72.6 (−3%). All 225
example decks render byte-identical.

**Not fixed, deliberately:** the CSS growth is the price of what shipped; the remaining gap to
a2397b0 is that plus new transforms (panes, pagination, section index). The baseline was
re-blessed at the new numbers, so the ratchet guards them from here.

## 4. The unclosed-comment quadratics

`/<!--[\s\S]*?-->/` scans to the end of the text from every opener that never closes. So do an
alternation with that arm first, a `(?![\s\S]*?-->)` lookahead, a fresh `indexOf('-->')` per
opener, and markdown-it 14.1.1's own `html_inline` comment arm (which it matches against the
rest of the paragraph from every `<`).

| input | render before | lint before | after (each) |
|---|---:|---:|---:|
| one 250 KB line of `<!--` | 148 s | 89 s (1 MB) | 0.1–0.4 s |
| 280 KB of `a <!--` lines | 17 s | 3.7 s | 0.1–0.3 s |
| 250 KB of `<!-- `, one `-->` at the end | — | 2.6 s | < 0.1 s |
| 280 KB of `a <!--` lines + `---->` | 16.8 s | — | 0.2 s |

`lib/core/closed-comments.js` holds the one idea — the next closer, found once and reused
while the scan is behind it — and the lint, masthead, panes, auto-split and layout-gate sites
use it. `scanTags` caches the same way inline. `lib/core/html-inline-guard.mjs` skips
upstream's rule only where its comment arm provably cannot close: `closable[i]` is filled in
one right-to-left pass, because the arm's tokens cannot land on every `-->` (`---->` holds one
and fails). The first cut only asked "is there a `-->`?" and the independent check defeated
it with those five characters.

Every rewrite is fuzzed against the regex or the unguarded parser it replaced
(`test/unit/core/closed-comments.test.js`), and three timing arms pin the linearity, each
proved by reverting the fix it covers.

**Left alone:** `chart-family.js` `proseAttr` keeps its regex — it reads a subtitle's
*rendered* HTML, where markdown-it has already escaped any unclosed `<!--`.

## 5. The WebKit reopen cost: Add slide stays mounted between opens

`followups.d/2391-p3`, confirmed on real WebKit (Playwright WebKit 26, production docs build) and
wider than recorded. The preview pool (`2026-09-13-gallery-preview-memory.md`) stops churn
*inside* an open grid. But the pool lived in the grid, so closing a surface destroyed its frames,
and WebKit never gives a destroyed preview document back. Add slide stranded ~45 MB per reopen
(its frames rebuilt every time), the deck panel's preset tiles ~30 MB. Chromium reclaims them and
stays flat.

### What shipped

`docs/src/components/ui/persistent-surface.tsx`. Add slide (`SlidePicker.tsx`, the desktop dialog
and the phone sheet through `PanelSheet`'s `persistent` prop) mounts on its first open and is
only HIDDEN after that. Its pool never destroys a frame while it is mounted, so a reopen
re-points the frames it already has. The frames stay inside the gallery's own scroller, exactly
as on main, so iOS scrolls them natively with their tiles.

It does not use a force-mounted Radix dialog, for two reasons, both read from the Radix source.
A Radix modal content runs `hideOthers` on mount, which would hide the whole Studio from
assistive tech while the gallery sat closed. A non-modal content still mounts a
`DismissableLayer`: whenever that closed layer is the highest one, it answers Escape for the
whole page with `preventDefault()`, and the Studio's deck navigation honors `defaultPrevented`
(`StudioShell.tsx`). So the surface renders its own dialog element and does the modal work
itself, only while open:

- the element is `role="dialog"` with `aria-modal` only while open, so a closed gallery is
  nothing to anyone, including a `[role=dialog]` selector;
- every other child of `<body>` is `inert` while open, which keeps keyboard focus and assistive
  tech inside;
- focus moves in on open and returns to the launcher on close;
- the backdrop is a Radix `DismissableLayer`, mounted only while open. On the phone, Add slide
  opens over the Deck sheet, which is a Radix modal. Outside Radix's layer stack, that sheet stayed
  the top layer: Escape closed the sheet underneath instead of the gallery (measured). As the top
  layer, the gallery takes Escape first, after any menu opened from inside it. Lower layers ignore
  its taps, and a tap on a tile inserts the slide (7 → 8 slides, both engines, 390 px).

It sits inside a Radix `Dialog.Root`, which renders no DOM, so the shared `DialogTitle`,
`SheetTitle` and close pieces work unchanged; the titles take their ids from the surface.

The adversarial trio reviewed it, and three of its findings changed the design:

- **One host for both layouts.** The phone sheet and the desktop dialog were two components, so
  crossing the breakpoint unmounted one. A phone rotated, or an iPad in Split View, destroyed
  every frame, and the next open minted 12–14 documents. `PanelSheet` now draws the centered
  dialog off the phone (`dialogClassName`), the chrome around the grid is keyed, and the grid
  stays mounted through the crossing. MR-7 pins it.
- **Seen again after a Radix modal.** The drawer's `hideOthers` marks every `<body>` child
  `aria-hidden`, and from the second open on, that includes the kept gallery. VoiceOver found no
  dialog while it was on screen. The surface lifts that mark while open and restores it on close.
  Its own `inert` also spares `[aria-live]` regions, as `hideOthers` does, so a toast raised
  while it is open is still announced. The WebKit-phone test checks the reopened gallery by role.
- **No re-render while closed.** The kept tree re-rendered 71 tiles on every keystroke in the
  editor: 1.10 s of script for 49 characters, against 0.69 s on main (Chromium). `SlidePicker`
  skips the render while it stays closed and catches up when it opens.

The surface also plays main's zoom-and-fade exit before it hides, and it holds the last frame
(`animation-fill-mode: forwards`) and hides in that same frame, as Radix's Presence does. Without
that hold, the frame or three before the hide showed the dialog back at full size and opacity,
and the phone sheet back in its open position. On the owner's iPad that read as "a TV switching
off". It was measured on both engines, and `e2e/add-slide-close.spec.ts` samples every frame of
the close to pin it. Hiding at once dropped the
animation and let a Compose smoke test's "wait until the dialog is gone" pass before the insert
reached the editor.

Two pool changes came out of measuring it:

- **Measure in the layer's own units.** The dialog opens with a zoom from 95%, and a hidden
  element replays its entrance animation each time it is shown. A pass measured mid-animation
  left every preview at 95% of its tile, shifted up and left (screenshot, WebKit, 1440 px).
  `rectOf` now divides out the layer's scale, read against its computed CSS size, which ignores
  transforms.
- **A shape gets its own slot.** A tile whose shape has no free slot used to rewrite a free slot
  of another shape, and the next tile of that shape rewrote it back: two documents on every
  traversal. The gallery's one Mermaid tile did this on every reopen. The pool now makes a new
  slot of the tile's shape: under the ceiling, or one past it when the pool holds no slot of that
  shape at all. It is still bounded by `HARD_MAX_SLOTS`.

### Measured

Real WebKit, 1440×900, production builds on the same box. The script opens Add slide, scrolls
the whole gallery, closes it, and repeats.

| | main | this change |
|---|---|---|
| new preview documents per reopen (iframes + `srcdoc` writes) | 12 + 14, every cycle | **0 + 0** |
| RSS over baseline after each of 6 cycles | +239, +385, +568, +664, +815, +905 MB | +378, +384, +428, +453, +470, +492 MB |
| a reopen after crossing the phone breakpoint and back (Chromium, WebKit) | the gallery remounts | **0** documents |
| script time typing 49 characters after one open and close (Chromium, 3 runs) | 0.66, 0.73, 0.68 s | 0.79, 0.69, 0.72 s |

The dialog's box is identical to main at 1440, 820 and 390. Previews sit on their tiles after an
open, a full scroll and a reopen, on Chromium and WebKit. Keyboard focus never leaves the
dialog across 30 Tabs. The pool oracles (`gallery-preview-metamorphic`) count documents created,
through `docs/e2e/preview-documents.ts`, because an element count cannot see a frame rebuilt in
place. MR-3's "closing releases every document" is restated as what it guarded: no per-open
residue, and a reopen that makes no documents. The WebKit-phone test asserts the reopen.

**Scope.** This change made only Add slide persistent. The deck settings and Present's overview
followed in the next PR (below).

**Open, recorded, not fixed here:**
- Hidden frames keep their event loops running (the inversion review measured rAF at full rate).
  That is idle today, but an animated preview would burn CPU all session.
- On Chromium, a reopen shows no previews for 60–200 ms while the pool re-points them, because the
  hidden tiles all left the band. No documents are made.

**On a real iPad (the owner, 2026-09-27):** fast scrolling shows no bounce, and closing shows
no flash. Both were checked against the preview deploy of `bbe4b31`.

**Still unverified on a device:** the memory itself, read from Safari's Web Inspector across
reopens; VoiceOver on the phone's second open; and a rotation with the gallery open. The WebKit
figures above come from Playwright's WebKit on Linux, the same engine as iOS Safari but a
different memory manager.

### The deck settings and the slide overview stay mounted too

The follow-up (`followups.d/2391-p3`, now deleted). The same WebKit cost, on two more surfaces:
the deck settings' preset tiles, and the grid Present opens on `g`. Both now mount on their first
open and are only hidden after that. The shared pieces are in `docs/src/components/ui/keep-mounted.tsx`.

- **The overview** (`SlideOverview.tsx`) is the simple case. It is an absolute layer inside
  Present, so it renders once, hides by class while closed, and drops `role="dialog"` then. A
  `Frozen` wrapper skips its re-render while closed, because Present re-renders on every slide
  change. It lives as long as Present does: closing Present unmounts it.
- **The phone's settings sheet** passes `persistent` to `PanelSheet`. That is the same
  `PersistentSurface` Add slide uses, frozen while closed.
- **The docked settings (desktop, tablet)** could not simply stay mounted. The column is a
  react-resizable-panels `Panel`, and the set of panels in the group is the key the Studio stores
  each layout's widths under (`splitPanelIds`, and the pre-paint boot that reads the same bucket).
  A column that stayed in the group while closed would move every "settings closed" layout to a
  new bucket. So the column is now an empty slot, and `SettingsDock`
  (`docs/src/components/studio/settings-dock.tsx`) draws the panel over it. The dock is absolute in
  `<main>` and copies the slot's box from a ResizeObserver callback, which runs after layout and
  before paint, so a drag of the handle moves it in the same frame. The whole panel moves as one
  piece, scroller and frames together. That is the line the frame dock crossed and this does not
  cross: iOS still scrolls the frames natively with their tiles. The dock sits before the split
  on desktop, where the column is first, and after it on tablet, where it is last, so the tab
  order still follows the screen. Crossing between desktop and tablet therefore remounts it; the
  column moves sides there anyway.
- **What used to reset by remounting still resets on each open.** The content under the preview
  pool is keyed on a show counter (`useShowCount`), so every open starts it fresh (open sections,
  a half-typed field) while the pool outside the key keeps its frames and re-points them at the
  new tiles. The chrome above the body is keyed the same way. The deck scroller returns to the
  top through `ScrollTopOnMount`, keyed on the same counter and rendered inside the kept content.
  A reset run from the parent was a no-op on desktop, because the dock is still `display: none`
  for one render after it opens; the new e2e test caught it at 574 px.
- **A Slide → Deck switch no longer rebuilds the tiles either.** The deck body stays mounted,
  hidden and frozen, under the Slide scope. The Slide body has no previews, and it still mounts
  per switch.
- **Hidden by class and by attribute.** The Studio's stylesheet has no `[hidden]` rule that beats
  `flex`. The first build hid the dock with the attribute alone, and the closed panel stayed
  drawn where it last was. The class does the hiding. The attribute is also set, for code that
  reads the DOM rather than the CSS (jsdom, testing-library); a Studio unit test read the closed
  panel's live region without it. (`engineering/gotchas/studio-playground.md`.)
- **A hint no longer pops up when a panel hands focus back after a tap.** The persistent sheet
  returns focus to its launcher on close, as a Radix dialog does. Radix opens a tooltip on any
  focus that no pointer press just preceded, so after a tap on a phone the Settings button's
  hint appeared over the toolbar. main's non-persistent sheet left focus on `<body>`. `Tip`
  (`docs/src/components/ui/tooltip.tsx`) now opens on focus only when the focus is
  `:focus-visible`, which is the browser's own test for a keyboard focus. Tab and hover behave as
  before. The same case was latent on Add slide's launchers.

**Measured** on Playwright WebKit, 1440×900, production builds on the same box. The script
(`.scratch/perf/webkit-panel-mem.mjs`) opens the surface, scrolls every scroller in it, closes it,
and repeats six times.

| | main | this change |
|---|---|---|
| deck settings: new preview documents per reopen | 8, every cycle | **0** |
| deck settings: RSS over baseline after each cycle | +31, +99, +91, +119, +177, +197 MB | +16, +14, +24, +39, +60, +39 MB |
| overview: new preview documents per reopen | 14, every cycle | **0** |
| overview: RSS over baseline after each cycle | +0, +88, +135, +172, +188, +260 MB | −1, −5, −5, −4, −3, −1 MB |
| script time typing 49 characters after one settings open and close (Chromium, 3 runs) | 0.95, 0.98, 1.06 s | 1.05, 0.99, 0.93 s |

Screenshots of the settings open, closed and reopened at 1440, 820 and 390 px are
pixel-identical to main (Chromium), except the tooltip above, which is now fixed.
`docs/e2e/settings-reopen.spec.ts` pins it on the desktop, tablet (820 px), mobile and
WebKit-phone projects. Two reopens must make 0 documents and open at the top, and a closed overview
must not be a dialog. Against main, that spec fails: 16 documents from two deck-settings reopens,
and documents on the overview's reopens.

### The residue after an Add slide reopen is a plateau, not a leak

`followups.d/2398-p2` (now deleted) asked whether the RSS still rising after #2398 (+378 → +492 MB
over 6 cycles, with 0 new documents) would plateau. It does. Two runs of 14 cycles on the same
Add slide code (Playwright WebKit, 1440×900, same box):

- run A: +192, +327, +379, +469, +532, +599, +447, +528, +567, +614, +549, +530, +551, +591 MB;
- run B: +177, +913, +944, +943, +1050, +1041, +1076, +391, +476, +489, +545, +369, +435, +273 MB.

New documents per reopen are 0–2 in the first four cycles, while the pool grows its slots from 13
to 15 frames, and 0 after that. Run A levels off from cycle 5 at +450 to +610 MB. Run B climbs past
+1 GB and then WebKit gives most of it back at cycle 8, ending at +273 MB. So the growth after a
reopen is memory WebKit reclaims later, not stranded documents. The level varies by run by
hundreds of MB, so a 6-cycle read of it says nothing about a leak. The number to watch is the
document count. These are Linux WPE figures: iOS Safari runs the same engine under a different
memory manager, and the device check in `followups.d/2398-p1` is still the only read of that.

### Tried first, and why they failed

- **A frame dock** (built, reviewed by the adversarial trio, then removed). One set of frames
  for the whole Studio sat in a layer at the end of `<body>`, and CSS anchor positioning pinned
  each frame to its tile. Reopens made 0 documents and deck-panel memory stayed flat. But on a
  real iPad, the previews trailed their cards and snapped back on every fast scroll. iOS runs
  scrolling on a separate thread, and an anchored element outside the scroller follows a beat
  late. No setting on our side changes that. The trio's review had also found the design's
  other costs: tile overlays hidden under the frames, one surface's frames showing through
  another's, and frames left drawn through a close animation.
- **Posters** (capture a settled frame into an SVG `foreignObject`, show a WebP on reopen): built
  and reverted. Each capture is itself an SVG-image decode that WebKit also keeps (~3.5 MB), so a
  scrolled gallery grew as on main (+493 → +1097 MB against +391 → +1070 MB).
- **Parking frames between opens:** needs a state-preserving DOM move; `Element.moveBefore` is
  Chromium-only (measured absent on WebKit 26).
