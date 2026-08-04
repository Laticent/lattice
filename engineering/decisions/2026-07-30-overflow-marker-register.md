---
status: shipped
summary: A delivered Export-to-Marp bundle put a red QA ring, an "OVERFLOWS" flag, and per-cell "FIX ME" overlays on every clipped slide — the bundle renders through the browser runtime inside marp-cli, so it inherited the runtime's AUTHORING default by accident. The marker was NOT a false positive (detection accuracy was established earlier in the swimlane), so the fix is not to hide it but to say who it is addressed to. Two shipped policies had disagreed and both were right on their own surface — the emulator strips the marker and warns on stderr, the runtime draws it so a reader never gets a silent clip — which makes it a configuration, not a constant. Three levels: author / reader / off, with reader the export default (no ring, a calm "Content clipped" pill, so a clipped slide still says so without being a bug report) and off opt-in only. IT IS AN EXPORT SETTING, NOT A DECK REGISTER: it shipped as `overflow-marker:` front matter for one commit and the Munger inversion caught the altitude error, citing this repo's ruling from one day earlier that retired `autosplit:` — one deck source is previewed, exported, and printed, so the answer belongs to the render target. It is now chosen by `--overflow-marker` (this export), `LATTICE_OVERFLOW_MARKER` (this checkout), or the Studio workspace setting beside `pdfPages`, and travels in its own generated block so a re-export cannot inherit the previous export's choice. The reader label was also false — "More below" promised a scroll that `overflow: clip` makes impossible — and is now "Content clipped". Traps found: a `:root[…]` gate is rewritten by marp-core's selector scoper into a slide-inside-a-slide and silently never matches (the gate rides on the section instead); `reader` deleted the finish keyline by nulling the ring the finish frame yields to; and `off` lost a race to the emulator's own inline watcher until it was enforced in CSS. Every export path reads it, including lattice-emulator.js (PDF/PNG/PPTX/HTML) — a setting the primary export ignored would not have been a setting; its default is `reader`, so a delivered PDF gains a "Content clipped" tag on a clipped slide where it previously carried nothing, and the stderr warning stays unconditional at every level.
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
| emulator PDF/PNG/PPTX | flag → workspace → `reader` | **yes** — applied in the render browser before printing |
| emulator `--fluid` viewer | flag → workspace → `reader` | **yes** — the emulator writes the settings block, which the inlined runtime reads |
| emulator `--player` | flag → workspace → `reader` | **yes** — BAKED, not read: the player ships no runtime |

The player is the one surface that cannot *read* anything at view time — `player-core.mjs`
drops every inline script from the document it is handed. So the level is baked into its
DOM instead: the emulator captures the page **after** applying the level in the render
browser, and that capture is the player's source. Getting this wrong is subtle and silent —
the player used to be built from the PRE-BROWSER static render, which no watcher had ever
touched, so `--player` was permanently equal to `off` no matter what the setting said.

The rule this suggests for any future export path: a surface either reads the settings
block or has the resolved state baked into it. There is no third option, and "the default
is already correct there" is not one of them — a setting the primary export ignores is not
a setting.

## The two registers ask different questions

The register shipped with `author` and `reader` keyed off the SAME measurement — the
geometric one, `probeSectionOverflow`. That was an altitude error, and the HARD RULE #25
inversion caught it before merge.

Geometry is right for `author`. The author can open devtools; an over-subscribed box is a
defect to fix whether or not today's copy happens to fit inside the spill, and tomorrow's
copy will not.

Geometry is wrong for `reader`, because the pill makes a claim to someone whose only test
is *"can I find what's missing?"*. Measured on the corpus this gate covers:

| deck | overshoot | text-bearing leaves below the clip line |
|---|---|---|
| `exemplars/nonprofit/grant-report.md` p3 | 282px | **0** |
| `exemplars/nonprofit/grant-report.md` p12 | 416px | **0** |

The spill is padding and background. Cross-tabulating the whole ratchet by component:
**18 of 27 clipping slides are bare `kpi` (excluding `compact`), and all 20 `kpi compact` slides fit** — a perfect
separation, so this is one component's flex floor (`kpi.styles.css` keeps `min-height: auto`
on the `<ol>` deliberately, for the grid variants — **no longer true as of the #1277 follow-up
below; the list now declares `min-height: 0`**), not 17 authoring accidents. Four more are
`wifi`, three are the feature's own demo deck. The remaining two are genuine.

So `reader` now asks the reader's question — `probeContentClipped`: is any content-bearing
box (text, or a replaced element, because a chart cut in half loses plenty with no text in
it) cut by a clipping ancestor? The two probes are kept SEPARATE rather than merged: the
narrow one runs only on sections the geometric one already flagged, which is what lets
`author` stay exactly as loud as it was.

`.overflow` still lands on the section on geometry, because autosplit and the console report
both key off it and both want the geometric truth. Only the reader treatment yields, via
`.content-cut` — see §"One class, not three" below for why that is a single orthogonal
class rather than a pair of conjunctions.

**The component defects are NOT fixed here** — they are pre-existing and off this change's
path (HARD RULE #18's log-don't-pull arm), and `kpi.styles.css` already records one failed
attempt at the same symptom. Fixing the predicate rather than the corpus is also the more
general answer: it protects a user's own `kpi` deck, which regenerating our PDFs would not.

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

## The emulator reads it too — corrected after the second trio

The first cut left `lattice-emulator.js` (PDF / PNG / PPTX / HTML) hard-wired to the
equivalent of `off` plus its stderr warning, reasoning that this was already the
right default so nothing was broken. That reasoning was wrong in a way worth
recording, and the user said it in one line: **you cannot ship a setting that isn't
read.** `--overflow-marker=author` silently did nothing in the artifact most decks
actually become, and the two export paths disagreed about the thing the setting
exists to decide — a Marp bundle said "Content clipped" where the same deck's PDF
said nothing.

The emulator now takes the same flag, resolves through the same kernel with the same
precedence, and stamps the same per-section attribute the browser runtime does, so
one CSS block serves both. Its inline watcher draws the tab; the strip pass became
level-aware instead of unconditional.

Two things did NOT change, and both are load-bearing:

- **The default is still effectively quiet for a reader** — `reader` draws a calm
  "Content clipped" pill, no red ring. The existing integration test that guards
  "no danger-red ring leaks into a delivered PDF" still passes untouched, which is
  the honest check that this widening did not turn every PDF into a bug report.
- **The stderr warning is unconditional at every level.** It is why `off` is
  tolerable at all: the author is always told, even when the artifact says nothing.

One regression this surfaced, caught by the export tier rather than by eye: the
reader pill carried a `box-shadow` commented "HTML viewer only, never in PDF" —
true only while the pill was a fluid-viewer affordance. Once it printed, Chromium
rasterized the shadowed box into an image XObject, so a `--keep-vector-images`
export grew a raster object it promises not to have. The shadow is gone.

## Still not in scope

**The marp-vscode preview pane.** Not reachable from this sandbox. marp-cli is, and
every claim about a Marp render here comes from it — but the VS Code webview is a
different surface and stays **UNVERIFIED**.

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

---

## Follow-up (2026-08-02) — #1277: the `kpi` ledger now divides its stage

The section above logged 18 of the 27 clipping slides as "one component's flex floor"
and left it, correctly, off #1275's path. This is that follow-up. It is worth reading
because the mechanism was **not** the one the note above assumed.

### What it actually was

`kpi`'s metric list is a flex child of the bounded stage Cell with `flex: 1` and no
`min-height`. The live `min-height: auto` floor made its used height the **larger** of
the stage it was flexed into and its own content height — and a grid variant computes
that content height against an **indefinite** block size, where `1fr` rows cannot
divide a stage they have not been given and instead equalize to the tallest row.

So the list demanded `3 × tallest-support` no matter what the stage offered, and no
matter how many supports were authored. Measured:

| slide | stage | list demanded | over |
|---|---|---|---|
| `grant-report.md` p3 | 1203px | 1484.58px | 282px |
| `grant-report.md` p12 | 1069px | 1484.58px | 416px |

Rows resolved to `494.859px 494.859px 494.859px` on **every** bare-`kpi` slide across
twelve decks by twelve authors. The constant the earlier note flagged is explained:
the number was a property of the component, not of anyone's content.

And the reason it was **three-metric** slides that clipped — every one of the 18 — is
that the hero spans `grid-row: 1 / -1`, so the explicit row count IS the number of
support rows opposite it. Hard-coding three meant a hero + **two** supports reserved a
third row for a metric nobody wrote, then billed the stage for it. 68 of the 81
bare-`kpi` slides in the corpus are that shape.

### Round two was also wrong, and the trio is what caught it

`kpi.styles.css` recorded a previous attempt at this symptom, which is why the issue
asked for a redesign rather than a patch. Round two's first cut paired the count fix
with `min-height: 0` on the base list rule, making the list's block size definite.
It passed the corpus. It was still wrong.

**The count fix alone is what fixes the corpus.** Measured both ways: with count-aware
rows and NO `min-height: 0`, `overflow:check` is 9 — the same 27 → 9. The clamp bought
nothing and cost three regressions, all self-inflicted, all invisible to every gate
here (the ratchet, the 54-case matrix and the unit test are `wide`; the corpus has no
2-metric kpi slide; and auto-split hides the portrait case in the export path but NOT
in the live preview or an export-to-Marp bundle, where nothing re-paginates):

| what the clamp did | measured |
|---|---|
| **Sheared the ledger's HEAD** at `tall`/`strip`, where the linearized list centers | first metric 425px **above** the stage top; main starts it at 496 = the top |
| **Overprinted a trailing `.below-note`** — an engine-supported shape on 26 shipped slides — because the grid still floors at its content | +25.2px of text over text, with the stage probe reading **0** |
| Stranded a lone support's hairline rule 157px above the number it heads | 2-metric slides, now the default shape after count-awareness |

The first two are the same defect in two directions: **a clamped box overflows inside
the frame, where the stage's clip is no longer the thing that catches it.** Growing
past the stage and letting the STAGE clip is the honest failure — visible, and the
probe reports it. That is why the base list keeps `min-height: auto` and only
`compliance` (a flex column that re-flows rather than overprinting) opts out locally.

The naive `min-height: 0` + `minmax(0, 1fr)` combination the issue warned about
reproduces exactly as predicted, and is recorded here because it is the shape a future
reader will reach for first: support `li`s overflowing their rows by 23px and 46px on
`grant-report` p3/p12, `overflow: visible`, metrics overprinting their neighbors, and
the stage probe reporting `over = 0`. Every route through this bug that clamps a box
ends in silent overlap. The row `min-content` floor and the count are the two halves
that don't.

**Process note.** One checker caught a defect in the docs generator. It took the full
adversarial trio — red team, Munger inversion, independent checker — to find that the
central mechanism was half wrong, and the inversion and the checker reached the
`tall`/`strip` shear independently. HARD RULE #25's top rung earned its cost here.

### The allowance, measured

The issue's real ask: the variant had no stated answer to "how much does this hold?",
so an author had no way to stay inside it. Measured across metric count × support shape
× title lines × eyebrow (all four axes monotonic):

| metrics | holds |
|---|---|
| **3** | at up to a two-line title, with or without an eyebrow — the aim |
| **4** | only terse: one status pill, no eyebrow, a one-line title |
| **5** | never, at any label length |

The model predicts the shipped corpus exactly: the component gallery's 4-metric slides
sit precisely on the terse / no-eyebrow / one-line-title corner, and they fit.
`adapt.capacity.wide` moves from sweet 4 / soft 4 / hard 5 to **sweet 3 / soft 4 /
hard 4** — the old `hard: 5` promised a metric the geometry cannot hold.

Two instrument defects were fixed to get a number worth quoting, both of which had
made the allowance unmeasurable rather than merely undocumented:

- `tools/lib/calibrate-core.js`'s `kpi` builder emitted a value and ONE nested bullet —
  a `stats` row, not a `kpi` — so it measured a support about a third short and read a
  generous ceiling. The `wide` ceiling moves 4 → 3 once it renders the real contract.
- `tools/build-component-docs.js` read only the flat `capacity` block, so `kpi` and
  `list` — which declare theirs per-family — printed **no** Capacity line while
  `lint-core` enforced one against them.

### Why `hard: 4` when the rig says 3

These disagree, and the disagreement is real rather than an error in either. The rig
holds words at `density.soft` (8) with the documented **two-pill** target line and
measures a `wide` ceiling of 3; the matrix says a fourth metric fits at the terse
corner — one pill, no eyebrow, a one-line title.

`hard: 4` is the number, for a reason that is about coherence rather than generosity:
the component's own `sample` and its gallery ship 4-metric slides at exactly that
corner, and they render clean. Declaring 3 would put the component's own specimen
outside its own budget and light up `capacity-overflow` on the gallery it exists to
demonstrate. Declaring 5 would promise a metric that fits at no label length. So the
number is 4 and the caveat is carried in the capacity `note`, where `lint-core` inlines
it into the warning, rather than left for the next reader to rediscover.

`calibrate-capacity` will therefore keep flagging kpi's `hard`. That is the tool doing
its job — it measures one point on a surface with four axes, and it says so.

### What the independent checker changed (HARD RULE #18)

The first cut of the docs-generator fallback published a Capacity line for **four**
components. Two of them — `matrix-2x2` and `split-compare` — carry `axisRetired`
instead of `axis`, each with a paragraph explaining why they have no countable item
axis. With no axis, `lint-core`'s `countPrimaryCollection` returns 0 and the capacity
rule breaks out before it can find anything, so those budgets are **not** enforced; and
`axisNoun(undefined)` rendered the line as `~4 undefineds`. A window created by this
change, in a file it merely passed through: the fallback now requires a live `axis`, so
it documents exactly the set the linter actually holds an author to. The same check
found that `tools/build-docs-portal.js` had been left behind, so the prose surface and
the machine catalog `AGENTS.md` points agents at would have stated different budgets —
both now derive it identically.

### What HARD RULE #23 caught here

The first draft of the demo deck asserted "three metrics fit at every label and title
length". Rendering it clipped three of its eight slides. The matrix behind the claim
had omitted the **eyebrow**, which every exemplar carries and which costs a masthead
line; the same draft also claimed `compliance` as the escalation path, and `compliance`
measured a ceiling of **three**, not more. Both corrections came from rendering the
deck and looking at it, not from the reasoning that produced it. The escalation is
`stats` or a split, which is what the manifest's `strip` family already said.

---

## Follow-up (2026-08-03) — the signal did not reach every box that clips

Three of the four cards this swimlane spawned (#1299, #1300, #1279) turned out to be
one sentence seen from three ends: **the overflow signal does not reach everything it
should.** This section records what that actually was, because the shape generalizes.

### The defect was the ALLOWLIST, not any one selector

Both probes took `CLIP_CELL_SELECTOR` — a hand-kept list of four class names — as the
set of boxes to look inside. A hand-kept set is **silent by default**: a box that clips
author content and nobody remembered to add is invisible to the ring, to the export
warning, and to autosplit simultaneously. There is no failure mode where you notice.

`.panel-left` was the missing entry, and it cost more than a missing entry sounds like
it should. `split-panel`'s left panel is `justify-content: flex-end; overflow: hidden`,
so an over-stuffed panel throws its eyebrow and heading off the **block-start** edge —
and block-start overflow does not grow `scrollHeight`. Every scroll-dims measure in the
system read zero. Reproduced on a fixture: **24 text rects cut, the worst by 882px**,
at `over: false`, with no ring, no pill and no console line. A cut tail announces
itself; a cut head does not.

### So both probes discover their boxes, and each is trusted with a different measure

That split is the whole design, and it is not symmetric:

| | box set | measure | why |
|---|---|---|---|
| `probeSectionOverflow` (author, autosplit, `.overflow`) | curated cells **+ discovered** | curated: scroll dims + rect spill + squeeze. discovered: **rect spill only** | drives autosplit — a false positive cuts a fitting slide in half |
| `probeContentClipped` (reader) | **discovered, no allowlist** | real content rects vs. real box | measures glyphs, so a decorative or responsive box cannot fake it |

The asymmetry is load-bearing. Scroll dims LIE about a container-responsive box:
`.chart-body` steadily reported ~43 hidden px on pages that plainly fit, and counting it
produced a false "⚠ OVERFLOW … CLIPPED" that then fed `resplitDoc` and cut a fitting
slide into half-empty pages. A child rect ABOVE a box's top is not open to that
reading — the content is measurably outside the box that clips it. So a *discovered*
box may grow `over` by geometry and never by scroll dims.

### The gate `tell = over && (…)` is gone, and that was the real question

#1299 asked it directly: the content probe was gated behind the geometry probe, so it
could never rescue a slide geometry missed — which made **every geometry blind spot
load-bearing for all three registers at once**. #1299 is the proof it was not
theoretical.

Removing the gate outright would have run a full text-node walk on every section on
every watcher tick. Instead the geometry probe now also returns `clipSuspect`: the
cheap, deliberately over-eager "is any clip box hiding anything, by any measure at
all", including the scroll dims `over` refuses to trust. `tell` reads
`(over && (authorTags || squeezed > TOL)) || ((over || clipSuspect) && cut)`.

The loose measure picks the candidates; the truthful one adjudicates. `.chart-body`'s
phantom 43px now buys a content walk that answers "nothing cut" instead of a false
ring — the same number that used to be a bug is now a useful hint. `author`
short-circuits before the walk, so that register stays purely geometric and exactly as
cheap as it was.

### Cost, measured

On the 117-slide gallery — the largest deck in the repo, and the docs filmstrip renders
all of it at once:

| | whole document | per section |
|---|---|---|
| geometry probe, before | 4.7ms | 0.04ms |
| box discovery added | +7.4ms | +0.06ms |
| `probeContentClipped`, when it runs | 23.6ms | 0.20ms |

Discovery skips childless elements (4706 → 1761), which is half its cost — but ONLY
for `over`. That skip sat at the top of the loop in the first cut and therefore also
filtered `clipSuspect`, which made the two cases this whole change is named after
unreachable: `text-overflow: ellipsis` and `-webkit-line-clamp` both normally sit on a
box whose only content is a text node. The scroll-dims test runs on every clipping box
now; the childless skip guards `flowedSpill` alone. Found by the HARD RULE #25 checker,
reproduced on `premise.gallery.md` p3 (65px — 34% — off "Advanced beginner", silent).

### What the widened set found on the first sweep

Two phantoms had to be excluded before anything else was believable, and both were
found by measuring the corpus rather than by reasoning about it:

- **SVG-namespace boxes.** The UA stylesheet clips `<svg>`, `<marker>`, `<symbol>` and
  `<pattern>`. `<marker>` alone contributed **225 phantom clip boxes**, every one
  spilling and none cutting anything. Excluded structurally, not by name.
- **KaTeX's `.katex-mathml`.** An invisible accessibility twin in a 1×1px clip box whose
  inner text sits under a `static` parent: **23 boxes, a 955px phantom rect each**.
  These were harmless only because the old gate kept the content probe off math slides.
  Loosening the gate without fixing `skipped()` would have pilled every math slide in
  the repo — which is the strongest argument that the two changes had to land together.

With those excluded, the sweep found **one genuine, previously-silent content loss**:
`redline split`'s NEW column ran 31px past its own `overflow:hidden` and dropped the
closing phrase of a statute clause — "…their personal information." — on this
component's own gallery. The `.cell-stage` fit; the section fit; the blockquote was a
clipping box nothing looked at. Fixed here (tighter leading in a two-column track, which
`.three-col` next door already does for the same reason).

### `safe` alignment is the CSS half, and it is a separate fix

The probe change makes the shear **visible**; it does not stop it. `justify-content:
safe center` / `safe flex-end` falls back to `start` the instant content overflows and
keeps the intended alignment while it fits, so a fitting slide is byte-identical and an
overflowing one loses its LAST line instead of its first. Seven alignments in
`split-panel` carry it, plus `wifi`'s card.

Verified separately, which is worth recording because it settles whether #1299 and
#1300 were one card: with the CSS reverted, the widened probe alone catches the shear;
with the probe reverted, the CSS alone catches it (the overflow moves to the tail, where
`scrollHeight` grows). They are **two independent fixes for two halves of one defect** —
detection and loss — and each is separately sufficient for the detection half only.

One alignment could not be made safe and is stated rather than quietly skipped:
`justify-content: space-evenly` on `split-panel`'s supporting list. `safe`/`unsafe` are
`<overflow-position>` keywords the grammar admits only before a `<content-position>`, so
`safe space-evenly` is invalid CSS and would drop the declaration entirely. css-align-3
fixes that value's overflow fallback at `center`, so it can still shear — it is
*detected* (`.panel-right` is a probed cell and the rect walk reads block-start spill),
which is the property that matters.


### What the adversarial trio changed (HARD RULE #25)

Three lenses on the shipping diff, twice — the second round against the state that
actually ships — and between them they found ten defects the maker did not. Recorded
because the pattern in them is more useful than the list.

**The reader half did not exist.** The gate was removed in JS, both watchers drew the
pill on `tell`, every unit test passed, and the export console said the right thing —
and `base.modifiers.css`'s `section:not(.overflow) > .overflow-tab { display: none }`
set the pill to `display: none` on exactly the new population, because `.overflow` is
still (correctly) pure geometry. A `matrix-grid` axis label sliced mid-word rendered
with no pill at all. The inversion pass found it by RASTERIZING THE EXPORT; nobody who
read the diff found it, and the suppressing rule is quoted in a comment one screen away
from the change that trips it. The regression test drives a real export and asserts
computed `display`, because a class assertion passes against the broken build.

**One class, not three.** The first fix for that added a class beside the existing one:
`.overflow-silent` (`over && !tell`) and `.content-clipped` (`tell && !over`) — three
classes for two booleans, each of the new two encoding a CONJUNCTION of both. Round two
found what that shape costs. At `author` the tab was un-hidden by one rule
(`:not(.overflow)` did not match) and styled by neither (both restyle rules key on a
class `author` never gets), so it rendered IN FLOW and took 50px off `.cell-stage` —
438px to 388px — on every author-level slide: the marker was manufacturing the clip it
reported. A predicate split across two classes is a predicate that can disagree with
itself. The register is one orthogonal class now, `.content-cut` = `tell`, and the tab's
visibility, its `position: absolute`, and its restyle all key on the same predicate that
draws it. The test grew a level axis at the same time, because the surviving bug lived at
the only level the test did not drive.

**The new channel's first real yield was 11 parts noise — and the fix for that was
wrong.** Across the corpus it named 13 slides on 5 shipped decks, and 11 were the running
footer's ellipsis, a loss `2026-07-27-footer-band-allocation.md` §"What it costs, accepted
deliberately" measures and takes eight days earlier. The register's own governing sentence
is "a warning that cries wolf teaches its reader to silence it", so the footer band was
exempted. That exemption shipped for two commits and is now removed. Reading the cited doc
past the section that prices the loss: it says the truncation "is not enforced or warned
about", and names the remedy — option (d), "route over-subscription into the existing alarm
so the author is told … the only option that closes the CLASS rather than an instance."
This probe IS option (d). Exempting the footer shipped the mechanism that closes the class
with the class carved out of it, and the ratio argument concealed that: cry-wolf is a rule
about FALSE positives, and every one of those 11 is a legally-operative line being deleted
from an exported text layer — in portrait, roughly three quarters of it. A ratio of true
positives is not a noise measurement.

The exemption also cost two bugs on its way out, which is the real argument against a
carve-out inside a detector. Expressed in `IGNORED_CLIP_SELECTOR` it was matched with
`closest()` and silenced the band's whole subtree — the vertical slice through a
confidentiality mark and any image `footer:` carries, neither of which the doc prices.
Moved into `probeContentClipped` and keyed on axis and bearer kind, it then did not work
at all: layout is UNCLIPPED, so a rect the footer had already cut still overflowed every
box above it, and `continue` simply handed the same loss to the section, which reported it
anyway (`examples/portrait-journey.md` p3: the footer clips at x=992, the text lays out to
x=1115, the section edge is 1080). Two commits, two different mechanisms, one carve-out
that was never justified in the first place.

**Two silent-by-default holes, inside the change whose thesis is that silent-by-default
is the enemy.** A bare `.watermark` in the ignore list also matched the universal
section VARIANT, and both probes exclude via `closest()`, so an entire slide's subtree
dropped out of both. `[aria-hidden="true"]` was worse in both directions: `html: true`
means a deck author can silence detection by wrapping content in it, and this engine
puts `aria-hidden` on elements carrying visible author text. Both are named as elements
now. The lesson generalizes: **a denylist applied through `closest()` is silent over a
whole subtree**, so every entry must name an element, never a class an author can reach.

**`skipped()` closed the ancestor-walk hole for the ignore list and not for
`position`.** A docked `footer` is absolute and the `<code>` inside it is static, so
eight phantom cuts lived in split-panel's own gallery, masked only because
`clipSuspect` happened to be false there. CSS's own rule settles it: an absolutely
positioned element is clipped by an ancestor only if that ancestor is its containing
block.

**Two claims were reasoning where a measurement was available**, and both were wrong:
`space-evenly` falls back to `start` in Chromium 131, not `center` (so it cannot shear
at all), and the content probe was 5.7× dearer than the comment beside it claimed. The
absolute millisecond figures are gone rather than corrected — this machine gives a 3×
spread on identical code, which is the trap `2026-08-03-performance-guard.md` documents.

**And the `safe` sweep was too narrow.** The first cut fixed the two components with
issue numbers. `stage.css`'s `align-middle` / `fill-center` / `align-bottom` /
`fill-anchor` are UNIVERSAL modifiers riding on every component, and the inversion
reproduced whole-item loss with a bare `_class: list align-middle`. 34 alignments carry
`safe` now, including the chart family's `.chart-body` and both mermaid wrappers.
