---
status: shipped
summary: A Playground reload still built itself in front of the visitor after #1553 fixed the pane widths, and this is the frame-by-frame record of what was left and how each piece was closed. Measured at 1194x834 with the CPU throttled 6x. In Edit, the cached slide painted at [354,261,824x464] and the live filmstrip arrived at [374,290,784x441] — the slide a person had been reading for three seconds shrank 40px and jumped 29px down; the status line claimed "Ready." when nothing was; the component picker read the catalog's first entry and swapped it; the editor text slid 3px right and 10px down and drifted a further 1.2px per line. In Explore, worse and for more people (it is the pristine visitor's default) — the EDIT layout painted first, so the editor pane held 337px for ~900ms before vanishing and the preview went 856 → 1194. Fixes follow #1563's rule rather than the Studio's shell - server-render the real markup, resolve the client-only bits before paint, and let the app's own stylesheet consume them. The one place a stylesheet could not help - where the live filmstrip puts its slide, which comes from a chain of srcdoc CSS - is closed by MEASURING it at capture and replaying the measurement, with the corollary the adversarial trio had to teach - a measurement is valid only for the box it was taken in, so the replay REFUSES when the pane differs and withdraws if the pane moves under it, rather than rescaling (the rescale was measurably 5-18px out, against a claim that it was exact). The trio changed the diff materially - it withdrew a walk-band reserve that had a permanent-dead-band failure on a plan 404 and was wrong-sized on an ordinary flow, it caught that this change's own headline test could not distinguish a working instant shell from an absent one (the identical trap recorded in the predecessor note), and it found a pre-existing handoff-ordering defect where a child effect consumed the one-shot key before the parent read it, dropping a visitor handed a deck into the Explore gallery instead of the editor holding it. Four overstated claims are corrected in place rather than tidied away, including "before paint" for the editor seed, which is measurably before HYDRATION.
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

*Measuring beats mirroring* is the transferable half of this note — with the corollary the
adversarial trio had to teach me: **a measurement is only valid for the box it was taken
in.** The first draft rescaled the stored rect into a differently-sized pane, and claimed
that "reproduces a centered slide and a top-pinned one exactly." It does not. The filmstrip
centers at `18 + (boxH − h)/2`, because the srcdoc's html padding sits OUTSIDE the box it
centers in, so a slack ratio is off by `18·Δ(boxH)/(boxH − h)` vertically and
`72·Δ(boxW)/boxW` across — predicted 5.08px and 18.09px, measured 5.11px and 18.28px on a
frozen snapshot replayed into a resized window. The rescale was exact only where it did
nothing. So the replay now REFUSES when the pane is not the pane the measurement came from,
and withdraws if the pane changes underneath it. A blank that never moves beats a slide
that jumps; the next capture re-measures and the load after that is exact again.

The hand-off is then a swap in place: `is-live` fades `#preview` in over 0.2s while the
shell fades out from directly behind it, and the shell is torn down only once that fade
has finished. It used to be dropped the instant the iframe *started* fading in, which put
a half-transparent slide over the bare pane for the whole 200ms — invisible while the two
pictures disagreed anyway, obvious once they matched.

**One measured value that is not geometry — and the one that did not survive review:** the
walk bar's height. It mounts only once the component's plan has been fetched, about a second
after the deck is on screen, and takes ~100px off the preview when it does. A draft of this
change reserved that band from a height the app measured and published (`WALK_H_KEY`), spent
by the seed as `--pg-walk-h` on a rule keyed to the bar's ABSENCE.

**It is withdrawn, and the reason is worth more than the mechanism was.** The stored height
is the caption height of *the slide the last session ended on*; the band it reserves belongs
to *the first slide of the next boot*. Those are different slides with different captions, so
the reserve is routinely the wrong size — measured on an ordinary flow (open `math`, step
three slides, come back): 127px reserved against a 184px bar, the deck shrinking 57px at
1.3s. Two geometries, failing this change's own oracle. On a stale deep link it pushed the
deck the OTHER way, 71px downward — which the draft's own text claimed could not happen. And
when the plan fetch 404s (a designed path, and the one a flaky mobile connection takes) the
bar never mounts, so the reserve never comes off: a permanent 109px dead band on a phone,
13% of the viewport, for the rest of the session — a window created on an error path, which
HARD RULE #18 does not excuse.

Withdrawing it also removes the site's only `:has()` dependency, a storage key, and one of
the three "stored measurement" mechanisms this change introduced. What remains is the honest
state: the Explore *layout* no longer assembles, and the walk bar still arrives late and
takes its band when it does. Reserving it correctly needs the first slide's caption height
for the deck about to boot, which is per-deck-per-slide state — a much larger mechanism than
the jump is worth.

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
import — so the two drifting apart is the one way this can silently break. Nine e2e cases
drive the precedence table on the real page and require the pre-paint answer to equal the
hydrated one: a handoff (over a persisted Explore view), `?view=edit`, `?view=read`, the
`?view=explore` alias, a persisted Edit view, a persisted Explore view, an empty draft, a
pristine draft *with content* (which exercises `fp`/`isPristine` rather than the empty-string
short-circuit), and a dirty draft. The `!exploreAvailable` clamp is not covered because it is
not reachable on the built site — `plansBase` is always set — and saying so is better than
implying a coverage that does not exist. An earlier draft of this note claimed five cases
drove "every branch"; they drove five of eight, and the one they missed was rule #1.

**Rule #1 was not merely untested — it was broken, and the seed is what found it.** A
handoff forces Edit, but the app re-read the one-shot handoff key in its startup effect, and
by then a CHILD effect had already consumed it: `EditorHost`'s `onReady` runs
`consumeHandoff` first (React flushes child passive effects before the parent's), measured
deleting the key at t=338ms against the parent's read at t=344ms. `resolveStartupView` then
fell through to `isPristine` — and `applyHandoff` had just recorded the insert hash, so the
draft *was* pristine — and answered `'read'`. A visitor handed a deck from the Studio watched
the editor pane sit there for ~900ms and then got dropped into the Explore gallery, with
their deck loaded in an editor they could not see. The app now takes `hasHandoff` from the
seed, which read the key before anything could consume it. That is a pre-existing defect this
change did not cause; it is fixed here because the parity case that proves the mirror honest
is the same case that exposes it.

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
- **The editor seed is "before HYDRATION", not "before paint" — and an earlier draft of this
  note said paint.** Measured with a PerformanceObserver: first-contentful-paint at 412ms,
  `__pgEditorSeed` set at 694ms. The seed script has to run after the island's markup is
  parsed (it writes into the SSR'd `<pre>`), so the starter deck paints first for ~280ms. The
  window where the wrong deck is on screen drops from ~1.5s to ~280ms, which is the real and
  worthwhile win; "before paint" overstated the artifact, which is exactly what HARD RULE #23
  exists to catch.
- **The capture is off on EVERY single-pane layout, not just "a collapsed preview".** Below
  820px in Edit view the preview pane is `display:none`, so `measureFit` measures a 0-wide box
  and the capture declines — measured null at 390x844 and at 820x1180 (iPad portrait), against
  a valid `v: 2` at 1194x834. This is right rather than unfortunate (there is no visible
  preview to snapshot), and it self-heals the moment the visitor shows the preview pane, but
  the v1 format DID store there and the first draft of this note understated the scope.
- **The status line is now STABLE, not uniformly true.** Two values instead of three on the
  common path, both true. In the collapsed-preview boot it is still three
  ("Loading engine…" → "Preview collapsed — rendering paused." → "…render deferred."), and
  strictly the engine bundle is requested on idle *after* hydration, so at first paint
  "Loading engine…" is a prediction. Stability was the win; the first draft oversold it.
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

## What the adversarial trio changed (HARD RULE #25)

Run against the pushed commit — the code that would actually have merged — after CI was
green and the PR was open. It changed the diff materially, which is the only evidence that a
verification pass was worth running:

- **Both the red team and the independent checker, separately, demonstrated that this
  change's own headline test could not tell a working instant shell from an absent one.**
  `visibleSlide()` falls back from the cached slide to the live one, so "one geometry per
  element" was satisfied by either half alone; with the replay neutered, every assertion
  still passed while snapshot `v: 2`, `measureFit`, the placement and the cross-fade never
  executed. The only visible difference was the first slide at ~490ms instead of ~2400ms,
  which no rect can see. That is the *identical* trap recorded in this note's predecessor and
  quoted in the spec's own header — written by someone who had just read it. A liveness
  assertion now precedes the geometry one, and it is confirmed to fail when the replay is
  sabotaged and pass when it is not.
- **The checker refuted the rescale claim by algebra and then measured it** (§ the fit).
- **The inversion pass asked the question the other two did not**: not "is it correct" but
  "who was fine before and is not now". It found the two mechanisms with unbounded-in-time
  failure states — the walk reserve surviving a failed plan fetch, and the shell no longer
  able to reflow — and made the structural criticism that this change replaced three
  self-correcting DERIVATIONS with three stored MEASUREMENTS, exact when the world has not
  moved and frozen when it has. That framing is why the walk reserve was withdrawn rather
  than patched, and why the shell now withdraws rather than guesses.
- **The red team found the handoff ordering defect** (§ Verification) by fuzzing 20
  storage/URL shapes against the real page: 19 agreed, one did not, and the one was rule #1.

Two claims the trio *cleared* are worth recording too, because they were the ones I was
least sure of: the `:is()` specificity raise has no blast radius (every competing rule
enumerated in the built bundles — no property collision), and the placement mechanism itself
is exact, landing shell and live within 0.15px at four different viewports.

## The rule this leaves behind

> When the pre-paint side and the app must agree on a NUMBER that neither owns — where a
> third party (a stylesheet in an iframe, a library's layout, a wrapped caption) puts
> something — do not re-derive it on the pre-paint side. Have the app **measure** what
> actually happened and publish it, and replay the measurement. A mirror of someone
> else's geometry is a second model of it, and second models drift; a measurement is
> wrong only until the next capture.
