---
status: shipped
summary: >
  Present has TWO presenter cockpits and NO audience surface. The overlay carries the slide
  plus Exit, lens picker, Slides/Rehearse/Fullscreen pills, flanking arrows, transport, CC/Voice/
  Guide and the rail — none of it conditional, the top bar has no auto-hide and the transport pill
  is documented always-on — so projecting Present shows the room the presenter's instruments, and
  Fullscreen makes that bigger rather than cleaner. The second window duplicates the role: current
  + next + notes + timer is a cockpit too. #1805 read this as a naming collision ("Present" vs
  "Presenter screen") and scored nine labels; the collision is a SYMPTOM — two things are both
  named after the presenter because two things both ARE presenter views. Fix is architecture C:
  the overlay STAYS the presenter's console and gains notes + next slide; a new chrome-free STAGE
  window carries the deck to the projector while the browser stays on the laptop. The Stage is
  nearly free — `buildStageDoc()` already produces exactly it (self-contained, fit-scales the
  current slide to fill the window, zero chrome, driven by `postMessage({pv:i})`), and
  `autoPlacePresenter()` already has the Window Management code to find the external screen; today
  it points the wrong window at it. Captions, the guide pointer and the rail follow the deck to the
  Stage because they are aimed at the ROOM; transport, timer, notes, next, lens and the slide grid
  stay with the presenter. Naming then re-scores against a DIFFERENT object — the audience's window,
  not the presenter's — and #1805's leaders invert: Backstage 53→33 and Prompter 53→36 both score 1
  on role-true, since backstage and a prompter are definitionally what the audience cannot see.
  Stage wins at 57/60, is already the codebase's own word for this object (`buildStageDoc`,
  `#latt-stage`, `pp-stage`) with no user-visible collision, and measures 86px — narrower than
  "Rehearse". Three colliding names are DELETED rather than renamed. Auto-fullscreening the Stage
  popup is UNVERIFIED and stated as such; the export player's own "Present mode" is a fifth sense
  of the word and stays out, because its bytes need sign-off. SHIPPED — §8 records what the
  implementation had to settle that this note did not: the audience chrome has TWO hosts rather
  than one (the Stage when there is one, the console's own dock when there is not, never both),
  the rail stays interactive on both, the retired window's talk clock came back to the console,
  and `S` opens the Stage.
---

# The Stage / console split, and why the rename could not have fixed it

#1805 asked for a rename. The Present overlay is reached by a button labeled **Present**, and
one of the controls inside it is labeled **Presenter screen** — the agent-noun of the same
verb. The issue scored nine candidate labels and recommended *Backstage* or *Second screen*.

The rename is the right instinct aimed at the wrong layer. Below is why, what replaces it, and
what the words become once the architecture is honest.

## 1. What is actually on each surface today

**The Present overlay** (`docs/src/components/studio/PresentOverlay.tsx`), an opaque
`fixed inset-0` layer in the main window:

| Band | Contents |
|---|---|
| Top bar (`:1298`) | Exit ✕ · lens picker · zoom % · Slides · Rehearse · Fullscreen · Presenter screen |
| Middle | ‹ arrow · a letterboxed 16:9 slide card · › arrow · coach pill · first-run hint |
| Dock (`max-w-[760px]`) | caption band · transport pill (Play · `7 / 24` · pace) · CC · Voice · Guide · section title · progress rail |

**The presenter popup** (`present/presenter-window.js`): current slide (large) · next slide ·
speaker notes · clock · Reset timer · Prev/Next.

Both are presenter-facing. **Neither is audience-facing**, and there is no third thing.

## 2. The defect that follows

The top bar carries no visibility condition — it is a direct child of the dialog with no
opacity binding — and the transport pill is documented in-file as "always-on". `revealed`
gates only the CC/Voice/Guide cluster's opacity, and `pointerHidden` hides the *cursor*, not
the chrome.

So when the deck is projected, **the room sees the Exit button, the lens picker, the four
staging pills, the slide counter and the progress rail.** Fullscreen (shipped in #1796) makes
that display-filling; it does not make it clean. There is no state of the product in which an
audience sees only the deck.

That is why the name would not settle. Two things are both named after the presenter because
two things both **are** presenter views. Any label chosen for the second one is arranging deck
chairs on a surface that should not have existed in that shape.

## 3. The role model

Three roles. The sharp edge is that "chrome" is not one thing — some of it is aimed at the room:

| Role | Contents | Who looks at it |
|---|---|---|
| **Audience surface** | the slide · captions · the guide pointer · the progress rail | the room |
| **Presenter surface** | next slide · notes · timer · transport · lens · slide grid · exit | the presenter |
| **Preview panel** | the editing render | the author, while writing |

Captions are an accessibility feature *for the room* — they only work on the screen the room is
watching. The guide points at the text being narrated, so it aims the audience's attention.
Both belong on the audience surface, not with the controls. The rail is a taste call, settled
as audience-side.

## 4. Two architectures, and why C

**S — move the browser to the projector.** The main window becomes the audience surface and
sheds its chrome once a console is open; the popup grows into the full console. Familiar (the
Google Slides flow) and the audience surface is the most robust window — it cannot be
popup-blocked. But every control has to be re-implemented inside a hand-rolled string-built
document with inline JS, and the presenter's whole browser — tabs and all — sits on the
projector for the length of the talk.

**C — send a deck window to the projector.** The Present overlay *stays* the presenter's
console (it is already 90% one) and gains notes + next slide. A new chrome-free **Stage**
window carries only the deck. The browser never leaves the laptop.

C is chosen, and it is far cheaper than it sounds because **the Stage already exists as a
primitive.** `buildStageDoc()` produces exactly it: a self-contained document that fit-scales
the current slide to fill the window with no chrome, listening for `{pv: index}`
(`presenter-window.js`, the stage script's `message` listener). It is what the popup already
feeds its two iframes; opening it as a top-level window instead of an iframe is a small change.
`autoPlacePresenter()` already holds the `getScreenDetails()` code that finds the external
screen — today it points the **wrong** window at it.

C also **deletes** the colliding vocabulary instead of renaming it: "Presenter screen",
"Presenter view" and the "PRESENTER" chip all go away, because the presenter's surface is just
Present.

The honest cost of C is that the room is looking at a popup. Mitigations: it is fullscreen on a
display nobody clicks, and the console shows an explicit "Stage disconnected — reopen" state
rather than failing silently.

## 5. The name, re-scored against a different object

#1805 scored names for **the presenter's** window. Under C the new window is **the
audience's** — the opposite object — so this is a re-score, not an extension.

Axes: Role-true ×3 · Conflict-free with "Present" ×3 · Guessable ×2 · No in-product collision
×2 · Compact ×1 · Tone ×1. Max 60. Compact is scored from **measured** pill width (Outfit 600
at 13px, including icon, gap, padding and border), not estimated — which also corrected #1805,
where *Second screen* was scored 1/5 on compact against the shipping label's 2/5 while actually
measuring 18.6px **narrower** than it.

| Candidate | Role-true | Conflict-free | Guessable | No collision | Compact | Tone | **Total** | Width | *#1805* |
|---|---|---|---|---|---|---|---|---|---|
| **Stage** | 5 | 5 | 4 | 5 | 5 | 4 | **57** | 86px | — |
| Audience | 5 | 5 | 4 | 5 | 3 | 4 | 55 | 112px | — |
| Show | 5 | 5 | 3 | 4 | 5 | 4 | 53 | 84px | — |
| Onstage | 5 | 5 | 3 | 5 | 4 | 3 | 53 | 105px | — |
| House | 5 | 5 | 2 | 4 | 5 | 3 | 50 | 90px | — |
| Cast | 4 | 5 | 5 | 2 | 5 | 3 | 49 | 76px | — |
| Room | 4 | 5 | 3 | 3 | 5 | 4 | 48 | 85px | — |
| Screen | 3 | 5 | 5 | 3 | 4 | 3 | 47 | 94px | — |
| Second screen | 3 | 5 | 4 | 4 | 1 | 3 | 44 | 151px | *52* |
| Podium | 2 | 5 | 2 | 5 | 4 | 4 | 43 | 99px | *49* |
| Mirror | 3 | 5 | 3 | 2 | 5 | 3 | 42 | 90px | *41* |
| Monitor | 2 | 5 | 3 | 4 | 4 | 3 | 42 | 101px | — |
| Project | 4 | 4 | 3 | 2 | 4 | 3 | 41 | 96px | *37* |
| Lectern | 1 | 5 | 2 | 5 | 4 | 4 | 40 | 100px | — |
| Marquee | 2 | 5 | 2 | 4 | 3 | 3 | 39 | 108px | — |
| Wings | 1 | 5 | 1 | 5 | 5 | 3 | 38 | 89px | — |
| Cues | 1 | 5 | 2 | 4 | 5 | 3 | 38 | 79px | — |
| Console | 1 | 5 | 2 | 4 | 4 | 3 | 37 | 102px | *41* |
| Green room | 1 | 5 | 2 | 5 | 2 | 3 | 37 | 130px | — |
| Confidence | 1 | 5 | 2 | 5 | 2 | 3 | 37 | 125px | — |
| Prompter | 1 | 5 | 1 | 5 | 3 | 3 | 36 | 113px | *53* |
| Notes | 1 | 5 | 1 | 2 | 5 | 5 | 34 | 87px | *50* |
| Backstage | 1 | 5 | 1 | 3 | 3 | 4 | 33 | 120px | *53* |
| *Presenter screen* | 1 | 1 | 1 | 4 | 1 | 3 | 20 | 169px | *38* |

**The inversions are the point.** *Backstage* (53 → 33) and *Prompter* (53 → 36) both score 1
on role-true, and not as a quibble: backstage is definitionally the part of the theater the
audience **cannot** see, and a prompter exists to be invisible to the room. *Notes* (50 → 34)
fails the same way — notes are the one thing that must never reach the audience screen. Each
was a good answer to the question #1805 asked, and each teaches the wrong model here.

*Cast* is the trap worth recording: guessable 5, because Chromecast and AirPlay taught everyone
the word — which is exactly why it scores 2 on collision. It promises network casting to a
device, and this is a window on a wired display. Highest guessability on the board, attached to
the wrong mechanism.

*Mirror* (41 → 42) and *Project* (37 → 41) both **improved** under C for real reasons — the
Stage genuinely mirrors the console's slide now, and projecting is finally the right verb — and
both still lose, to CodeMirror saturation and to project-as-noun in an app with a deck library.

**Stage, 57.** Role-true 5. No collision 5: there is no user-visible "Stage" label anywhere in
`docs/src` — every hit is internal (`buildStageDoc`, `#latt-stage`, `pp-stage`, `motion-stage`)
and every one of them names *this exact object*, so adopting it is alignment rather than
collision. Guessable 4 rather than 5 because it wants one tooltip, after which the Present/Stage
pair teaches itself. Compact 5 at 86px — narrower than "Rehearse" (113px), so it drops into the
staging cluster without moving the label breakpoint.

## 6. The vocabulary that results

> **Preview** what you're writing · **Rehearse** it · **Present** to drive · **Stage** for the room.

One new word; three deleted. `Preview` is fixed by prior art and unchanged; `Rehearse` was
already in the same family.

## 7. What this does not cover

- **Auto-fullscreening the Stage popup is UNVERIFIED.** Whether a popup can fullscreen itself
  on load from the opener's gesture needs a real two-monitor desktop, which the sandbox is not
  (HARD RULE #23). If it does not work, C costs one extra press of `f` and is otherwise intact.
  Detect to decide whether to offer; verify the outcome to decide whether it worked.
- **The exported HTML player has its own "Present mode"** — a fifth sense of the word, alongside
  the overlay, the shell button, the popup and the `present:` front-matter key for PDF. It
  changes export bytes, so it is out of scope here and needs sign-off with dark + light renders.
- **#1805 is superseded, not merely deferred.** Its scope (relabel one span, two e2e specs,
  three `StudioShell.test.tsx` assertions) describes a control that C removes.


---

## 8. What shipped, and what the note above did not settle

Implemented in #1810 on the branch `claude/architecture-c-stage-console-l3trph`. The
architecture is exactly C. Four things had to be decided while building it that §1–7
leave open, and each is a place a later reader could reasonably expect something else.

**The audience chrome has TWO hosts, not one.** §3 says captions, the guide pointer and
the rail follow the deck to the Stage, and they do. But a strict relocation would make
the CC button a no-op for the most common session there is — a laptop with nothing
plugged into it — because the surface those things had moved to would not exist. So the
rule as built is *the audience chrome lives on the audience surface*, and the console is
the audience surface exactly when there is no Stage. Never both at once, which is the
duplication §2 is about; the console's dock simply gets them back the moment the Stage
closes. `PresentCaption` and `PresentRail` therefore had to stop being Tailwind
components (the Stage document is a built string and has no Tailwind), so both now carry
scoped class names out of one stylesheet — `present/stage-chrome.js` — that is injected
into both documents. One implementation, two hosts. A utility-class version plus a
hand-written twin for the popup is the drift this repo keeps paying for.

**The rail stays INTERACTIVE on the Stage.** It would have been easy to strip the
buttons and the roving tabindex out of the projected copy, and it would have bought
nothing: nobody clicks a projector. Keeping one component is worth more than a version
of it with its affordances removed for a surface that never uses them.

**The retired window's clock came back to the console.** §3 lists the timer as
presenter-surface but the implementation order in the continuation brief does not
mention it, and deleting the popup without moving it would have quietly dropped a
feature. It is a talk clock beside the transport, with the popup's arm-then-confirm
reset kept verbatim — the risk that guard covers (a stray click near the clock losing
the elapsed time mid-talk) is unchanged. It is painted by direct DOM write rather than
React state, for the reason the readiness poll already documents at length: a
once-a-second re-render of the whole overlay lands on the same main thread as
`decodeAudioData`.

**`S` opens the Stage.** `present-transport.mjs`'s docblock had already reserved
`presenter s` among the per-consumer keys. There was never a presenter shortcut bound;
there is now a Stage one, and the reserved-key list says `stage s`.

### Verification, and what is still unverified

| Claim | Surface | Artifact |
|---|---|---|
| The Stage opens, paints the deck, and carries no presenter instrument | real Chromium popup, production build | `docs/e2e/stage-window.spec.ts` |
| EITHER surface drives the deck, and the console stays the single writer | ditto — keys, wheel and swipe pressed INSIDE the Stage, read back on the console's counter | ditto |
| The rail is on exactly one surface, and moves back on close | ditto | ditto |
| A Stage is reported gone on ALL FOUR paths — hand-close, same-origin navigation, cross-origin navigation, killed renderer | real popup + unit interleavings | ditto + `present/stage-window.test.ts` |
| A navigated Stage does not take the Studio down with it | real popup, cross-origin, then a re-render | `docs/e2e/stage-window.spec.ts` + the §9 probe |
| A link click on the Stage navigates nowhere | real popup | `docs/e2e/stage-window.spec.ts` |
| Nothing Stage-related is in the EAGER bundle; the eager total did not grow | production build, both branches | §9 table |
| The console carries the note and a rendered next slide | real Studio at ≥ lg | `docs/e2e/scenarios/present-run.spec.ts` |
| `standalone` adds nothing to the iframe hosts | unit | `present/stage-window.test.ts` |
| The rail spans the display, with segments and painted ink | real popup, measured | `docs/e2e/stage-window.spec.ts` |
| The caption crawl plays on the Stage and clears 4.5:1 on the letterbox | ditto | ditto + `present/stage-chrome.test.ts` |
| The Guide cursor is drawn in the Stage document and leaves its spawn point | ditto | `docs/e2e/stage-window.spec.ts` |
| The console at 1440 / 820 / 390, notes readable at each | real built site, measured + screenshots | `scratchpad` Playwright captures, reviewed in-session; the pill/panel geometry is measured, not eyeballed |

### What the visual pass found that the gates could not

Both of these were GREEN on lint, on the unit tier and on the first e2e pass, and both
were plainly wrong the moment a human-visible artifact was looked at. They are recorded
because each shows a shape of test that passes vacuously, and each is now measured
rather than merely present.

**The chrome row was 1376px wide inside a 1280px window, and the rail was twelve pixels.**
The Stage document sets no `box-sizing`, so the row's own side padding was added to its
stretched width; and the two portal hosts shrink-wrapped, so `PresentRail`'s `width: 100%`
resolved against nothing. The e2e cell asserting "the rail is on the Stage" passed
throughout — a presence check cannot see a rail that is present and invisible. It now
measures span, segment width and painted ink, and `#latt-chrome` carries a scoped
`box-sizing` (scoped, not universal: the deck's own sheet is the authority on how the
DECK measures).

**The captions were dark ink on a near-black surround.** The first version copied the
opener's four palette tokens across verbatim, which is right for `--accent` and wrong for
everything else: the Stage's letterbox is dark in BOTH modes (a projected deck sits on a
black surround whatever the app is set to), so a light-mode app painted `#1e1a15` text on
`#15110d`. The forwarded accent failed too — cuoio's light accent measures **2.4:1** on
that letterbox, and it is the spoken word in the crawl and the rail's progress fill.
`paintStageTokens` now resolves every value through a probe element (a custom property
carries its TEXT, so a `color-mix(…)` or `light-dark(…)` palette copied across
unresolved), derives the text ramp from the letterbox at the same 90% / 65% white rungs
the themes use on a dark canvas, and lightens the accent in 8% steps until it clears
4.5:1 — leaving an accent that already clears it untouched, so a deck keeps its brand.
Pinned twice: arithmetically in `present/stage-chrome.test.ts`, and on the real popup in
`stage-window.spec.ts`, which measures the crawl's contrast against the painted body.

**Auto-fullscreen is still UNVERIFIED, and now says so out loud.** §7's caveat stands:
whether a popup can fullscreen itself from the opener's gesture needs a real two-monitor
desktop, which the sandbox is not (HARD RULE #23). What changed is that the outcome is
now *measured* rather than assumed — `autoPlaceStage` resolves `{ placed, full }`, and a
placement that could not fill the screen makes the console say which key does. The
`placed`/`full` split is the brief's own instruction: detect to decide whether to offer,
verify the outcome to decide whether it worked.

**The presenter-screen zoom spec is retired, not lost.** `docs/e2e/presenter-zoom.spec.ts`
verified a fourth input verb on a surface that no longer exists. The capability it was
really about — a presenter magnifying a dense number without the room seeing it happen —
is now the console's own pinch / ⌘-wheel / middle-drag, covered by the two `@parity`
cells in `present.spec.ts`, and it is private by construction rather than by being on a
different screen. `test/unit/export/inlinable-kernels.test.js` keeps its
`createZoomGesture` guard: nothing inlines that kernel today, but
`present-transport.mjs`'s header promises every export is self-contained, and a promise
re-verified only when someone needs it is not a promise.

### Still open

- **#1805 is superseded.** Closing it is the human's call, not the agent's.
- **The export player's "Present mode"** (`#lp-full`) remains the fifth sense of the
  word and remains out of scope: changing it moves export bytes, which needs sign-off
  with dark and light renders.

---

## 9. What the adversarial trio found after §8 was written

§8 was written believing the Stage was verified. It was not, and the gap was not a
missing assertion — it was a whole failure CLASS that every tier was blind to. Recorded
here because §8's own verification table is the thing that was wrong, and a note that
only records what it got right is not worth reading.

### The Stage noticed one of four ways of going away

`createStageController` identified its window by the message event's `source`. The
goodbye a NAVIGATION fires arrives with a different one — measured in Chromium — so the
guard dropped the one message it exists to receive. `window.close()` is the only teardown
path where source identity survives, and it is exactly the path the e2e cell drove
(`page.close()`). One of four, certified as the class.

Measured on the real popup, before the fix:

```
SAME-ORIGIN navigation   before → pill true,  console rail 0
                         after  → pill true,  console rail 0     (never noticed)
CROSS-ORIGIN navigation  after  → pill true,  console rail 0
                         + one re-render → dialog 0, crash card 2
```

Three consequences, in rising order of how much they cost:

1. **The audience chrome went to NEITHER surface.** `stageHost` stayed truthy, so the
   portals rendered into a detached document while the console's dock kept refusing to
   show its own copies — the §3 invariant "never both at once" failing into *neither*.
2. **The presenter's live slide index streamed to a foreign origin.** `show()` posted with
   `'*'`, and `ready` was still true, so it kept posting at whatever page now owned the
   window. That page also holds `window.opener` on the origin HARD RULE #24 puts the
   user's API key on.
3. **The Studio crashed.** `guideRoot` dereferences that window in the RENDER BODY; once
   cross-origin the read threw a `SecurityError`, and with no boundary before
   `StudioIsland`'s ErrorBoundary the next keystroke swapped the entire Studio for its
   crash card, mid-talk.

The fix is a MARKER every document the controller writes carries, not `e.source` and not a
URL — `window.open('')` reports `about:blank` at the instant it opens and the opener's href
once written into, so an href captured at open never matches again (one wrong attempt, and
a deadlock where requiring the marker in order to write it meant nothing was ever painted).
Backed by a slow liveness poll for the killed-renderer case an unload beat cannot report at
all, and by a token the document echoes so a navigation's goodbye lands immediately.
Link clicks are inert on the Stage, which is the vector that made any of it cross-origin.

### And the rest

| Finding | Lens | Status |
|---|---|---|
| The Guide searched the WHOLE DECK on the Stage — 49 blocks across 7 sections vs the console's 4, because the filmstrip keeps every hidden slide measurable | checker | fixed: it searches the shown slide, and reads `slideW` off the fit box rather than the letterboxed window |
| `paintStageTokens` was INERT — an inline property on the popup's `<html>` is shadowed by the baked rule on `#latt-chrome` itself | checker | deleted; the real gap (a live site-palette change never reaching the room) closed by subscribing to `site-chrome.ts` |
| `resolveColor` read `color(srgb 0.68 …)`'s 0–1 channels as 0–255, walking a brand accent to gray, and `oklch()`'s hue angle as blue | checker | fixed; the cell meant to cover it passed a form needing no resolution at all |
| `css()` coerced nothing — the one string interpolated into the Stage's `<style>` was numeric only by caller discipline | red team | clamped at the source (#22) |
| Fullscreen was requested during opening, which `document.open()` then destroyed, and unconditionally, so a single-screen laptop could cover the console | checker + inversion | after the deck lands, and only onto a screen we placed on |
| `window.open` takes focus, and every deck key is bound on the console — the first clicker press did nothing | inversion | `window.focus()` on the opener. NOT verifiable here: Playwright's CDP input bypasses OS focus and headless has no window manager |
| A rejected render left "Preparing the stage…" up forever; a tab close stranded the deck; a throwing write latched the document out of ever being replaced | inversion | each fixed, each with a cell |

### The bundle, measured on both branches

The Stage is reached only through `PresentOverlay`, which is `React.lazy` (#1751). That
property is worth a number rather than an assumption, so both branches were built and the
studio route measured through the real pipeline (`inject-modulepreload` + `hoist-stylesheets`
before the gate — a `build:e2e` output measures 9 chunks instead of 57 and means nothing):

| | `origin/main` | this branch | delta |
|---|---|---|---|
| eager chunks | 57 | 57 | 0 |
| eager JS, gzip | 635,722 B | 635,687 B | **−35 B** |
| lazy `PresentOverlay` chunk, gzip | 25,502 B | 26,408 B | +906 B |

No eager chunk contains any Stage marker (`latt-cc`, `latt-holding`, `Preparing the stage`)
— all of it is in the lazy chunk a presenter pays for only on pressing Present. The eager
total is a hair SMALLER than main's: the corrected Inspector copy grew `StudioIsland`, and
the narration ladder losing a rung plus the dead painter being deleted more than paid for it.

### What is still not verified

- **Auto-fullscreening the Stage.** §7's caveat stands unchanged; it needs a real
  two-monitor desktop. The `placed` / `full` split reports the outcome rather than assuming it.
- **The focus fix.** Reasoned from platform behavior, not measured — see the table above.
- **A stranded page still holds `window.opener`.** That is inherent to `window.open`, and
  cannot be revoked from our side once the window has been navigated away. What is closed is
  the VECTOR: a deck's links no longer navigate the Stage.

---

## 10. The scoped trio on the narration change — and the leak it found

§9 records a trio run against the **Stage**. The narration change (`ea86fa5`) landed
*after* that scoping, at the maintainer's direction, and never got one — so it shipped a
kernel edit at kernel depth with none of the product around it. A second trio, scoped to
that commit alone, was run before merge. It found a live privacy leak, one of them a
regression this branch created.

### One line-prefix test, three measured leaks

A speaker note in this engine **is** a non-directive HTML comment, and the Studio's own
note editor writes multi-line ones. Both narration flatteners recognized a comment with

```js
if (/^<!--/.test(line)) continue;   // lib/core/slide-speech.js
return !line || /^<!--/.test(line) || …;  // isCommonlyConsumed, lib/core/chart-narration.js
```

— a test that sees only the line a comment **opens** on. Every continuation line was
therefore ordinary prose. `speakLeftover` feeds that flattener the lines a chart narrator
did not consume, at projection precedence, from the raw source. Measured on real exported
bytes:

| flags | before the fix | after |
|---|---|---|
| `--captions` (default), chart slide | the note is in the `.vtt` | clean |
| `--captions --strip-notes` | the note is in the `.vtt`, while the player HTML beside it is correctly scrubbed | clean |
| `--captions --strip-captions`, multi-line override | the override survives its own strip | clean |

The second row is the serious one, and it is **a regression this branch introduced**: at
`ea86fa5^` that flag pair wrote no `.vtt` at all, so there was nothing to leak. Removing
the `STRIP_NOTES` guard on the projection (correct in itself) also un-gated the chart
substitution, which reads the *unstripped* source. HARD RULE #18, first bullet.

The fix is `blankHtmlComments` in `lib/core/slide-speech.js`: comment spans are blanked as
whole blocks before either flattener sees them. It **preserves the line count**, because
`speakLeftover` filters by original line index against a `consumed` Set — deleting lines
would shift every index and silently mis-drop real authored content. That also closes the
second-order half: `isCommonlyConsumed` carried the same line-prefix test, so it dropped a
note's *opening* line and left the body as an orphan no block-aware pass downstream could
recognize.

### Why every gate was green while this was live

The ladder cells pinned that no `note` **rung** exists — and they were right, and they
passed, while the note reached the shipped `.vtt` through a different door. Every note in
them is single-line and sits on a non-chart slide: the one shape that never leaked. The
integration file was 29/29 green throughout.

**A gate that cannot see the channel it is named for is worse than no gate, because it
certifies.** This is the third instance of the same mistake on this branch — the rail cell
and the caption cell were both vacuous passes caught by the visual sweep (§8) — and the
first two did not teach it, because each was fixed as a one-off rather than as a class.
The new cells drive the *shapes* (multi-line note, chart slide, both strip flags) on real
bytes, and each was mutation-tested: reverting `slide-speech.js` turns all three red.

One more of the same kind, in the new cells themselves: the first draft asserted
`/one thousand/` as a positive control and failed against a track that plainly said it —
a read-along cue interleaves a `<00:00:06.460>` tag between every pair of words, so a
multi-word phrase never appears contiguously. A positive control written that way is
unfalsifiable. The cells strip the timestamp tags and assert on the spoken text.

### The half-landed product

The kernel was right and everything around it still described the retired rule:

| Surface | Was | Now |
|---|---|---|
| `WebpageOptionsPanel.tsx:67` | `narrationBlocked = stripNotes` — vetoed captions *and* audio | the coupling is gone; the CLI had already been made orthogonal, so the two render paths disagreed on one user intent (HARD RULE #1) |
| `lattice-emulator.js:4748` | user-visible: "falling back to speaker notes only" | there is no fallback — it says no caption track will be written, and is un-gated by `--quiet`, since a missing deliverable is not chatter |
| `ShareSheet.tsx:235` | "Read-along WebVTT from your speaker notes" | "…from your slide content" |
| `NarrationExportOptions.tsx:301,322` | a hardcoded strip-notes reason; "add speaker notes" as the fix for a silent deck | renders the caller's reason; advises a caption |
| 7 docblocks in `lib/` and `docs/src` | the `note →` ladder | corrected in place |
| `examples/read-along-captions.md` | taught "Speaker notes become timed WebVTT captions" — the HARD RULE #9 demo deck for this exact feature, teaching its opposite | rewritten; PDF rebuilt |
| 8 committed `examples/*.vtt` | frozen output of the retired ladder (3 echoed their decks' notes verbatim) | regenerated; nothing regenerates or gates these, which is why they rotted |
| `changelog.d/…notes-are-not-captions.fixed.md` | "**A note is the author's alone**" | that was an over-claim: this closes the three *narration* channels; a note still ships via PDF annotation, HTML `aside`, PPTX notes, the `--notes` sidecar and the player's notes sheet. `--strip-notes` remains the control |
| `2026-07-11-manifest-speech-contract.md:490` | the canonical precedence record, unamended | amended in place |

### Filed, not fixed (pre-existing, off-path — HARD RULE #18)

- **#1833** — a note still reaches a recipient through the exported player's own
  `Speaker notes (n)` sheet, gated behind its Present view. Measured; a deliberate
  boundary question rather than an obvious bug, so it is the maintainer's call.
- **`--strip-notes` leaves the note in the PPTX** (`lattice-emulator.js:4035` passes the
  unstripped `slideNotes` where every sibling passes `materializedNotes`). Present at
  `ea86fa5^`; the comment 43 lines above documents this exact bug class being fixed for
  the HTML sidecar and the PPTX call site was missed.
- An inline `<!-- caption: -->` may misbind across an autosplit — it is the only channel
  never remapped to rendered pages. The red team could not force a real split to
  demonstrate it, so it is a code path and a hunch, not a break.


---

## 11. What the maintainer sent back, and what the interaction model actually is

§4 chose architecture C and described it as "the Present overlay *stays* the presenter's
console and gains notes + next slide", with a "chrome-free" Stage. Built literally, that
produced a Present that was a presenter view **from the outset** and a Stage nobody could
operate. Both were rejected on sight, and both were right to be.

### Present is Present until there is a room

The panel is gated on a Stage existing (`presenterView = !!stageHost && wideRoom`), not on
viewport width. Present opens as Present — slide, transport, lens, grid — morphs when the
Stage opens, and reverts when it closes.

The note's sentence was not wrong so much as **unconditioned**: the split only means
anything once there are two surfaces. With no Stage there is no audience to be separate
*from*, so a permanent side column spends a third of the screen answering a question nobody
asked, and the morph stops being legible — one button should change the room and the console
together. What was shipped instead made every wide Present a presenter view whether or not
anyone was presenting.

Notes, the next slide and the talk clock all arrive and leave with the Stage. On a narrow
console with a Stage open the notes ride behind a pill instead; with **no** Stage there is no
notes affordance at all.

### The room does drive the deck

"The console drives the room; the room cannot drive the console" was **not in this note** —
it was invented during implementation, built, and pinned with an e2e cell that pressed seven
keys on the Stage to prove they did nothing. The case it imagined is an audience member
wandering up to a projector. The case that actually happens is the **presenter standing at
the machine the Stage is on**, unable to advance their own deck.

Both surfaces drive now — keyboard, wheel and swipe — through the SAME kernel: `keyAction`,
`swipeAction`, `createWheelGate` and `PRESENT_KEYMAP` travel into the Stage document by
`.toString()`, the trip `fitScale` already takes and `test/unit/export/inlinable-kernels.test.js`
keeps viable. A hand-rolled second reader inside that string is exactly the drift
`present-transport.mjs` exists to prevent.

**One writer.** The Stage posts an ACTION (`{stage:'nav', act}`), never an index. The console
owns `idx`; the `{pv}` that comes back is what repaints. So a gesture on the projection and a
keypress on the console cannot race to different answers, and an echo would show up as a
double-advance — which the e2e cell asserts does not happen.

A nav is the one message that CHANGES state, so it is accepted **strictly** on
`e.source === stageWin` — no token-only path. A page that navigated our Stage away must not
be able to drive the deck.

### "Chrome-free" meant "no presenter instruments", not "no controls"

The Stage carries an auto-hiding control bar: prev / counter / next / full screen. Hidden at
rest, summoned by pointer or key, gone after ~2.4s — the video-player idiom. A permanently
chromed projection is the defect §2 exists to remove; a projection nobody can operate is the
one the first cut shipped. Both are avoidable.

It hides by **opacity, not `display`**, so it keeps its place in the tab order and
`:focus-within` reveals it — a keyboard user has no pointer to summon it with, and "invisible
until you move a mouse you do not have" is not an affordance.

Full screen is a **button**, and that is the point rather than a detail: the Fullscreen API
wants a user gesture in *that* document, and a click there is one. The auto-fullscreen
attempt at open time is a request a browser may decline (§7, still unverified on real
hardware); this is the path that does not depend on it. The slide counter moved here too —
furniture for whoever is at the machine, not something the room reads over the deck.

### The rail is a control, not a taste call

§3 settled the rail as audience-side and called it "a taste call". It is a toggle now, beside
CC and Guide, meaning the same kind of thing they do: show or hide a piece of AUDIENCE chrome,
wherever that chrome currently lives — the Stage when one is open, the console's dock when
there is none. Default on. Measured at 1440 / 820 / 390: four pills, no clipping, no page
overflow, icon-only at 390.

### The palette trap, a second time

The control bar sits in `#latt-view`, outside `#latt-chrome` — and the audience palette is
declared **on `#latt-chrome`**, not on `:root`, because `--bg` / `--accent` /
`--text-heading` are the DECK's token names too and hoisting them would repaint the slide.

So the bar inherited none of them. Measured in the real popup before the fix:

```
--bg            ""                       (empty)
--text-heading  ""                       (empty)
background      rgba(0, 0, 0, 0)         (fully transparent)
button color    rgb(0, 0, 0)             (black, on a near-black slide)
```

Same shape as the `paintStageTokens` finding in §9 — a palette that never reaches the element
reading it — and it survived a screenshot, because a black glyph on a #1a1a1a slide reads as
"a bit dim" rather than as broken. The measurement is what caught it. The decls are repeated
on `.latt-ctl` rather than widened: same values, second scope, deck untouched. Contrast after:
**15.22:1** — `#E8E7E7` on the bar's actual backdrop, `#15110D`.

*(Corrected. This note first said 17.01:1, which is the ratio against pure black — the figure
you get by measuring the glyph against the wrong backdrop. The palette fix is real either way,
and 15.22 clears AAA with room to spare, but a number in a verification section that nobody can
reproduce is the defect the section exists to prevent.)*

The bar was also anchored `position:fixed` to the viewport at first, which put it on top of
the caption band and the rail and clipped it off the bottom edge of a short window. It is
absolute inside `#latt-view` now — over the slide, above the chrome, out of flow so summoning
it cannot resize the deck underneath.

## 12. The trio on the rework — three lenses, ten findings, and the ones that were real

§11 rebuilt the interaction model. That is a large enough change to the *shape* of the thing —
a second driver, an overlay transport, a new toggle — to earn the full trio again (HARD RULE
#25), rather than the maker-checker one rung down. It found ten things. Six were live defects,
four were coverage holes, and two claims *in this note* were wrong.

### The security finding, and why `e.source` was never the check

The `nav` branch guarded itself with `if (!ours) return;` and a comment stating the
requirement in as many words: *"A page that navigated our Stage away must not be able to drive
the deck."* It does not do that. **A `WindowProxy` identifies a browsing context, not a
document, so it survives navigation** — measured in real Chromium:

```
ours (e.source === stageWin) after cross-origin nav : true
e.origin                                           : http://127.0.0.1:8202
alive()                                            : false
```

`ours` was granted to the foreign page. The half that *does* change is the origin, which the
controller never read at all. A Stage written into `about:blank` inherits the opener's origin
(measured: `e.origin === location.origin`), so an origin check costs the real Stage nothing and
rejects the impostor with no window at all — where `alive()` would have taken up to one 2s poll.
Both are in now, and `alive()` is the belt to the origin check's braces: it is what holds if a
*same-origin* page ever takes the window over.

Getting there needed a link click, and **the link guard was narrower than the threat.**
`closest("a[href]")` misses two of the three shapes, all of which survive `sanitizeSlideHtml`:

| vector | `closest('a[href]')` | real click navigates |
|---|---|---|
| `<a href>` | true | blocked |
| SVG `<a xlink:href>` | **false** — it is inside an `<a>` with no `href` *attribute* | **yes, it navigated** |
| `<area href>` | **false** — `<area>` is not an `<a>` | — |
| `<meta http-equiv=refresh>` | — | **no** — inert in a `document.write`n `about:blank` doc |

That last row is the useful bound: every live vector needs a click, so one listener is enough.
The selector is `a,area[href]` now. The e2e cell named for this tested only the plain anchor —
the one shape the guard caught — so it was green the entire time the other two were open.

And the recovery path was worse than the breach. Once the Stage went cross-origin,
`window.open('', 'lattice-stage', …)` hands back **the same context** (measured:
`sameAsOld: true`, `canPaint: false`), so the presenter pressed S forever and nothing happened.
Dropping the handle does not help, because the *name* is what resolves. Closing it does — and a
window we opened ourselves closes even once it is cross-origin (measured: no throw,
`closed === true`).

### The input finding — the kernel's own contract, broken by the surface that inlined it

The Stage hand-rolled its wheel and touch readers, and shipped both halves of #1294 again.
Measured on the real Stage document before the fix:

```
pinch-out  -> next        pinch-in -> next        ctrl+wheel -> prev
```

`present-transport.mjs` names this exact pair as the #1294 root cause, and its `up()` docblock
states the contract in one line: *"Reading it [`swipeBlocked`] is what a surface must do BEFORE
calling `swipeAction`."* The Stage did not, and read no `ctrlKey` either — while the console
guards both. So the in-code claim that the Stage applied *"the same gate, threshold and cooldown
the console applies"* was false in both directions.

The fix is to stop hand-rolling: `createZoomGesture({min:1,max:1})` is inlined as a **pure
finger counter**. `max:1` pins the scale at 1, so no zoom or pan behavior reaches the Stage
(it is the projected copy, not a Studio surface, and owes keyboard + wheel + touch but not
zoom); and a genuine one-finger swipe returns `null` from `move` without ever setting `moved`,
so `swipeBlocked` stays false for exactly the gesture that should still turn the deck.

### The accessibility finding — a bar reachable by keyboard, and wrong to it

`PRESENT_KEYMAP` maps Space to `next`, and the Stage binds `keydown` on `window` without
reading `e.target`. So a keyboard user who tabbed to **Previous slide** and pressed Space had
the native activation suppressed and the deck moved **forward** (measured: `3 / 7 -> 4 / 7`);
Space on the full-screen button advanced the deck instead of filling the screen. The bar's
entire justification is that it stays keyboard-reachable — reachable and wrong is worse than
absent. Space and Enter now belong to the focused control; every other key still drives the
deck, so the arrows keep working while a button holds focus.

Honest attribution: **the console has the same bug today.** It is pre-existing there and is not
this PR's to fix (#18's off-path rule), but the Stage bar is a window this change opened, so it
is fixed here.

### The talk clock started before the talk

The clock is presenter-view furniture — §11 made it arrive with the Stage — but its zero point
stayed keyed on Present opening. A presenter who spent five minutes picking a lens before
projecting saw **"Talk time 5:00"** the instant the room first saw a slide. It re-zeros on the
Stage now, and only on the `null -> host` transition, because a rewrite briefly drops the host
and must not reset a talk in progress.

### Four gates that could not see what they were named for

This is the seventh vacuous pass on this branch, and the pattern is stable enough to name:
**a cell that asserts a NAME rather than a BEHAVIOR is true for a reason other than the one it
is named for.** *"Drives the deck with the SHARED input kernel, not a hand-rolled twin"* was
five `toContain('keyAction')`-shaped assertions — satisfied by `var keyAction=function(k,m)
{return m[k]}` (the exact `Object.prototype`-reaching form the real kernel's `Object.hasOwn`
exists to prevent) and by a `swipeAction` with no threshold at all. Both twins were dropped in
and the suite stayed green.

It now *runs* the emitted kernel in an empty scope and asserts behavior — the idiom
`inlinable-kernels.test.js` already used — and the twin is killed. The other three:

| gate | was | now |
|---|---|---|
| the `nav` `ours` guard | deleting it left 1611 tests green | killed by three separate mutations (origin, `ours`, `alive`) |
| `createWheelGate` / `padInset` | newly inlined, never pinned | pinned, closure state and all |
| the rail toggle | never opened a Stage | drives the toggle on the real popup |

### Two claims in this note were wrong

The contrast figure in §11 (corrected in place above) was measured against pure black rather
than the bar's actual backdrop: **15.22:1**, not 17.01:1. Still far past AAA — but a number in a
verification section that nobody can reproduce is precisely what that section exists to prevent.

And `examples/stage-console-split.md` — the per-feature demo deck, with a committed PDF — still
taught the retired model in prose: *"One progress rail. No buttons"*, *"The room only follows"*,
*"Keys pressed on the Stage do nothing at all."* Rule 6 exists so a behavior change and its docs
land together; the deck is the surface where that failed, and the trio is what caught it.

### The two claims that had no artifact, now measured

§11 asserted the bar's responsive behavior and the changelog said "`f` still works", and
neither carried evidence — the first was asserted with nothing committed, the second reasoned
from a code path while only the BUTTON had been driven. Both are now driven on the real popup,
and both hold:

```
F-KEY:  fullscreen false -> true
W1440:  bar 208px, left 616 right 824, 4 controls, pageOverflowX false
W820:   bar 208px, left 306 right 514, 4 controls, pageOverflowX false
W390:   bar 208px, left  91 right 299, 4 controls, pageOverflowX false
```

The bar is a fixed 208px, centered, and fits inside 390 with 91px to spare. One correction to
§11's wording while we are here: it said "icon-only at 390", which implies the bar sheds labels
at that width. It does not — it is icon-only at every width, so the claim was true for a reason
other than the one it stated. Pinned now, because a projected window is the one surface where a
control clipped off the edge is unrecoverable: there is no scrollbar to reach for, and no second
copy of the transport.


### The projector path, and the defect that was hiding in it

The pre-merge card's confidence floor was set by one thing: "press Stage, it lands on the
projector and fills it" had never been driven, because this sandbox has one screen. Reading
the code is not verifying it (#23), so `docs/e2e/stage-placement.spec.ts` drives everything
either side of the monitor we do not have — and it found a live defect on the first run.

**Screen selection was inverted.** `find((s) => !s.isInternal) || find((s) => s !== currentScreen)`
reads as "an external screen, or failing that any other screen". It is not. The second arm is
**unreachable whenever any screen reports `isInternal: false`** — and on hardware that does not
flag its internal panel, *every* screen reports that. So the first arm matched `screens[0]`,
which is as likely to be the laptop as the projector, and the fallback written for exactly
that hardware could never run. Measured: two unflagged screens moved the Stage to `(0, 0)` —
on top of the console the presenter drives from. It now excludes the current screen FIRST,
then prefers a non-internal one among what is left, which is what the intent always was.

**What is real here, and what is a harness**, because that distinction is the whole point:

| Cell | Engine | Real or harnessed |
|---|---|---|
| The Stage opens and drives where Window Management does not exist | **WebKit** | REAL — the API is genuinely absent, and the cell asserts that before testing it |
| `f` and the button fill the screen | **Firefox + Chromium** | REAL — fullscreen is granted by the browser, which is why the `gecko` project exists |
| One screen never takes the display from the console | Chromium + Firefox | REAL — this machine has one screen |
| Which screen, and at what coordinates | Chromium | HARNESSED **in the topology only**: the screen list is injected; the popup, controller and code are real. Whether Chromium then physically moves a window onto a monitor is Chromium's job, and is **not** claimed |

**The single-screen cells were vacuous when first written**, and the mutation is what said so.
Deleting the `placed ?` guard — the one whose docblock says an unconditional request "meant a
single-screen laptop could have the Stage cover the console" — left all eight cells green,
because headless declines an un-gestured `requestFullscreen` anyway. The cell was reading the
OUTCOME when the guard controls the CALL. It records `requestFullscreen` invocations now, and
the same mutation fails two cells. That is the eighth vacuous gate found on this branch, and
the first one caught before it shipped rather than after.


### Still open

- **The rewrite de-morph — DRIVEN, and it does not happen.** Two lenses reasoned from source
  that `paint()`'s `onChange(null)` would unmount the notes aside, its live next-slide frame and
  the talk clock on any lens/palette/mode change. Neither reproduced it, and the note first
  recorded it as UNVERIFIED. It is verified now, on the real popup, and the finding does not
  hold: **one line in `update()` prevents it** — `doc === written` refuses a rewrite unless the
  built document actually DIFFERS. A site palette change announces itself, `chromeGen` bumps,
  the document is rebuilt, and it comes back identical.

  Three triggers were driven and none rewrote a live Stage: an OS `prefers-color-scheme` flip, a
  bare `lattice-chrome-change` event, and the exact pair `setPalette()` performs (root
  `data-palette` attribute, then the announcement). The Stage document was **stamped with a
  global** so a rewrite would be observable — `document.open()` replaces it — and the stamp
  survived all three.

  What is NOT claimed: that no path can rewrite a live Stage. The deck-theme controls
  (`paletteOverride`, `extraTheme`, `modeOverride`) sit outside the Present modal and could not
  be reached while it is open, which is itself most of why this is not a live defect. Pinned by
  a cell that SAMPLES at 16ms rather than checking before and after, because the failure shape is
  a flicker and a before/after check would miss an unmount-and-remount entirely.

  The first two attempts at this measurement were themselves vacuous, in the way this branch
  keeps producing: the trigger never fired, so "nothing blinked" was true for the wrong reason.
  The stamp is what caught that, and it is why the stamp is worth describing here.
- **`onLost` does not distinguish a Stage that DIED from one the presenter deliberately closed.**
  Both revert the console to plain Present, which is right for the second and arguably wrong for
  the first. A decision, not a defect — it goes to the maintainer.
