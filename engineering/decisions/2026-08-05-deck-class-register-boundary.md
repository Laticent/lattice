---
status: shipped
summary: "#1402 measured 40 of 168 `color-mode:` × `class:` × `_class:` combinations wrong, all of them decks carrying BOTH registers. A first fix (#1416, reverted) let the illegal token be stamped and subtracted it afterwards; subtraction needs provenance the class list no longer has, and it shipped four regressions including a runtime that deleted a slide's own component. This lands the opposite shape: the deck-wide `class:` register is FILTERED where it is read, so nothing illegal is ever stamped and every propagation kernel is purely additive — no provenance, no strip, no unstamp. Two tokens are refused: a color-axis token when `color-mode:` is set (the key always wins, including over `class: print`), and a COMPONENT name (the register is appended over a slide's own `_class:`, so a component there collides rather than composes). The refusal is applied at the engine door, both propagation kernels, and the Export-to-Marp bytes — the last because MARP stamps the front matter before our append-only runtime loads. `color-mode:` also gets ONE reader, shared by `deckPrintBand`/`deckDarkBand`/propagation, closing a live loose-vs-strict split, and both registers with a WRITER are now read at COLUMN 0 the way they are written — reading them loosely while writing them strictly let a nested `color-mode:` drop a real top-level `class: dark` on the render path that the exported bytes kept, which is this change's own bug caught by probing; and `--print` / `--image-mode print` now write `color-mode: print` rather than merging the alias the key supersedes, which is what made the flag a silent no-op on a `color-mode:` deck (1.28:1 print ink on a dark chip). The MID-DECK global `<!-- class: X -->` is deliberately NOT governed — it is scoped differently, cannot collide, and the corpus ships a deck that relies on it. 378 of 980 table rows wrong before, 0 after; all 260 committed decks lint clean, and no deck whose source is untouched renders differently."
builds-on: 2026-07-11-color-mode-frontmatter.md
---

# The deck-wide `class:` register is filtered at the boundary, never stripped after

## The defect

`#1402` rendered all 168 combinations of `color-mode:` × a legacy `class:` color
token × a per-slide `_class:` through the real engine. **40 were wrong, and every
one of them was a deck that set both registers.** Two roots:

- **A slide's own pin was silently deleted (16).** `color-mode: light` +
  `class: dark` + `_class: content dark` rendered LIGHT. The propagation kernel
  stripped the superseded alias **by value**, and by the time it ran the deck's
  `dark` and the slide's `dark` were the same string on the same section.
- **Print ink on a canvas that is not print (28).** `deckPrintBand` honored
  `class: print` unconditionally while the propagation kernel discarded it
  whenever `color-mode:` was set. The bake said print; the CSS said light.

The recurrence is the real subject: this axis had already produced #1326 (×4),
#1329 and #1340. Each was fixed as a repro.

## What was decided, and what was refused

### 1. `color-mode:` always wins over the legacy `class:` color axis

Including `class: print`. A slide's own `_class: dark` still wins for that slide;
`print` still survives a slide's scheme pin, because print is a medium and not a
scheme (`slidePinEvictsDeckToken`, unchanged).

### 2. A COMPONENT name in the deck-wide `class:` is a no-op, plus a lint warning

`class: kpi` reads as "every slide in this deck is a KPI slide", which is not a
deck. Owner-directed, and the direction is the rationale: the register is
deck-WIDE, and a layout is not a property of a deck.

**Be precise about what is being retired, because half of it worked.** On a deck
where any slide names its own `_class:`, the register never worked: it is
**appended over** that slide's class, so `_class: cards-grid` on a `class: kpi`
deck put two components on one section and let CSS source order pick the winner.
But on a SINGLE-LAYOUT deck — `class: kpi`, no per-slide directive anywhere — it
did exactly what it said, and this change retires that: those slides fall back to
`content`. An earlier draft of this record claimed the register "never worked"
and had "no correct behavior to preserve". That was wrong, and the diff itself
says so — it removes an ordering comment in `defaultComponent` written to make
`class: <component>` count (#1292), a runtime comment describing `kpi` alone as
the reference answer, and a passing test named *"a deck-wide `class: image` still
builds the .image-text panel"*.

Shipped as the drop **and** the warning in one change, not warning-first: a
warning-only release would leave the engine, the runtime and the export
disagreeing about the same deck, which is the condition this change exists to
end. Zero decks in the corpus use the form — but that is evidence about this
repo's authoring idiom, **not** about users. An external single-layout deck is
exactly the shape this corpus is least likely to contain, which is why the
refusal is not silent:

  · `lint:deck` reports `deck-wide-component`, naming the token and the fix;
  · the render CLI prints a `warning:` line on stderr for every refused token,
    because the person whose deck changed shape is rendering it, not linting it.

### 3. The MID-DECK global `<!-- class: X -->` is NOT governed

This is the one place the redo departs from the issue as written, and the corpus
is what forced it. The two spellings look interchangeable and are scoped
differently, in a way that is load-bearing:

| | front-matter `class:` | `<!-- class: X -->` |
|---|---|---|
| reaches a slide with its own `_class:` | **yes** — appended | no — spot replaces global |
| can collide with a slide's component | **yes** | never |
| bounded | no | yes — write another one |
| position relative to `color-mode:` | same block | below it, in document order |

So a component name in a running global is legitimate ("this run of slides is
diagrams"), and `examples/slide-class-forms.md` — shipped with the #1374 work —
does exactly that. Refusing it would delete a working capability *and* need the
refusal spelled a third time in `lib/core/slide-class-spans.js`, which resolves
the global to answer the band question; without that, a diagram would bake for a
canvas the section no longer had. Measured on `main`: this combination is already
correct and self-consistent (section `dark`, span `dark`, band `dark`) and is not
among the 40.

A mid-deck global therefore overrides `color-mode:` locally for the same reason a
spot `_class: dark` does — which the outcome deliberately preserves.

## The shape: filter at the boundary

The reverted attempt (`colormode-attempt-1`) let the token be stamped and
subtracted it afterwards. Subtraction needs to know whether a token came from the
deck or the slide, and only one of the three code paths could carry that. Four
regressions followed from that one choice:

- **R1** — the runtime deleted a slide's own component (it subtracted the deck's
  token from a resolved list where the two are one string).
- **R2** — a loose/strict regex split re-created the #1326 shape.
- **R3** — `--image-mode print` became a no-op while `manifest.json` said otherwise.
- **R4** — a mid-deck global was silently deleted.

`lib/core/deck-class-register.js` refuses the token where the register is **read**:

| Boundary | Why it is a boundary |
|---|---|
| `lib/engine/index.js` (`globalBase.class`) | what the engine's native directive application joins onto every section |
| `lib/integrations/markdown-it/plugins.js` (`deckClassPropagate`) | the append pass |
| `lib/runtime/index.js` | the DOM mirror of that pass |
| `lib/core/marp-bundle.js` (`withRuntimeScripts`) | **MARP** stamps the front matter, before our runtime loads |

The export boundary is the one that cannot be served by filtering at read time.
An exported bundle is rendered by Marp; the Lattice runtime that loads afterwards
is append-only by design (it sees a resolved class list, where the deck's token
and the slide's are one string), so whatever Marp stamps is final. The refusal
has to happen in the emitted bytes. `withSanitizedDeckClass` also collapses a
duplicate `class:` line, because Lattice reads the first and js-yaml — which Marp
parses with — takes the last, so a deck carrying two rendered differently on the
two sides of the export.

With the filter in place, **no kernel removes anything**. R1 and R4 are not fixed;
they are unrepresentable.

## Two more single-source repairs, both on-path

**One reader for `color-mode:`.** The key had three spellings — an anchored
`^…$` regex in the propagation kernel, an unanchored `([A-Za-z]+)\b` in
`deckPrintBand`, and `frontMatterValue` in `deckDarkBand`. A trailing YAML
comment separates them:

```yaml
color-mode: light  # migrated 2026-08
class: print
```

The unanchored read still sees a value; the anchored one does not. That is a live
#1326 instance on `main`, and it is also precisely the regression the reverted
attempt introduced. All three now call `deckColorModeToken`, which routes through
the shared linear-time `frontMatterValue`. A value with a trailing comment
resolves to *no* color mode, consistently everywhere, and `unknown-color-mode`
flags it — no reader guesses.

`deckPrintBand`'s class-line test is whole-token membership now rather than
`\bprint\b`, which also matched inside `print-safe` (a `-` is a word boundary).

**`--print` writes the register that wins.** The flag used to merge `print` into
`class:` — the register `color-mode:` supersedes. On any deck that set
`color-mode:` at all, `--print` and `--image-mode print` therefore produced a
light or dark canvas while the ink and `manifest.json` both said print: measured
at print ink `#1A1A1A` on a dark chip `rgb(46,46,46)`, **1.28:1**. It writes
`color-mode: print` now. A CLI flag is the strongest available statement of "this
deck is going on paper", so it writes the register that wins rather than the one
that loses. The transform moved out of `lattice-emulator.js` into
`lib/core/resolve-color-mode.js` so it is testable as behavior, and the band
resolution is handed `WANT_PRINT` (which `--image-mode print` also sets) rather
than the narrower `flags.print`.

This was logged in #1416 as an off-path pre-existing hole. It is not off-path
here: making `color-mode:` supreme is what decides what `--print` means, and
leaving it would have turned a latent 1.28:1 into a guaranteed one.

## The gate

`test/unit/core/color-register-table.test.js` — 7 `color-mode:` values × 5
`class:` values × 7 `_class:` values × 2 flag states × **both `class:`
spellings** = 980 rows, each checked on **three** axes: the section's color
tokens, the section's COMPONENT, and the band its Mermaid ink was baked for. On
`main` at `6008dff`, **378 rows were wrong** (314 color, 40 component, 24 band);
**0 are now.**

The row set is chosen so that each of R1–R4 is a **row**, not a paragraph. Four
axes the earlier table lacked, each one the reason a regression was invisible
to it:

- **a COMPONENT on both the deck and the slide axis** (`class: kpi` × `_class: kpi`)
  — without it, a deck-wide component overwriting a slide's own reads green (**R1**).
- **a `color-mode:` value carrying a trailing YAML comment**
  (`light  # migrated 2026-08`) — without it, the anchored and unanchored readers
  agree on every row (**R2**).
- **`flagPrint`** — without it, `--image-mode print` becoming a no-op reads green
  (**R3**).
- **both `class:` spellings** — without them, the front-matter and mid-deck-global
  forms can answer differently with nothing to notice (**R4**).

One more piece of coverage sits outside the table, because the table is a pure
resolver and this is the live runtime:

- **a runtime section that names its own component** —
  `test/integration/parity/runtime-frontmatter-refire.test.js` drives the real
  `dist/lattice-runtime.js` in jsdom against a `<section class="kpi">`. The old
  parity coverage only ever fed an un-classed section, which is the other half of
  why R1 was invisible.

And it is not called a render test. It reads a class string and a band string; it
resolves no CSS and produces no pixel, so it cannot say which canvas a slide
draws — CSS decides that by stylesheet order, not by attribute order. Deriving
"the canvas" from attribute order is what let a broken table read green
(HARD RULE #23).

## Two surfaces the change would otherwise have broken

Both are fixed here rather than filed, because this change is what breaks them
(HARD RULE #18):

- **The Studio's print export** stamped `class: print` (`share-export.ts`,
  `PrintOptionsPanel.tsx`). Under supremacy that is a no-op on any deck with a
  `color-mode:` key — a color canvas exported under a print label. It writes the
  key now, through one shared `withPrintCanvas` helper that also clears the legacy
  alias, mirroring what the Inspector's own color-mode control already did.
- **The Studio's theme swap** preserved an outgoing `-dark` theme name as a
  `class: dark` pin. Same no-op on a `color-mode:` deck; it writes
  `color-mode: dark` now, which is what that file already calls "the single home
  for deck color mode".

And one that was already wrong and is on this path: the **exported player's**
default scheme was a FOURTH spelling of the `color-mode:` read, with a
`\bdark\b` substring test over the `class:` line and no supersession at all — so
the player could open dark on a deck the render had just made light. It reads
`deckColorModeToken` now, with whole-token membership for the legacy fallback.

### And one this change broke on its own, found by probing rather than by a test

A register with a WRITER has to be READ the way it is written, and it was not.
`frontMatterValue` matches `^[ \t]*key:` — an indented key too — while every
writer in this repo anchors at column 0, because an indented `class:` may be a key
nested under another one or a line inside a `style: |` block scalar, and rewriting
either corrupts the deck. The filter made that gap load-bearing:

```yaml
---
foo:
  color-mode: light      # the loose READ finds this…
class: dark              # …and drops the author's real register,
---                      # while the export writer, at column 0, keeps it
```

The render path resolved that deck without `dark`; an Export-to-Marp of the same
bytes kept it. One source, two decks — which is the failure this whole change
exists to end, arriving through the fix for it, and self-inflicted rather than
pre-existing (before the filter, a spurious `color-mode:` read superseded nothing).

`topLevelFrontMatterValue` is the strict read — and it turned out to be right for
only ONE of the two keys, which is the correction worth recording. Applying it to
`class:` as well produced the mirror-image bug in the more dangerous direction:
`parseFrontMatter` (lib/engine/directives.js) calls `line.trim()` before matching
its key/value, so the ENGINE stamps a `class:` at any indentation onto every
section. A reader stricter than the stamper does not ignore a non-register, it
answers for a canvas nobody is painting — ` class: print` rendered a
`section.print` page while `deckPrintBand` said light, and the diagram baked light
ink onto it. Caught by the independent checker, with rasterized proof.

So the rule is not "both registers with a writer read strictly". It is **read the
key the way the thing that ACTS on it reads it**:

| key | acted on by | so it is read |
|---|---|---|
| `class:` | the ENGINE's `parseFrontMatter`, which stamps it | loosely — any indentation |
| `color-mode:` | nothing in the engine; only Lattice writers, all at column 0 | strictly — column 0 |

That asymmetry looks like an inconsistency and is the opposite: it is the only way
both readers agree with what actually happens to their key. The looser reader stays the default
for the ~20 read-only keys: being loose in a reader is survivable in a way that
being loose in a writer is not, and a repo-wide sweep is not this change. The
docs-site preview (`docs/src/lib/deck-theme.ts`, a fifth reader that cannot import
`lib/core` — Rollup will not read named exports off a CJS file outside the docs
root) mirrors the rule with a note, so it can no longer pin a preview mode off a
nested key the render ignores.

## Blast radius

Zero committed decks change. No deck names a component in its deck-wide `class:`
(654 with front matter, checked — including this branch's own two); none sets
`color-mode:` alongside a `class:` color token (9 set `color-mode:`, none
collides). All 260 decks lint clean with no new findings.

Two committed PDFs DO change bytes — `examples/print-mode.pdf` and
`examples/color-mode.pdf` — because this change edits their SOURCES (`print-mode`
migrates to `color-mode: print`, the canonical spelling). No deck whose source is
untouched renders differently.

**Breaking for an external deck** that uses either refused form. The lint warning
`deck-wide-component` names the token, the reason, and the fix.

## What is still open

- A **trailing YAML comment** on any front-matter value is not understood by
  `frontMatterValue`, so `class: dark  # note` contributes `#` and `note` as class
  tokens. Consistent across every reader, and out of scope here — it is a property
  of the shared front-matter reader, not of this axis. `color-mode:` is the one
  register where it is not merely inconsistent but silent, so that half is closed:
  the value resolves to no color mode, and `unknown-color-mode` now says so
  (`color-mode-parse-parity` pins the linter to the resolver). Note the deliberate
  asymmetry with `pace:`, whose own resolver DOES strip a comment — one register
  forking the front-matter parse is a smaller cost than two parses, but it is a
  fork, and the day `frontMatterValue` learns YAML comments both should collapse
  onto it.
- **The remaining `_class:`-only regexes are all in `docs/src`** — `Editor.tsx`
  (syntax highlight), `coach-core.ts`, `lint.ts`, `present-sections.ts`,
  `present/rehearsal.js`, `compose/deck-source.ts`, `playground-controller.ts`.
  None is an authoring RESOLVER (the class of reader #1383 named and this change
  swept); they highlight, trigger autocomplete, or weight a rehearsal beat, and
  their failure mode is a cosmetic miss rather than a contract checked against the
  wrong component. `rehearsal.js` carries a comment saying why it is not wired in
  (its slide indexing does not line up with `splitTopLevel`'s) and what would
  change that.
- **No gate stops a future component name colliding with a shipped modifier.** The
  intersection is empty today (verified both directions); the catalog grows by
  design. A component named `dark` would now be refused for the wrong reason.
- **A USER-DEFINED library component is not refused.** `isComponentToken` reads the
  shipped stage catalog, which a library component (`lib/layout/bridge.js`
  `referencedComponents`) is not in — so `class: <my-component>` deck-wide still
  stamps, with the same collision the ban exists for. Extending the refusal there
  means injecting a vocabulary the pure kernel cannot read, which is a design
  question rather than a patch.
