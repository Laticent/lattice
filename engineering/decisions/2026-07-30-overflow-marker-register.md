---
status: shipped
summary: A delivered Export-to-Marp bundle put a red QA ring, an "OVERFLOWS" flag, and per-cell "FIX ME" overlays on every clipped slide — the bundle renders through the browser runtime inside marp-cli, so it inherited the runtime's AUTHORING default by accident. The marker was NOT a false positive (detection accuracy was established earlier in the swimlane), so the fix is not to hide it but to say who it is addressed to. Two shipped policies had disagreed and both were right on their own surface — the emulator strips the marker and warns on stderr, the runtime draws it so a reader never gets a silent clip — which makes it a configuration, not a constant. Three levels: author / reader / off, with reader the export default (no ring, a calm "Content clipped" pill, so a clipped slide still says so without being a bug report) and off opt-in only. IT IS AN EXPORT SETTING, NOT A DECK REGISTER: it shipped as `overflow-marker:` front matter for one commit and the Munger inversion caught the altitude error, citing this repo's ruling from one day earlier that retired `autosplit:` — one deck source is previewed, exported, and printed, so the answer belongs to the render target. It is now chosen by `--overflow-marker` (this export), `LATTICE_OVERFLOW_MARKER` (this checkout), or the Studio workspace setting beside `pdfPages`, and travels in its own generated block so a re-export cannot inherit the previous export's choice. The reader label was also false — "More below" promised a scroll that `overflow: clip` makes impossible — and is now "Content clipped". Traps found: a `:root[…]` gate is rewritten by marp-core's selector scoper into a slide-inside-a-slide and silently never matches (the gate rides on the section instead); `reader` deleted the finish keyline by nulling the ring the finish frame yields to; and `off` lost a race to the emulator's own inline watcher until it was enforced in CSS. The emulator's PDF/PNG/PPTX path does not read the setting yet and is unchanged.
---

# The overflow marker becomes an EXPORT SETTING, and the export stops shipping QA chrome

**Date:** 2026-07-30
**Swimlane:** Export-to-Marp fidelity (`2026-07-29-export-to-marp-broken.md`)
**Status:** landed

---

## The report

A delivered Export-to-Marp bundle put a **red QA ring**, an **"OVERFLOWS"** corner
flag, and per-cell **"FIX ME"** overlays on every slide whose content exceeded the
frame. A recipient opening a deck they were handed saw a bug report.

The first framing of the fix was wrong, and worth recording as such: *"the debug UI
shouldn't ship."* That reads as concealment, and the user said so — *"are we hiding
defects? why would we do that?"* The honest question is not whether to show the
signal. It is **who the signal is addressed to.**

## The marker is not a false positive

Before changing anything, the detection was checked, because a marker that fires on
a slide that fits is a different bug with a different fix. **This evidence is about
DETECTION ACCURACY and comes from earlier in this swimlane — it is the reason the
fix is a routing change rather than a suppression, and it is not evidence about the
new treatment.** Nothing in this change reproduces it.

- Verified across **258 slides / 9 decks**, covering all three clip cells
  (`.cell-stage`, `.panel-right`, `.compare-right`) plus the viewBox legibility
  axis. **Zero false positives.**
- A 12-slide boundary ladder (3 → 14 items) measured **identically on both paths**:
  overshoot 0, 0, 0, 0, 59, 144, 228, 312, 396, 480, 564, 649 px; cell values
  0 / 79 / 163. The engine flagged pages 4–12 and the export marked pages 4–12.
- #1243 (`23b9666`), which fixed detection accuracy, **is working**: a Marp render
  scaled to 1280×720 and an unscaled 3840×2160 engine render produce identical
  layout-px numbers.

So the content really is clipped, and the marker really is telling the truth.

## The actual cause: two correct policies, and nothing to choose between them

Two surfaces had each independently decided what to do about a clipped slide, and
each was right about its own surface:

| Surface | Policy | Stated at |
|---|---|---|
| `lattice-emulator.js` (PDF / PNG / PPTX) | strip every marker, warn the author on stderr — *"The export stays clean — no overflow marker is printed"* | the strip pass |
| `lib/runtime/index.js` (browser) | draw the marker — *"the reader must still see the honest marker, never a silent clip"* | the overflow watcher |

An Export-to-Marp bundle renders **through the runtime**, inside marp-cli's headless
browser. So the runtime's policy won — and its default is the **authoring** one,
because the live preview is what it was written for. Nothing in the export told it
otherwise. The bundle inherited an authoring default by accident.

There is no globally right answer here. Shipping a clipped slide with no marker
passes off broken work as finished; shipping it covered in QA chrome hands a
recipient a bug report. As the user put it: *"there is no good choice here, just not
as bad choice."* That is the signature of a **configuration**, not a constant.

## The decision

Three levels (`lib/core/resolve-overflow-marker.js`):

| level | what an overflowing slide shows | where it applies |
|---|---|---|
| `author` | red ring, "Overflows" flag, per-cell "Fix Me" overlays, the §8-rule-8 type-floor alarm | every authoring surface, always |
| `reader` | no ring; the same text-labeled tab restyled into a calm **"Content clipped"** pill | **an export, by default** |
| `off` | nothing | an export, opted into |

**`reader` is the export default, and it is the least-bad choice rather than a good
one.** It keeps the property that matters — a slide that clips still says so, in
text, so nothing is silently lost — while dropping everything that only helps
someone *fixing* the deck. `off` stays available for an author who has already
checked the deck; it is never the default, because a default that hides a defect is
the failure mode this whole swimlane exists to prevent.

An **authoring** surface is not configurable at all. You are the one who can fix a
clipped slide, so the live preview and the Studio always show the full signal.

### It is a setting, not a deck register — corrected after the first cut

The first version of this shipped `overflow-marker:` as deck front matter. That was
the wrong altitude, and the Munger inversion said so by pointing at this repo's own
ruling from **one day earlier**:
`engineering/decisions/2026-07-29-autosplit-is-not-a-toggle.md` retired `autosplit:`
on exactly this argument — page count is a function of content and box, not an
authoring fact, so it cannot be an authoring-time switch, and the need moved to a
tool flag.

Apply the same test. Is "who is the overflow signal addressed to" a property of the
DECK, or of the RENDER TARGET? One deck source is previewed while authoring,
exported to a bundle for a recipient, and printed to PDF for the record. One deck,
three correct answers, decided entirely by which command you ran. That is a target
property by definition — and the measured evidence agreed: the deck key was inert on
four of five surfaces, so what it bought over the flag alone was "I don't want to
type the flag", paid for with permanent front-matter vocabulary, a documented row in
`design/skill.md`, a section in every generated bundle README, and a lint rule.

**So the level is chosen where the export is:**

| input | scope | mechanism |
|---|---|---|
| `--overflow-marker=<level>` | this one export | `tools/export-marp.js` |
| `LATTICE_OVERFLOW_MARKER` | every export from this checkout | env var (there is no Lattice config format, and inventing one for a single setting is the larger change) |
| Studio: Share → Marp bundle | this one export | `MarpOptionsPanel`, the pre-export step the PDF / Webpage / Print / Image-set formats already have |
| Studio: Workspace settings | every export from this Studio | `StudioSettings.overflowMarker`, beside `pdfPages` — which is already a workspace-level *export* setting with the same reasoning |
| — | otherwise | `reader` |

and it travels to the runtime in its **own generated block**
(`lib/core/export-settings.js`), never in the author's front matter. Three things
follow from that separation, and each was a defect while it was a key:

- **Nothing looks like an input the author should write.** A front-matter key the
  export writes but never reads back is a key that LOOKS like an input and is not.
- **A re-export cannot inherit it.** Exporting a bundle's own `.md` — an ordinary
  thing to do with a deck a recipient sent back — used to carry the previous
  export's choice forward silently. That mattered most for `off`: a one-time "quiet
  this for the board" became a permanent property of every derived deck, watched by
  nothing.
- **The block is regenerated**, so it is always the current export's decision.

A stray `overflow-marker:` in a deck now earns a deck-lint warning naming where the
setting actually lives (`findStrayOverflowMarker`) — because the alternative is
silence, and silence is what the move was meant to end.

### The second channel

Whatever the level, `export-marp` now prints the policy on the author's console, and
`off` gets an extra warning. It states plainly that **it did not measure** —
`export-marp` never renders, which is why it finishes in about a second — and names
the command that does (`lattice-emulator.js`, which prints
`⚠ OVERFLOW — N slides … pages X, Y` from the same probe). A disclosure that named a
measurement it had not taken would be worse than none (HARD RULE #23).

## Which surface shows what

| surface | what it shows | reads the export setting? |
|---|---|---|
| Export-to-Marp bundle | flag → workspace → `reader` | **yes — it is the artifact the setting is for** |
| live preview / Studio | always `author` | no, by design: you can fix it |
| fluid viewer | always `reader` | no block is written into one |
| emulator PDF/PNG/PPTX | clean + a stderr warning | not yet — see below |
| HTML player | no marker (scripts stripped) | no runtime, so no marker |

The runtime tells an exported artifact from an authoring surface by the PRESENCE of
the export-settings block, which is written by one function and only ever by an
export producer. That is a fact about the document, not a heuristic.

## Two traps found while building it

**1. `:root[…]` gates do not survive a Marp render.** The reader treatment already
existed in `base.fluid-view.css`, gated on `:root[data-lattice-fluid-capable]`, and
moving it under a `:root[data-lattice-overflow-marker="reader"]` gate looked like a
one-line change. It rendered with the red ring intact. marp-core scopes a theme rule
off its **leftmost compound**: a literal leading `section` is the slide, anything
else becomes a slide DESCENDANT. The emitted selector was

```
div#\:\$p > svg > foreignObject > :where(section):not([\20 root])[data-lattice-overflow-marker=reader] section.overflow
```

— a slide nested inside a slide, which never matches. Same trap
`lib/core/leading-is.js` exists for. **The gate rides on the section**
(`section.overflow[data-lattice-overflow-marker="reader"]`), stamped per-slide by the
watcher, and the rules moved to `base.modifiers.css` beside the author treatment they
replace. The fluid viewer resolves to `reader` in both its states, so its behavior is
unchanged — verified by screenshot at 390×844.

**2. A deck key had to be read at column 0** — the shared `frontMatterValue` reader
tolerates indentation, so it finds a same-named key NESTED under a mapping (`meta:` →
`  overflow-marker:`), which would let unrelated config decide a delivered artifact.
That reader and its writer are both **gone** with the deck key; the constraint
survives only in `lint-core.js`'s stray-key rule, which anchors at column 0 for the
same reason. Recorded because the reasoning generalizes to the next register.

## Verified

Rendered through **real marp-cli** (not the engine, not a harness), then measured —
computed style rather than eyeballed, because the `gallery` keyline is invisible
against white and eyeballing would have missed the regression it exposed. Re-run
after the export-settings transport replaced the front-matter key, so this table
describes the mechanism that ships:

| level | page 2 (overflows) | page 1 (fits) |
|---|---|---|
| default (`reader`) | `ring: none`, tab `"Content clipped"`, no Fix-Me boxes | nothing |
| `--overflow-marker=author` | `ring: ring`, tab `"Overflows"`, 1 Fix-Me box | nothing |
| `--overflow-marker=off` | nothing | nothing |

Rasterized and looked at for `reader` (the default, and the one a recipient sees).
Dark mode checked separately: the pill is palette-blind (`--text-body` on `--bg`) and
inverts. A `finish: gallery` deck was measured at all three levels to confirm the
keyline survives at `reader` — page 2's `box-shadow` now matches page 1's, where it
read `none` before the fix.

The render-inheritance attack (below) was re-run after its fix, on a real `--fluid`
viewer built from an `off` bundle's own `.md`: `reader` / `"Content clipped"`, where
it had been `off` / nothing.

Three Playwright journeys drive the **real Studio** in a browser and read the level
back out of the DOWNLOADED ZIP — default, an in-panel override, and a workspace
preference. `test/fixtures/overflow-marker-probe.md` carries the render commands so
the table is reproducible rather than resting on these screenshots.

## Not in scope, and why

**The emulator's PDF / PNG / PPTX path does not read this setting.** It is
hard-wired to the equivalent of `off` plus its stderr warning — which is already the
right default, so nothing is broken there, but `overflow-marker: author` will not put
a ring in a PDF. Wiring it up means changing the bytes of the primary export artifact
and touching the emulator's separate inline watcher copy, which is its own change with
its own sign-off. It is the next item in this swimlane, and the scope limit is stated
in `resolve-overflow-marker.js`'s header rather than left for someone to discover.

**(Corrected.)** An earlier draft of this note said the Studio had no per-export
picker and filed one as a follow-up. That was wrong — the Share sheet has had a
pre-export OPTIONS STEP per format since the comments-layer work (`ExportOptionsPanel`
for PDF, plus Webpage / Print / Image set), and the Marp row was simply the one
format that had never used it. It does now (`MarpOptionsPanel`), defaulting from the
workspace setting, and the flow is covered end to end in
`docs/e2e/journeys/author-export.spec.ts` — driving the real Studio and reading the
level back out of the downloaded ZIP.


---

## What the adversarial trio changed (HARD RULE #25)

Run on the first commit of this change, after it had already been rendered and
verified. Every lens found something the render tests structurally could not, which
is the argument for the ladder in one paragraph: the pixels were right and the
reasoning around them was not.

**Inversion — the reader label was a lie.** It read **"More below ↓"**. There is no
below: `base.elements.css` sets `section { overflow: hidden }` and the standard body
cell sets `overflow: clip`, which does not create a scroll container at all; the
fluid viewer's `scroll-snap-type: y mandatory` sends a downward scroll to the NEXT
SLIDE. So the calm reader cue promised the content was reachable, on precisely the
delivery surfaces this register exists to serve — a softer concealment than the one
the change refuses to do, and worse than `off`, which asserts nothing. The string
predates this change (it came from the fluid viewer), but this change moved it onto
the delivery surface and made it the default for every export, so it is on-path and
fixed rather than filed (HARD RULE #18). It now reads **"Content clipped"**, and the
`↓` is gone with it.

**Red team — two regressions this change introduced, both invisible on the probe.**

1. *`reader` deleted the finish frame.* `base.finish.css` scopes its keyline
   `section.finish:not(.overflow)` so it deliberately YIELDS to the overflow ring.
   The reader rule then nulled the ring with `box-shadow: none !important`, so a
   clipping slide in a `finish:` deck got **neither** — a naked slide in an
   otherwise framed deck, on the new default. Fixed by GATING the author ring
   (`section.overflow:not([…="reader"]):not([…="off"])`) instead of overriding it,
   which removes the `!important` and lets the finish cascade work, plus two arms on
   the finish rule so it only yields when the ring is actually drawn.
2. *`off` produced the LOUDEST marker.* `lattice-emulator.js` embeds its own inline
   watcher in a `--fluid` export, which knows nothing about the register and
   re-stamps `.overflow` on font-settle and on **every resize**. A one-shot JS sweep
   cannot win that race, so a deck asking for silence rendered the red author ring.
   Fixed by enforcing `off` in CSS (the level is stamped on every section before the
   sweep returns), which survives whatever stamps `.overflow` afterwards.

Red team also falsified a claim this change shipped in three places — *"the marker
never changes the layout"*. `base.finish.css`'s `section.finish > *:not(.backdrop)`
sets `position: relative` at equal specificity from a later file and won, so on a
`finish:` deck the "corner flag" rendered as a full-width in-flow band that cost a
line of copy (measured `x:64 y:593 w:1152 h:23 position:relative`). The reader rule
survived only because it carried `position: absolute !important`; the author rule
now does too, which makes the claim true rather than removing it.

**Checker — the wiring had no tests at all.** Every test pinned a pure function;
`deckOverflowMarker`'s surface heuristic and the per-section stamp — the two riskiest
new behaviors — had none, and all three confirmed correctness findings lived in that
gap. `test/integration/parity/runtime-overflow-marker.test.js` now drives the real
bundled runtime over both surfaces. The checker also found the sweep's docstring
promising "every marker" while leaving the Fix-Me boxes and overlay behind, and its
justifying comment asserting a build-time `.overflow` stamp that does not exist (the
emulator stamps at runtime and strips before printing) — a claim inherited from an
older comment and built upon here.

**Also folded in:** `--overflow-markerZZZ=off` was accepted as the real flag
(prefix match) and a repeat silently took the first; a typo'd deck value was
rewritten to the default with no channel saying so, and `lint-core.js` had never
heard of the key despite the resolver citing deck-lint as the safety net; duplicate
keys resolved first-wins against YAML's last-wins; and the Studio's export never
wrote the key at all, so a front-matter-less deck exported from the Playground still
shipped the original defect.

**Where the trio confirmed the design:** the diagnosis, the refusal to simply hide
the marker, the column-0 read, the `:root[…]` scoping discovery, and the console
disclosure that names what it did *not* measure.

## Still unverified

Named rather than implied, because a green gate is not a rendered surface
(HARD RULE #23):

- **The marp-vscode preview pane** — the surface the originating request named. Not
  reachable from this sandbox. The scope table above is **UNVERIFIED** there.
- **`marp deck.md --html` opened standalone**, the route the bundle README
  advertises with "double-click it". Only the PDF route was rendered.
- **A real deck at `reader`.** The probe is two synthetic slides with no bottom
  chrome. The pill is bottom-center and `base.modifiers.css` has rules lifting
  footer / pagination / progress above that band, so a collision on a deck that
  carries them is unproven.
- **The Studio's export**, now that it writes the key — the fix is unit-tested, not
  driven through the real Playground.


---

## The SECOND trio, on the altitude move (HARD RULE #25)

The first trio reviewed a design that no longer exists — the deck register. The move
to an export setting replaced the transport, the read path, the resolution, and
added a UI surface, so it got its own pass. Every lens again found something the
render evidence could not.

**Red team — the block was inherited by every RENDER, not just every re-export.**
The highest-severity finding of either round, and it falsified this note's own claim
that "a document carrying one IS an exported artifact." The block lives in the SOURCE
TEXT, so opening a bundle's own `.md` — which its README invites, and which "a deck a
recipient sent back" describes — carried the old export's level into every future
render. Measured on a real `--fluid` viewer built from an `off` bundle: the emulator
printed `⚠ OVERFLOW … is CLIPPED` and the artifact drew **nothing**. At the default it
is wrong the other way — a live preview silently downgrades from `author` to `reader`
and loses the Fix-Me overlays and the type-floor alarm. Fixed by stripping the block
on Lattice's own render path (`lib/engine/index.js`), the same shape as
`stripDebugAttrs`: a marker from one context must not ride into another. Re-run after
the fix: `reader` / `"Content clipped"`.

It also found that `withoutExportSettingsBlock`'s `[\s\S]*?` payload **deleted author
content** — a fenced code sample of the block came out empty, and an unclosed tag in a
deck body swallowed two slides on re-export (3 in, 1 out) and duplicated a runtime
script. The payload can never contain a raw `<` (every one is escaped), so it is
bounded `[^<]*` now.

**Checker — the Drawing Board shipped the QA ring, and the docs typecheck was red.**
The default had moved out of the shared kernel into each caller, and one caller was
never updated: `drawing-board.astro` passes no marker, `exportSettingsBlock`
writes nothing for `undefined`, and the runtime reads "no block" as "authoring
surface". A delivered bundle from that path carried the red ring and the "FIX ME"
overlays — the originating defect, reintroduced. The design had made *"the producer
chose nothing"* and *"this is an authoring surface"* the same wire signal; the choke
point (`withRuntimeScripts`) now resolves, so no producer can emit a block-less deck.

`cd docs && npm run typecheck` was **red at HEAD** on a line the previous commit
added — a blocking CI step I had run before that edit and not after.

**Inversion — the change globalized the failure mode it was built to end.** The deck
key's persistent `off` was narrow, textual, greppable, lintable and visible in a
diff. What replaced it — a Studio workspace setting and an env var — is none of those
and silences *every* export from that Studio or checkout, indefinitely. The removal
was written up as a win on exactly that axis. `off` is now barred from both standing
channels (`STANDING_MARKER_LEVELS`; the Workspace card does not offer it and the
resolver refuses it, saying why) and available only where it is a decision about ONE
artifact — the flag and the Studio's per-export step, both of which leave a record.

Inversion also caught that `design/skill.md`'s **scope fence was deleted** by the
move: the paragraph stating this governs a bundle and nothing else, and that a PDF is
always clean. What replaced it implied `--overflow-marker=author` puts a ring in a
PDF. Restored, and the Workspace card's copy is now as precise as the `pdfPages` card
directly above it.

**Also folded in:** the generated README described `reader` unconditionally, so an
`off` bundle told its recipient that clipped slides are tagged — it is per-level now,
and tells a recipient without Lattice that they can edit the block directly; the
block's HTML comment became a **speaker note** in the recipient's presenter view and
PPTX notes pane (dropped — the `type` is self-describing); `resolveExportOverflowMarker`
swallowed a stale standing value whenever a flag won, which is the exact case its
docstring claimed to cover; deck-lint was aimed at the retired key and blind to a
*planted* settings block, which is the form that still matters downstream (a rule for
each, both now tested — neither had coverage); the CLI printed "(workspace setting)",
a thing the CLI does not have; and the two data blocks were a structural
transcription of each other, one commit old — factored into `lib/core/data-block.js`,
where bounding the payload fixed both at once (HARD RULE #15).

**Where the trio confirmed the design:** the altitude call itself (inversion looked
hard for a case to restore the deck key and did not find one); the separate block
rather than folding producer settings into the author's front-matter snapshot;
writing the block unconditionally; the lint rule's existence and its reason; and the
console disclosure that names what it did *not* measure.
