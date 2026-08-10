---
status: shipped
summary: A Playground reload still built itself in front of the visitor after #1553 fixed the pane widths, and this is the frame-by-frame record of what was left and how each piece was closed. Measured at 1194x834 with the CPU throttled 6x, sampling every animation frame from document start. In Edit, the cached slide painted at [354,261,824x464] and the live filmstrip arrived at [374,290,784x441] — the slide a person had been reading for three seconds shrank 40px and jumped 29px down; the status line claimed "Ready." when nothing was; the component picker read the catalog's first entry and swapped it; the editor text slid 3px right and 10px down and drifted a further 1.2px per line. In Explore, worse and for more people (it is the pristine visitor's default) — the EDIT layout painted first, so the editor pane held 337px for ~900ms before vanishing, the preview went 856 → 1194 → 1194x619, and the mode toggle lit the wrong icon. Every fix follows #1563's rule rather than the Studio's shell - server-render the real markup, resolve the client-only bits before paint, and let the app's own stylesheet consume them. The one place a stylesheet could not help - where the live filmstrip puts its slide, which comes from a chain of srcdoc CSS - is closed by MEASURING it at capture and replaying the measurement, so there is no second model of the filmstrip's geometry to drift. Result - one geometry per element, in both views, pinned by a per-frame sampler that fails with the whole log printed. Two residues stated rather than averaged away - a markdown heading can still re-wrap when CodeMirror bolds it, and the shared site header's palette select still fills in after hydration.
---

# The Playground stopped assembling in view

**Date:** 2026-08-10 · **Status:** shipped · **Issue:** #1563 · follows #1553

## What was left after #1553

#1553 gave the two panes their remembered widths before first paint and brought the
dead snapshot replay back to life. The reporter still called the surface janky, and was
right: the *page* was correct, the *page being built* was still on screen.

Measured on the built site at 1194x834 (iPad landscape) with the CPU throttled 6x,
sampling every animation frame from document start through a reload. Reloading
`/playground/?view=edit` with a dragged split:

| element | what a person saw |
|---|---|
| the slide | cached at `[354,261,824x464]` (t=781ms) → live at `[374,290,784x441]` (t=4265ms) |
| `.pg-status` | "Ready." (t=469) → "Loading engine…" (t=1978) → "Rendered 1 slide(s)." (t=3350) |
| `#pg-template-trigger` | "actors (draft differs)" (t=469) → "verdict-grid" (t=1978) |
| `#pg-step` | "—" (t=469) → "Title" (t=2462), on a control disabled in Edit |
| the editor text | placeholder at (34,155) → CodeMirror at (37,165), drifting 1.2px more per line |

And reloading `?view=read` — which is where a **pristine** visitor lands, so it is the
first paint most people get:

| t | editor pane | preview pane |
|---|---|---|
| 487ms | **337px wide** | 856px |
| 1349ms | **gone** | 1194px |
| 1428ms | — | 1194x619 (the walk bar arrived) |

Three layouts, the first of them a two-pane editor the visitor never asked for.

## The rule applied, and where it ran out

#1563's recommendation, kept: **do not port the Studio's shell.** It is right about the
principle — one paint, never corrected in view — and expensive in its mechanism, a
second model of the layout whose drift 21 of this repo's decision notes are about.
Instead: server-render the real markup, resolve the client-only bits before paint, and
let the app's own stylesheet consume them.

Four of the five fixes are exactly that.

**The boot view.** `body[data-view]` is the largest piece of client-only state here: in
Explore it removes the editor pane, takes the preview full-bleed, drops both pane labels
and moves the walk bar to the foot of the column. The app resolved it in a mount effect.
It is now resolved by the pre-paint script — which *already computed the same answer* to
gate the snapshot replay — and published as `<html data-pg-view>`; `playground.css` reads
it through `:is(:root[data-pg-view='read'], body[data-view='read'])` aliases, and
`adoptBootSeed` hands ownership to the app in one step at mount. `data-pg-pane` rides
along for the phone's single-pane layout.

**The mode toggle.** `is-active` comes from the island's `view` state, which defaults to
Edit, so an Explore boot server-rendered the pencil lit. Two rules keyed on the seed
neutralize the server's class and light the right icon; both die with the attribute, so
there is no window where the class and the seed disagree.

**The toolbar's values.** A value the server cannot know is not a value; it is a promise
the page breaks a second later. The component picker now renders nothing until the island
can say something true (`pending`), the Step dropdown shows a value only where stepping is
possible, and the status line starts at "Loading engine…" — which is what the page is
actually doing — instead of "Ready.", which was false at first paint and 57px narrower
than its successor.

**The editor placeholder.** Its metrics are now CodeMirror's, taken from the same
`editor.js` theme the editor is built from — 13.5px/1.6, `padding: 14px 2px 14px 43px`,
and the `@media (pointer: coarse)` bump to 16px that iOS forces. And its TEXT is now the
visitor's own draft, written in by the pre-paint script and rendered from the same value
by React, rather than the starter deck the build knows and the editor is about to replace.

**Where the rule ran out** is the slide itself. The live filmstrip's geometry comes from a
chain inside its srcdoc — `html,body{padding:18px}` applying to *both* elements, so the
usable width is `frameW - 72` and not the `- 32` the replay assumed, plus
`justify-content: safe center` over a FIT-clamped deck height. Re-deriving that chain in
the replay would have been a second model of a layout the srcdoc's own CSS owns: the
Studio's disease, in miniature. So the app **measures** its own live slide when it
captures the snapshot and stores the rect in the replay box's coordinates
(`snap.fit`, with the box size it was taken in); the replay puts the cached slide exactly
there, rescaling if the pane has changed since. If the filmstrip's padding changes
tomorrow, the next capture records the new answer and nothing in the replay needs to know.

*Measuring beats mirroring* is the transferable half of this note.

The hand-off is then a swap in place: `is-live` fades `#preview` in over 0.2s while the
shell fades out from directly behind it, and the shell is torn down only once that fade
has finished. It used to be dropped the instant the iframe *started* fading in, which put
a half-transparent slide over the bare pane for the whole 200ms — invisible while the two
pictures disagreed anyway, obvious once they matched.

**One measured value that is not geometry:** the walk bar's height. It mounts only once the
component's plan has been fetched, about a second after the deck is on screen, and takes
~100px off the preview when it does. Nothing in CSS can know it — it is the caption's
height, so it depends on the text and the width. The app publishes its own measurement
(`WALK_H_KEY`, `{w, h}`), and the seed spends it as `--pg-walk-h` on a reserve keyed to the
bar's ABSENCE, not to hydration — the gap runs from first paint until the bar exists, well
past the island's mount. Width-qualified, because a desktop height says nothing about a
phone where the caption wraps to four lines. With no stored measurement (a first visit) the
fallback is 0 and the load behaves as it always did; there is nothing to guess with, and a
wrong guess would move the deck in the opposite direction.

## Verification

Per HARD RULE #23, on the real built surface, at the card's conditions
(1194x834, CPU 6x, `astro preview` on a production build), driven through the real
controls — the divider dragged, the view reached the way a visitor reaches it.

**Edit reload**, same experiment as the table above:

| element | before | after |
|---|---|---|
| the slide | 2 geometries (824x464 → 784x441) | **1** — `[374,290,784x441]` from t=649ms |
| `.pg-bar` | 1 | 1 |
| `#pg-split-editor` | 1 | 1 |
| `#pg-split-preview` | 1 | 1 |
| `.pg-status` | 3 values, one of them false | 2, both true |
| `#pg-template-trigger` | wrong value, then right | empty, then right |
| `#pg-step` | "—" → "Title" while disabled | 1 |

**Explore reload:** the preview pane goes from 3 geometries to **1** (`[0,114,1194x619]`
from t=436ms), the editor pane and pane labels are absent from the first frame rather
than removed a second in, and the walk bar lands in the band that was reserved for it.
Re-measured at 390x844 with touch: `#pg-split-preview` is `[0,164,390x571]` for the whole
load and the walk bar lands at exactly y=735 (164+571).

Pinned by `docs/e2e/playground-first-paint.spec.ts` — a per-frame sampler that records one
entry per DISTINCT rect and fails with the whole log in the message. Confirmed to fail on
the pre-change build with exactly the numbers above, and the boot-view parity cases fail
there too (the seed did not exist). The @smoke case runs per-PR, for the reason #1553's
did: the failure is silent, everything still ends up correct, and a nightly-only guard
would surface a regression a day after merge.

The seed is a **mirror** of `resolveStartupView` — an inline pre-paint script cannot
import — so the two drifting apart is the one way this can silently break. Five e2e cases
drive every branch of the precedence table on the real page and require the pre-paint
answer to equal the hydrated one. That is the guard the split seed shipped without.

## Residues, stated rather than averaged away

- **A markdown heading can still re-wrap.** CodeMirror renders headings and bold spans in
  a heavier face, which is wider, so a line carrying them may wrap a word earlier than the
  plain-text placeholder does. Matching it would mean tokenizing markdown in the
  placeholder — a second highlighter to keep in step with the first. Every plain line now
  lands exactly; measured at 1194, the placeholder's text column is 491.84px against
  CodeMirror's 491.70px.
- **`--pg-editor-gutter: 37px` is the two-digit case.** The gutter is CodeMirror's own
  computation (line-number column + the 0.9em lint gutter + a 1px border), so a deck of
  100+ lines widens it. The e2e case measures the real pair rather than trusting the
  arithmetic, so a drift fails loudly instead of quietly.
- **The shared site header's palette select still fills in after hydration** — empty at
  first paint, "Cuoio" a second later. Same disease, different owner: it is
  `docs/src/components/site/`, on every page of the site, and fixing it there is a change
  to shared chrome rather than to this surface. Genuinely pre-existing and off this
  change's path (#18), logged here rather than pulled into the diff.
- **Explore has no instant shell.** The replay is deliberately Edit-only — a gallery or
  plan deck has no stable draft-source identity, so replaying one could flash the wrong
  deck. Explore's preview is therefore the pane's solid brand fill until the engine
  renders. That is a blank, not a jump: the BOX no longer moves, which is what this change
  was about.
- **A snapshot with no measurable fit is no longer stored at all.** If the pane cannot be
  measured (a collapsed preview, a frame with no wrap), the capture returns null, which
  keeps the PREVIOUS good snapshot rather than overwriting it with one the replay would
  reject. The snapshot format is `v: 2`; a `v: 1` snapshot from before this change is
  declined, so the first load after deploying costs one visitor one un-shelled reload.
- **iPadOS Safari is UNVERIFIED.** Every measurement here is desktop Chromium at iPad
  dimensions, and this sandbox cannot reach a real device (Chromium gets
  `ERR_CONNECTION_RESET` to the deployed preview through the egress proxy, though `curl`
  gets 200). It is the device that surfaced two of the three defects #1553 fixed, and the
  `(pointer: coarse)` editor bump above is precisely the kind of thing it would catch.
- **The `pane` mount race is fixed as a side effect, and worth naming.** `pane` used to
  initialize to `'edit'`, so an Explore boot wrote `data-pane='preview'` (startup effect),
  then `'edit'` (the mirror effect, from the not-yet-updated state), then `'preview'` — the
  phone's single-pane layout flipping to the editor and back. It now initializes from the
  same seed. `pane` drives no markup, only that attribute, so reading a browser global in
  the initializer cannot desync hydration.

## The rule this leaves behind

> When the pre-paint side and the app must agree on a NUMBER that neither owns — where a
> third party (a stylesheet in an iframe, a library's layout, a wrapped caption) puts
> something — do not re-derive it on the pre-paint side. Have the app **measure** what
> actually happened and publish it, and replay the measurement. A mirror of someone
> else's geometry is a second model of it, and second models drift; a measurement is
> wrong only until the next capture.
