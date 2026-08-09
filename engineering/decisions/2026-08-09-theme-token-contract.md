---
status: proposed
summary: >
  #1450 asked for a theme manifest on the premise that "the strictest contract
  governs the machine and the loosest governs the human." Measured, that premise is
  INVERTED: a hand-authored palette is gated on 107 tokens (95 in
  token-parity.test.js + 12 in checkCatInkDeclared), the Studio's generator on 83 —
  and a generated theme fails the repo's own hand-theme gates on 27 tokens. The real
  defect is not asymmetry, it is a CLASS: the generator omits engine tokens that have
  NO safe default, and three instances ship today. Verified on the real render CLI,
  not a harness — a Studio-shaped theme paints Mermaid subgraph boxes SOLID BLACK on
  5 of 8 slides (the documented PDF-path black sentinel, via --c-container /
  --c-container-edge), and stripping the 12 curated --cat-N-ink drops label text from
  4.65:1 to 4.16:1, through the AA floor, on 66 slots across 13 of 14 palettes.
  RECOMMENDATION: do not build the manifest as specified. Its obligation model is on
  the wrong axis (obligation is a per-token-per-THEME-ROLE fact — three incompatible
  scopes of 14/15/32 files already exist, and `--accent` is authored for onyx and
  inherited for onyx-dark), #1302's carbone question is a MODE-axis fact a token
  contract cannot express, and manifest-as-input would delete the only thing
  containing an unescaped CSS emitter whose output reaches a same-origin preview
  frame. Instead: widen the generator to cover every no-safe-default token, and gate
  it with a COMPUTED closure rather than a declared list — the repo's two existing
  hand-maintained token lists have already drifted (95 vs 91) and are both stale on
  `carta`.
---

# The theme token contract — the asymmetry runs the other way, and the real defect is a class

#1450 proposes a per-theme manifest, on the strength of one sentence: *"the strictest
contract governs the machine's output and the loosest governs the human's — backwards
from where mistakes actually come from."*

That sentence is the load-bearing claim, and it is false. This note reproduces the
measurement, states what is actually broken (which is worse than what was filed),
answers the issue's three open questions, and recommends against building the
manifest as specified.

Verified by the full adversarial trio (HARD RULE #25) — fact-checker on the claims,
red team and Munger inversion on the design. Six of my own findings were refuted in
the process; they are corrected in place below rather than quietly dropped.

## 1. The premise, measured

`REQUIRED_THEME_TOKENS` (10, `tools/check-ownership.js:149`) is not *the* human
contract. It is the smallest of several, and the issue compares it against the
generator's total.

| Gate | Where | Tokens |
|---|---|---|
| `CONTRACT` | `test/unit/palette/token-parity.test.js` (in `npm test`) | **95** |
| `checkCatInkDeclared` | `tools/check-ownership.js:3660` (in `build:check`) | **+12** (`--cat-N-ink`) |
| `checkThemeTokenParity` | `tools/check-ownership.js:1914` | 10 (a subset of the 95) |
| `scorecard:check` | `tools/theme-scorecard.js` | 91 (a hand mirror of the 95) |
| **`REQUIRED_TOKENS`** | **`lib/theme/derive.js:126`** — *the generator* | **83** |

**A human is held to 107 gated tokens. The generator is held to 83.** Serialize a
theme through `deriveTheme` → `serializeTheme` and drop it in `themes/`, and it fails
the repo's own hand-theme contract on **27 tokens** — 15 core plus all 12 inks. The
asymmetry is real and it points the other way.

That reading also makes sense of the design. A generator has no eyes and ships
whatever it is told, off-repo, where no gate reaches; a human authoring a theme sits
inside a feedback loop — `npm run new:theme` scaffolds from indaco with
`TODO(palette):` markers, 22 palette test files check relationships, and the output is
a PDF you look at. The floor-vs-total split is defensible. What is not defensible is
the generator's total being short.

**Corrections to my own first pass**, since they are the kind that survive into a
design if nobody checks: my census regex was `[a-z0-9-]`, which cannot match
`--hljs-built_in`, so every per-theme count was low by one and that token looked
universally missing when it is universally declared. Real per-theme counts are
**116–130** unique tokens (not the issue's "~232", and not my 115–129). Exactly **2**
required tokens are declared by no palette — `--on-accent-soft` and
`--accent-soft-body` — and both have deliberate `:root` defaults at
`lib/base/base.tokens.css:606-607`, documented as intentional inheritance in
`token-parity.test.js`'s own header. So the contracts are not "misaligned in both
directions." They are misaligned in one: the generator's.

## 2. What is actually broken — a class, not an instance

The generator omits engine tokens **that have no safe default**. There is no
gate for this, because a Studio theme never lands in `themes/`, and every gate scans
that directory.

Three instances ship today:

| Family | Default in the base layer | What a generated theme does |
|---|---|---|
| 12 × `--cat-N-ink` | none at `:root` — deliberately (`check-ownership.js:3680`) | falls back to `--cat-N-mark`, which is contracted only to 3:1 (non-text) |
| 6 × `--c-*` containment | **none anywhere** | `mermaid-theme-map.js` maps `clusterBkg`/`clusterBorder` → the PDF path's **black sentinel, which ships** |
| `--spectrum` | none at `:root` (component-scoped only) | 11 reads in `lib/`, **none** with a fallback |

### Verified on the real surface (HARD RULE #23)

Driven through `node dist/lattice-emulator.js` to **PNG bytes** in Chromium 131 — the
real CLI on a real committed deck, not a unit test.

**The containment hole.** Generated a theme exactly as the Studio does
(`deriveTheme` → `serializeTheme`, 83 tokens) and rendered
`examples/containment-tier.md`:

```
⚠ Palette missing CSS variable: --c-container
⚠ Palette missing CSS variable: --c-container-edge

hand-authored (indaco):  0 of 8 slides with a large near-black area,        0 black px
Studio-shaped theme:     5 of 8 slides,                             2,853,894 black px
```

Up to **23.9% of a slide** is a solid black box, with the subgraph's own labels
rendered dark-on-black. `mermaid-theme-map.js:41-44` documents exactly this: *"The PDF
path warns and substitutes a black sentinel… and that sentinel SHIPS: `prune()` drops
only empty strings, so the element renders literally black."* The warning is in the
build log; nothing fails.

**The ink tier.** Took `themes/indaco.css`, deleted only its 12 `--cat-N-ink`
declarations — the generated-theme shape, isolated — and rendered
`examples/bloom-engineering-journey.md` both ways. **3 of 13 slides differ.** Against
the real local background (`--bg-alt` `#F2F5FA`, sampled from the raster):

| painted | with curated ink | with the mark fallback |
|---|---|---|
| `premise` label | `#277A76` — **4.65:1** | `#30827E` — **4.16:1** |
| `split-panel` label | `#757026` — **4.68:1** | `#7B772D` — **4.25:1** |

The curated inks clear the 4.5:1 AA floor; the fallbacks fail it. Across all 14 base
palettes, **66 slots on 13 of them** go sub-AA without the curated ink — `onyx` is the
only one unaffected. That is the state every Studio-generated theme ships in.

So #1411 is filed as "the Studio's meter can read green on a sub-AA ink." It is
stronger than that: a generated theme ships sub-AA text *and* black diagram boxes in
the real exported artifact.

## 3. Why the manifest as specified does not fit

Four independent objections. Each was found by attacking the design, not by defending
the status quo.

**3.1 The obligation model is on the wrong axis.** Tagging each *token*
`derived`/`authored`/`inherited` assumes obligation is a property of a token. It is a
property of a token **per theme role**: `--accent` is authored for `onyx` and
inherited for `onyx-dark`. The repo already computes three *different, non-nested*
scopes for "which theme files does this rule apply to" — `listBasePalettes()` gives
14 (`@import 'lattice'`), `checkCatInkDeclared` scans all 32 and enforces on 15 via a
per-file heuristic, `derive-cat-ink.js` selects 15 another way. `a11y-base.css` is in
the latter two and not the first, because it imports `onyx`, not `lattice`. A global
per-token tag has to pick one scope, and measured against the real tree, picking "all
32" produces **180 false core-token failures and 204 false ink failures** across the
13 `-dark` files and 4 CVD files that legitimately inherit.

This is also the answer to the issue's own complaint. "What a theme *claims to own*
versus what it *deliberately inherits*" is a statement about theme roles. A global
token contract cannot say it.

**3.2 #1302 is a mode-axis fact, not a token absence.** carbone declares 81 of 83,
the same as every other palette. "No light face" means
`:where(:root) { color-scheme: dark }` (`themes/carbone.css:70`), `light-dark()` pairs
deliberately degenerate, and no `-dark` counterpart. `serialize.js:77` **hardcodes**
`color-scheme: light`, so the generator structurally cannot emit a carbone-shaped
theme at all. No per-token vocabulary answers this question.

**3.3 Manifest-as-input would delete a containment boundary.** `serializeTheme`
interpolates both names and values into CSS text with **no escaping** — demonstrated
live, from both the `description` channel and a token value:

```
description: 'A*/ :root{--bg:red} /*'   → injected rule present in output: true
value:       '#fff; } section{…url(https://evil/beacon)} :root{ --z:1'
                                        → injected rule present in output: true
```

Today that is contained by construction: every value reaching `serializeTheme` has
been through `deriveTheme`'s `normalizeHex`/`oklchToHex`. Manifest-as-input makes the
manifest a value channel straight into that emitter — and the output travels as
`extra.css` into the Studio's `srcdoc` preview, the same-origin un-sandboxed frame
HARD RULE #22 exists for (`sanitizeSlideHtml` covers the HTML, not the theme
`<style>` block). This, not "the generator is currently incomplete", is why
manifest-as-input is refused: incompleteness is fixable in a day and loses the
argument; an unescaped emitter reaching a same-origin frame is a prerequisite.

**3.4 A declared list is the thing that rots, and the repo has already proved it.**
`token-parity.test.js` and `theme-scorecard.js` are two hand-maintained enumerations
of one fact. They have **already drifted**: 95 vs 91, and the four that fell out are
exactly `--c-container-edge`, `--c-subcontainer-edge`, `--c-on-container`,
`--c-on-subcontainer` — added to the test with a justification comment, never mirrored.
Both also hardcode a 13-name `THEMES` array, and **`carta` is a shipped base palette
in neither**, so it is checked by neither. The glob-based gates cover it
automatically. A third declaration would be a third thing to forget.

There are also more readers than the design counted: `docs/src/components/studio/Fabricate.tsx`
carries its own hand-written `CONTRACT` (and already says "~80 tokens" for 83), and
`lib/theme/contrast.js` hardcodes the slot count `12` while importing only `color.js`
— falsifying `derive.js:59-62`'s claim that the count "can never drift."

**What survived the attack**, and is worth recording because it was the design's
biggest perceived risk: **bundling a JSON into the browser path is fine.** The real
`lib/theme` graph builds through esbuild with a `require('./token-contract.json')`
inlined as a `__commonJS` module, and `lib/components/manifest.schema.json` is the
shipped precedent. Freshness is gated by `theme-core:check` plus a behavioral parity
test. The export concat-order assumption is also undisturbed: `--cat-N-ink` has no
base `:root` default, so a theme's own declaration wins under either order.

## 4. The three open questions, answered

**Q1 — manifest-as-input (CSS generated) or manifest-beside-CSS?**
**Neither.** Manifest-as-input is refused on §3.3 — it removes the containment that
currently stands between author-typed text and an unescaped CSS emitter feeding a
same-origin preview frame. Manifest-beside-CSS is refused on §3.4 — the issue's own
fatal objection, and the repo has two live instances of that failure already. Themes
stay hand-written CSS. What gets single-sourced is the *generator's* contract, and it
should be **computed**, not declared (§5).

**Q2 — require all 83, or declare which are deliberately inherited?**
**Neither, as posed.** "Deliberately inherited" is not a per-token global fact (§3.1),
and the two tokens that looked like the seed of such a list turned out to be
documented, correct inheritance with `:root` defaults. The question worth answering is
the falsifiable one: *does this token have a safe default?* That is a property of the
**engine**, not of a theme, and it can be derived from source rather than declared —
`checkCatInkFallback` and `diagramTokenClosure()` already do this shape of analysis.

**Q3 — does this subsume the deferred engine-level seed derivation from
`2026-07-15-categorical-token-contract.md`?**
**No — separate, and neither blocks the other.** The deferred item changes how the 12
categorical slots are *computed* (derive from a hue set so `fill == mark` is
structurally impossible). This is about who *declares* what. They compose. Nothing in
the code couples them. (This was the one part of my original answer the trio left
standing.)

## 5. Recommendation

In dependency order. The first item is the harm; everything after is prevention.

1. **Close the class at the generator.** Add the no-safe-default families to
   `REQUIRED_TOKENS` with real derivations: the 12 `--cat-N-ink`, the 6 `--c-*`
   containment tokens, `--spectrum`. Per HARD RULE #18 the containment hole is the same
   class as #1411 and belongs in the same change, not a follow-up.

   **This is not a data edit**, and my first draft was wrong to call it one. A
   contract row with no derivation behind it fails immediately — `theme-derive.test.js`
   and `theme-serialize.test.js` assert `requiredTokenList()` is fully populated, and a
   scratch run adding one row produced **9 test failures**. Closing #1411 means porting
   `solveInk` + `feasibleRange` + `armCollapsed` + `separateArm` from
   `tools/derive-cat-ink.js` (~200 lines of two-pole OKLCH search with anti-collapse)
   into the browser-bundled `derive.js`. No new primitives are needed — `color.js`
   already exports them — but it is real shared logic with two throwing failure paths.

   **Open risk, reasoned but not run to exhaustion:** the `brand-mono` ramp strategy
   locks hue to the accent and separates by lightness. On a `pine` starter, light arm,
   the solver reaches the anti-collapse guard with one collapsed pair. `deriveTheme`
   today never throws for a valid essential set; this would give it a browser-facing
   throw driven by a user's ramp choice. Decide what the Studio does in that case
   before shipping.

2. **De-rot the two hardcoded theme lists.** Replace the 13-name `THEMES` arrays in
   `token-parity.test.js` and `theme-scorecard.js` with the same directory scan
   `listBasePalettes()` already performs. Four lines each; permanently closes the
   `carta` gap and the next one like it.

3. **Single-source the one contract that is genuinely duplicated** — as a
   `module.exports`, not a new file format. One symbol, existing readers, no new
   vocabulary.

4. **Then, if a gate is still wanted, compute it rather than declare it.** The rule
   that would have caught all three instances: *every token read via `var()` in
   `lib/**` or through `mermaid-theme-map.js` with no fallback and no `:root` default in
   the base layer must be in `REQUIRED_TOKENS`.* It catches the next instance
   automatically, and it cannot rot, because there is nothing to maintain. This is what
   the manifest was reaching for, obtained without the artifact.

**Per-theme metadata (#1302)** is one comment line in `carbone.css` saying the absence
of a light face is deliberate. If a second such question arises, revisit then — one
question is not a schema.

## 6. Logged separately (HARD RULE #18 — found here, off this path)

- The `--c-*` / `--spectrum` no-default hole and its black sentinel — a live shipping
  defect for any off-repo theme, and the reason #1411 is a class.
- `serializeTheme`'s unescaped name/value interpolation into CSS reaching the Studio
  preview frame. Self-inflicted today (a user's own text in their own frame); it goes
  on-path the moment manifest-as-input is reconsidered.
- The declaration drift: `token-parity.test.js` 95 vs `theme-scorecard.js` 91, `carta`
  ungated by both, `Fabricate.tsx`'s divergent `CONTRACT`, `contrast.js`'s hardcoded 12.
- `tools/contrast-audit.js:53` carries the same `[a-z0-9-]` regex bug that cost me two
  findings — it cannot see `--hljs-built_in`.

## 7. What was verified, and what was not

**Verified on the real surface**: the containment black sentinel and the ink AA drop,
both through the render CLI to PNG in Chromium 131, with the palette census tied back
to declared CSS values. Artifacts under `.scratch/theme-probe/`; the probe themes were
removed and the tree left clean.

**Verified by reading source**: every count in §1, the three gate scopes in §3.1, the
`serializeTheme` injection in §3.3 (executed, not inferred), the drift in §3.4.

**NOT verified**: whether `separateArm` actually *throws* on a derived `brand-mono`
palette, as opposed to merely being reached — the guard fires; the push loop was not
simulated to exhaustion. And the `a11y-*` two-level import chain
(`a11y-base` → `onyx`, CVD → `a11y-base`) was sampled, not exhaustively modeled.
