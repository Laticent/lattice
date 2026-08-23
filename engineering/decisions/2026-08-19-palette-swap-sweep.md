---
status: shipped
summary: >
  The rendered-DOM contrast probe is the only tier that can see a cascade or composition
  defect, and it ran on ONE palette family — `indaco` — because a 32-palette matrix reads as
  unaffordable. The render is not the palette-dependent part: markdown, Mermaid, KaTeX and
  layout produce the same DOM whatever the colors are, so the deck is rendered ONCE and
  re-themed in place (~2 min for all 32, against ~7 to re-render them natively). Getting that
  right took three corrections, each of which produced confident numbers while being wrong.
  (1) Injecting `dist/themes/*.min.css` was fiction for 18 of 32 — they are override layers
  joined by `@import`, which does not load inside an injected `<style>`, so each landed on
  whichever palette went before it. (2) APPENDING the corrected stylesheet to `<head>`
  inverted the shipped cascade — the export puts the palette FIRST and `lattice.css` after —
  so 30 of 126 tokens resolved from the wrong side and the sweep both invented findings
  (`atelier` 19 vs 16) and MISSED real ones (`onyx` 3 vs 5). The palette region is now
  replaced IN PLACE. (3) Identifying Mermaid's baked paint by INVARIANCE ("a channel that
  never changes must be third-party") cannot distinguish it from a hardcoded hex in our own
  CSS — the exact regression class the gate exists to catch. Provenance replaces it: disable
  the stylesheets a renderer ships inside its own `<svg>`, re-probe, see which channels move.
  The durable guard for all three is `tools/palette-native.js`, a nightly that re-renders all
  32 for real and fails if the fast path disagrees; today they agree on 32 of 32. What the
  corrected sweep found: `mustard`'s `--accent` was ink on both plain canvases at 4.35:1 and
  3.89:1 (79 runs across fourteen component classes, and NO analytic gate scored `--accent`
  as ink — the row exists now), and the `journey` mood legend kept an `opacity: 0.85` wash
  the labels directly above it had removed for that same reason (35 runs, seven palettes).
---

# One render, thirty-two palettes

**Status:** shipped.
**Scope:** `tools/palette-sweep.js`, `tools/palette-native.js` (new),
`test/integration/invariants/palette-sweep.test.js`,
`test/integration/invariants/contrast-exemptions.js` (new, shared),
`tools/check-slide-contrast.js` (probe fix), `tools/contrast-audit.js` (two new pairs, two
exports), `themes/mustard.css`, `lib/components/chart/journey/journey.styles.css`,
`.github/workflows/integration-nightly.yml`.
**Related:** `2026-08-19-website-accessibility-gate.md` (the same "analytic gates cannot see a
cascade" lesson, on the website), `slide-contrast.test.js` (owns rendered-DOM policy on three
surfaces), `2026-08-18-contrast-floor-deck-scale.md` (why 4.5 and not 3.0), HARD RULE #15
(one flattener, one exemption ledger), HARD RULE #18 (why the status-trio residue is a
recorded ceiling and not a fix here).

---

## 1. The gap, and why it survived

Lattice's contrast gates stratify by layer, and only the rendered tier can catch a defect
where the tokens are right and the cascade is wrong. That tier ran on `gallery.md` at
`indaco`, the same gallery at `indaco-dark`, and prose at `indaco`. Thirty of the thirty-two
shipped palettes had never been measured on any deck, ever.

The reason was a cost assumption: a gallery render is 11–36 s, so the matrix is 6–19 minutes.

The assumption is wrong in a specific and useful way. **The palette is not the expensive part
of a render.** Parsing markdown, rendering Mermaid, running KaTeX and laying out 117 slides
produce the same DOM whatever the colors are; only paint changes. Render once, re-theme in
place, re-probe:

| | measured |
|---|---|
| Full gallery render | ~11–36 s (cache-dependent) |
| In-place swap + full re-probe + provenance probe | ~4 s / palette |
| **All 32 palettes** | **~2 min** |
| All 32 rendered NATIVELY (the nightly referee) | ~7 min |

## 2. Three ways to be confidently wrong

Every one of these produced a clean-looking run with per-palette numbers. None of them was
caught by a gate; two were caught by a reviewer and one by an oracle built after the fact.
That is the real lesson of this note.

### 2a. The palette files are override layers (`@import` does not load)

The obvious way to swap is to inject `dist/themes/<name>.min.css`:

```
cuoio-dark   1,948 bytes   @import "cuoio"    — declares no --bg at all
a11y-base    9,167 bytes   @import "onyx"     — declares no --bg, --text-body or --accent
```

An `@import` inside a `<style>` injected mid-document does not load, so each injection landed
its override layer on top of **whichever palette went before it** — a hybrid that exists in no
build, for 18 of the 32. The tell was that `mustard` and `a11y-base`, unrelated palettes,
reported byte-identical offender breakdowns.

**Fix:** inject the flattened chain `contrast-audit.js` already builds (`paletteChainCss`, via
`themeChain`, which returns `[base, …, self]` so the override lands last). Exported rather
than reimplemented — a second flattener that drifted would hand the sweep a different palette
than every analytic gate scores (HARD RULE #15).

**Guard:** an ORACLE CHECK, per palette, every run. The browser's resolved `--bg` and
`--text-body` must equal what the static resolver says that palette declares.

### 2b. Appending inverted the cascade

With the right CSS, the sweep still appended it to `<head>`. The export shell emits ONE
stylesheet in which the palette comes **first** and `dist/lattice.css` **after** — so
appending put the palette last, the reverse of what ships, and **30 of 126 tokens resolved
from the wrong side.**

It was wrong in both directions, which is what makes it worse than no gate:

| palette | native truth | the appending sweep said |
|---|---|---|
| `onyx` | 5 | **3** — missed two real `redline` runs at 4.29:1 |
| `atelier` | 16 | **19** — three `journey` runs that do not exist |

**Fix:** replace the palette region IN PLACE — overwrite the span between `/* @theme ` and
`/* dist/lattice.css` and leave everything around it. The swapped palette then occupies the
exact byte range, and therefore the exact cascade position, the shipped one did. This is a
textual assumption about the shell, so it fails LOUDLY: exactly one stylesheet must carry both
markers, in order, or the sweep stops.

### 2c. Invariance cannot identify third-party paint

Mermaid ships its own stylesheet INSIDE the `<svg>` it renders, resolved against whatever
palette was in force AT RENDER TIME. A swap cannot move it: natively, an `indaco-dark`
flowchart edge label paints white on `#001D33`; after an in-place swap from `indaco` the ink
follows (ours, `!important`) while the pill stays baked white — 1:1, a number describing no
rendered pixel. Those runs must not be scored.

The first rule identified them by INVARIANCE: "a channel that never changed across all 32
palettes must be third-party." **That cannot do the one job it exists for.** A hardcoded hex
in our own CSS also never changes, so a literal `#888` that fails contrast was classified as
third-party paint and silently dropped — precisely the regression class this gate is built to
catch.

**Fix:** ask provenance directly. A stylesheet whose `ownerNode` sits inside an `<svg>` came
from whatever renderer produced that SVG. Disable those, re-probe, and see which channels
move. A channel painted from our own stylesheets is KEPT and scored even when it never varies.

Two details cost a debugging round each, and both are in the tool's header:

- **It must run at EVERY palette.** Run once on the document as rendered (`indaco`), it misses
  the very run it was built for — Mermaid's baked pill is white, `indaco`'s canvas is white,
  and removing a white pill from in front of a white canvas changes nothing measurable.
- **Paints must be compared per key as an ordered LIST.** `runKey` is not unique, and
  last-write-wins hid a baked run that shares its key with one we paint.

The new rule drops **11** runs where invariance dropped 17 — six of those six were ours to
score.

## 3. The durable guard: a nightly that renders for real

Each correction above was found by a person reading a diff. That is not repeatable, so
`tools/palette-native.js` re-renders all 32 palettes natively on the nightly
(`integration-nightly.yml`) and reconciles against the fast sweep. It answers two questions
the fast path cannot answer about itself: whether the in-place swap still reproduces a real
render, and what the dropped runs actually score — the Mermaid paint is not unmeasurable, only
unmeasurable *by swapping*.

**Today they agree on 32 of 32 palettes.** That reconciliation is the evidence for every
number in this note.

## 4. What the corrected sweep found

Both were invisible to every existing gate, and both are the same shape: a role that is
obviously ink, asserted nowhere, on a palette nobody measured.

**`mustard`'s `--accent` was ink on both plain canvases** — 4.35:1 on `--bg`, 3.89:1 on
`--bg-alt`, against a 4.5 floor. That is 79 sub-threshold runs across fourteen component
classes: glossary terms, stats figures, every decimal-leading-zero list counter, `big-number`,
the `cards-grid` / `compare-table` stars, `cycle`'s chevrons, `timeline-list`,
`split-compare`. `tools/contrast-audit.js` scored `--accent` on `accent-soft`, and scored it
as a BACKDROP under `--on-accent`, but never as the foreground it most often is. The theme
file asserted "L:5.36:1 on bg" in a comment no gate read, and that number was wrong by a full
point. Two rows now exist; deepening `#8C6A18` → `#7B5D15` gives 5.31:1 / 4.75:1 and clears
all 79. It also cleared two frozen pairs in `composed-contrast.js`, taking that baseline from
110 to 108.

**The `journey` mood legend's numeric keys carried `opacity: 0.85`** over an inherited
`--text-secondary` — 35 runs on seven palettes, worst 3.72:1. The `PAIN` / `DELIGHT` labels
DIRECTLY ABOVE them in the same file had that exact wash removed for that exact reason, with a
long docblock explaining why. This rule kept it and stayed green, because `indaco` lands at
4.72:1 and passes. Removing the wash — rather than re-tuning anything — clears it everywhere,
because `--text-secondary` on both canvases is already held to 4.5 for all 32 palettes.

## 5. A pre-existing probe bug this surfaced

`SVG_NON_RENDERING` in `check-slide-contrast.js` listed `desc`, `title`, `metadata` — and not
`style`. Chrome does not report `display:none` for an SVG-scoped `<style>`, so its CSS source
text was walked as a visible run and scored: a Mermaid diagram's own stylesheet appeared as a
1.17:1 offender reading `#lattice-mmd-1{font-family:'Outfit'…`. It never fired on `indaco`,
which is the only palette the sibling gate measures. Fixed in place, on-path.

## 6. What is left, and why it is a ceiling rather than a fix

After the shared decorative exemptions and the two fixes above, **113 sub-threshold runs
remain, and they are ONE population**: status or accent ink sitting on a tint OF ITSELF.

| | runs | palettes |
|---|---|---|
| `redline` `<ins>` / `<del>` on `--pass-bg` / `--fail-bg` | 82 | 19 |
| the inline-code chip inside a `kanban` card (dark only) | 28 | 5 |
| `policy-recommendation` adopt badge, one `kpi target` row | 3 | 2 |

The background MOVES WITH THE INK, so re-tuning a hue gains nothing on its own — and lowering
the tint alone plateaus. Measured across all 32 palettes against `composed-contrast.js`:

| status tint | composed pairs below bar |
|---|---|
| 18% (`carbone` only) | 190 |
| 12% (most palettes) | 110 |
| 8% | 86 |
| 6% | 78 |
| 3% | 64 |

Clearing the rest means re-curating the status trios across the **fifteen palettes that
self-curate them**, which is a palette change with its own blast radius and its own visual
sign-off, and is already tracked as its own slice (#1698). It does not belong in the change
that first measured it — HARD RULE #18's pre-existing / off-path arm. `composed-contrast.js`
holds the same population analytically at 108 frozen pairs, so the two gates agree about the
size of the debt.

`indaco` is at zero. It is the only palette that is, and that is the whole argument for this
file.

## 7. What this does not cover

- **One deck, one viewport.** The palette axis is what this buys; the surface axis is still
  the sibling gate's three.
- **A ceiling, not a bar.** Exceed-only, seeded at measured truth. It proves no palette gets
  worse; it claims only `indaco` is clean.
- **The decorative exemptions are not re-litigated.** They are the same adjudications
  `slide-contrast.test.js` made, now imported from `contrast-exemptions.js` so one matcher
  serves both gates. The per-surface `counts` pin stays with each gate, in its own terms —
  one adjudication, two independently falsifiable ledgers.
- **Both failure arms are proven, not assumed.** The ratchet was verified by lowering a
  ceiling; the oracle by re-introducing the `@import` bug; the cascade fix by reconciling
  against a native render of all 32. A gate that has only ever been green is a green light,
  not a gate.
