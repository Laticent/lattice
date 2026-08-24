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
| The console drives the room; the room cannot drive the console | ditto — every deck key pressed INSIDE the Stage | ditto |
| The rail is on exactly one surface, and moves back on close | ditto | ditto |
| A hand-closed Stage is reported, not left driving a dead window | ditto — `page.close()` → the `{stage:'closed'}` unload beat | ditto |
| The console carries the note and a rendered next slide | real Studio at ≥ lg | `docs/e2e/scenarios/present-run.spec.ts` |
| `standalone` adds nothing to the iframe hosts | unit | `present/stage-window.test.ts` |
| The rail spans the display, with segments and painted ink | real popup, measured | `docs/e2e/stage-window.spec.ts` |
| The caption crawl plays on the Stage and clears 4.5:1 on the letterbox | ditto | ditto + `present/stage-chrome.test.ts` |
| The Guide cursor is drawn in the Stage document and leaves its spawn point | ditto | `docs/e2e/stage-window.spec.ts` |
| The console at 1440 / 820 / 390 | real built site, screenshots | Playwright captures, reviewed in-session |

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
