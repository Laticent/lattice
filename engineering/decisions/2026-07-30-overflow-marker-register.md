---
status: shipped
summary: A delivered Export-to-Marp bundle put a red QA ring, an "OVERFLOWS" flag, and per-cell "FIX ME" overlays on every clipped slide — the bundle renders through the browser runtime inside marp-cli, so it inherited the runtime's AUTHORING default by accident. The marker was NOT a false positive (258 slides / 9 decks, zero false positives; a 12-slide boundary ladder measured identically on both paths), so the fix is not to hide it but to say who it is addressed to. Two shipped policies had disagreed and both were right on their own surface — the emulator strips the marker and warns on stderr, the runtime draws it so a reader never gets a silent clip — which makes it a configuration, not a constant. New `overflow-marker: author | reader | off` deck register plus a `--overflow-marker` flag on tools/export-marp.js; `reader` is the export default (no ring, a calm "More below" pill, so a clipped slide still says so without being a bug report), `off` must be opted into. Two traps found building it — a `:root[…]` gate is rewritten by marp-core's selector scoper into a slide-inside-a-slide and silently never matches (the gate rides on the section instead), and the register must be read at column 0 so a key nested under `meta:` cannot decide a delivered artifact. The emulator's PDF/PNG/PPTX path does not read the register yet and is unchanged.
---

# The overflow marker becomes a register, and the export stops shipping QA chrome

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
a slide that fits is a different bug with a different fix.

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

A deck front-matter register, `overflow-marker:`, with three levels
(`lib/core/resolve-overflow-marker.js`):

| level | what an overflowing slide shows | default for |
|---|---|---|
| `author` | red ring, "Overflows" flag, per-cell "Fix Me" overlays, the §8-rule-8 type-floor alarm | the live preview / Studio |
| `reader` | no ring; the same text-labeled tab restyled into a calm **"More below ↓"** pill | **an export** |
| `off` | nothing | never — opt in explicitly |

**`reader` is the default, and it is the least-bad choice rather than a good one.**
It keeps the property that matters — a slide that clips still says so, in text, so
nothing is silently lost — while dropping everything that only helps someone
*fixing* the deck. `off` stays available for an author who has already checked the
deck and wants a wholly clean artifact; it is never the default, because a default
that hides a defect is the failure mode this whole swimlane exists to prevent.

**Resolution order** is flag → deck front matter → default, decided in
`tools/export-marp.js`:

- `--overflow-marker=<level>` decides ONE artifact ("this one goes to the board")
  without editing the source deck.
- the deck's own `overflow-marker:` key states the author's standing intent.

The resolved value is **written into the emitted front matter**, unconditionally.
That is what makes the bundle self-documenting: a recipient reads the policy in the
deck they were handed and changes it by editing one line, and the same key is what
`frontMatterBlock` bakes for the runtime — one value, one grammar, so the visible
front matter and the runtime's copy cannot disagree.

### The second channel

Whatever the level, `export-marp` now prints the policy on the author's console, and
`off` gets an extra warning. It states plainly that **it did not measure** —
`export-marp` never renders, which is why it finishes in about a second — and names
the command that does (`lattice-emulator.js`, which prints
`⚠ OVERFLOW — N slides … pages X, Y` from the same probe). A disclosure that named a
measurement it had not taken would be worse than none (HARD RULE #23).

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

**2. The register must be read at column 0.** The shared `frontMatterValue` reader
tolerates leading whitespace, so it finds a same-named key NESTED under a mapping
(`meta:` → `  overflow-marker:`). Harmless for most registers; here it would let
unrelated config decide what a delivered artifact shows. This register reads and
writes at column 0 only, matching how `lib/authoring/lint-core.js` anchors `^form:`.

## Verified

Rendered through **real marp-cli** (not the engine, not a harness), converted to PDF,
rasterized and looked at — HARD RULE #23:

| level | page 2 (overflows) | page 1 (fits) |
|---|---|---|
| default (`reader`) | calm "More below ↓" pill, bottom-center, no ring | no marker |
| `--overflow-marker=author` | red ring + "OVERFLOWS" flag + "FIX ME" overlay | no marker |
| `--overflow-marker=off` | nothing | no marker |

Dark mode checked separately (`color-mode: dark`): the pill is palette-blind
(`--text-body` on `--bg`) and inverts correctly. The fluid viewer was re-screenshotted
at 390×844 after the CSS move and is unchanged.

The probe is committed at `test/fixtures/overflow-marker-probe.md`, with the exact
render commands in its header comment, so the claim above is reproducible rather than
resting on the screenshots in this note. Page 1 fits and page 2 does not, on purpose:
a change that started marking slides that FIT would be a worse defect than the one
this fixes.

## Not in scope, and why

**The emulator's PDF / PNG / PPTX path does not read this register yet.** It is
hard-wired to the equivalent of `off` plus its stderr warning — which is already the
right default, so nothing is broken there, but `overflow-marker: author` will not put
a ring in a PDF. Wiring it up means changing the bytes of the primary export artifact
and touching the emulator's separate inline watcher copy, which is its own change with
its own sign-off. It is the next item in this swimlane, and the scope limit is stated
in `resolve-overflow-marker.js`'s header rather than left for someone to discover.
