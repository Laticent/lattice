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

**Scope.** Only Add slide is persistent. The deck panel's preset tiles (the inspector, and its
phone sheet) and Present's overview still rebuild their frames on each reopen, as on main. That
work stays in `followups.d/2391-p3`, which now has the primitive to use.

**Open, recorded, not fixed here:**
- Hidden frames keep their event loops running (the inversion review measured rAF at full rate).
  That is idle today, but an animated preview would burn CPU all session.
- On Chromium, a reopen shows no previews for 60–200 ms while the pool re-points them, because the
  hidden tiles all left the band. No documents are made.

**Unverified:** a real iPhone or iPad. The design puts the frames back where main had them, in
the scroller, so it should scroll exactly as main does. That still needs the owner's device to
confirm.

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
