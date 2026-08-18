---
status: shipped
summary: >
  The export rendered Mermaid by shelling out to the `mmdc` binary, whose page
  carries no Lattice `@font-face` — so every diagram label was MEASURED in a
  fallback face and PAINTED in the real one. Mono hid it; no hand face can, which
  is why `mode: sketch` never reached diagram type. `--cssFile` cannot fix it by
  construction. The engine now owns the render page, which also removes the
  constraint that forced the last divergence between the two render paths:
  `DIVERGENT_KEYS` is retired, `DIVERGENT_CONFIG` drops from four entries to one,
  and the hand-written `%%{init}%%` merge kernel is deleted.
---

# The export renders Mermaid in a page the engine owns (#1674)

## The symptom, and why it was only ever visible under `sketch`

`mode: sketch` gives a deck a hand-drawn hand — hand type, wobbled boxes, drawn
rules. Node shapes went hand-drawn in #1647 and the last native-chart labels closed
in #1664, leaving one surface: text inside a rendered Mermaid diagram stayed in
JetBrains Mono, so a hand-drawn deck wrapped hand-drawn diagram shapes around
machine-faced labels.

The obvious fix — hand Mermaid the hand font — had already been tried in a throwaway
probe and produced something worse: every node label clipped mid-word, "Raw Signals"
rendering as "Raw Signa". That is the failure `DIAGRAM_FONT_STACK`'s comment
predicted, and it is why `fontFamily` sat in `DIVERGENT_KEYS` as sanctioned drift.

## The mechanism, stated precisely

Mermaid MEASURES a label in the browser that renders it, and bakes the measured box
into the SVG geometry. `mmdc` renders in mermaid-cli's own page
(`@mermaid-js/mermaid-cli/dist/index.html`), which carries no Lattice `@font-face`.
So the box was always sized in a fallback face; the SVG was then embedded in the host
deck, where `lattice.css` loads the real face, and the text painted wider than the box
it was measured for.

**Mono survived that by coincidence, not by design.** `"JetBrains Mono", monospace`
ends in the `monospace` generic, whose fallback metrics nearly match the intended
face — measured at 0.2–0.4% on real diagrams. No hand face has that property.

### `--cssFile` is not the lever, and this is worth stating once so nobody retries it

The follow-up section of `2026-08-12-sketch-label-voice.md` proposed `mmdc -C,
--cssFile` as the fix: feed it the `@font-face` block and the measure pass and render
pass agree. **That was wrong, by construction rather than by timing.**
`node_modules/@mermaid-js/mermaid-cli/src/index.js` appends `myCSS` as a `<style>`
element INSIDE the SVG, *after* `mermaid.render()` has already returned. Measured on
real `mmdc` runs, hand face, with and without a data-URI `@font-face` via `-C`:

| | node widths | foreignObject widths |
|---|---|---|
| no `cssFile` | 216.02 / 186.20 | 156.02 / 126.20 |
| with `cssFile` | 216.02 / 186.20 | 156.02 / 126.20 |
| mono (shipped, for scale) | 260.00 / 232.83 | 200.00 / 172.83 |

Byte-identical geometry. Adopting it would move the PAINT to the hand face while the
MEASUREMENT stayed in the fallback — reintroducing exactly the divergence
`DIVERGENT_KEYS` existed to prevent. There is a second, independent reason: the CLI
preloads faces (`await Promise.all(Array.from(document.fonts, f => f.load()))`,
`src/index.js:267`) BEFORE `myCSS` is injected, so a `--cssFile` face is never in
`document.fonts` at preload time either.

Delivering the family before render is likewise **necessary but not sufficient**. With
`"Shantell Sans"` correctly reaching `themeVariables` pre-render, the box still
measured 216.02: `mmdc` accepts the name, finds no such font in its own page, and
silently measures a substitute. The face has to be loadable in the window doing the
rendering, and `mmdc` exposes no option to put one there.

## What shipped

`lib/integrations/mermaid/render-worker.js` — a render page the engine owns. It loads
**the same page and the same bundles the CLI does** and adds exactly two things before
rendering: Lattice's `@font-face` rules, and an `await` on the faces actually loading.
Everything else is the CLI's own sequence, kept deliberately identical, so this is a
change of FONTS and CONFIG DELIVERY rather than a change of renderer.

**Getting "identical" right took a correction, and it is the most useful thing in this
note.** An earlier draft claimed the CLI's `dist/index.html` "registers zenuml and the
elk layout loaders". It does not. The page's vite bundle carries the *code* — and the
KaTeX and FontAwesome faces, which is a real reason to reuse it — but the two
REGISTRATIONS live in the CLI's own JavaScript, in the `$eval` in `src/index.js`:

```js
await mermaid.registerExternalDiagrams([zenuml])
mermaid.registerLayoutLoaders(elkLayouts)
```

The worker reimplemented that prologue and dropped both. Measured against `mmdc` on the
same input: a `zenuml` diagram failed outright ("No diagram type detected matching given
configuration") where mmdc rendered it, and `%%{init: {"layout":"elk"}}%%` came back
`viewBox="0 0 320.69 67"` — plain dagre — where mmdc gives elk's `viewBox="4 4 324.92 70"`.
Two diagram capabilities, silently lost, in a change whose own justification was that
nothing about the renderer changed.

Neither failure is loud. A failed diagram degrades to a `<pre>`, and a diagram laid out
by the wrong engine just looks like a diagram. The verification harness could not see
either: `tools/check-diagram-labels.js` walks `.mermaid-svg` wrappers, and a diagram that
never rendered has none — it is a missing row, not a red one.

So the lesson is not "we forgot two lines", it is that **owning the page means owning an
undocumented compatibility contract with the CLI's prologue**, and a contract with no
test is a comment. `test/unit/mermaid/render-worker.test.js` now reads the CLI's real
`src/index.js`, extracts every `mermaid.register*` call it makes, and fails when the
worker does not make it — with `registerIconPacks` on a named exception list, because its
loader fetches from unpkg at render time and the engine renders offline. A mermaid-cli
upgrade that adds a prologue step is now a red build rather than a feature that quietly
stops existing.

Measured on the same flowchart, label-box widths:

| | node 1 | node 2 | node 3 |
|---|---|---|---|
| mono, no fonts injected (the old export) | 219.16 | 101.16 | 185.44 |
| hand face, no fonts injected (the naive fix) | 150.88 | 75.83 | 137.63 |
| hand face, fonts injected + awaited | 180.86 | 83.73 | 161.94 |

The middle row is the clipping bug — a box measured ~20% narrow. The third row is
measure and paint in the same face.

### Two costs, taken deliberately

**A child process, not an async refactor.** `preprocessMermaid` runs at
module-evaluation time in `lattice-emulator.js` and cannot `await`; Puppeteer is async
throughout. Running the page in a child process keeps the caller's `execFileSync`
shape exactly as the `mmdc` shell-out had it, so nothing upstream became async. The
alternative — threading `await` up through a 4400-line CJS entry point — would have
been a far larger diff for no user-visible gain.

**Off-sketch diagrams RESIZE, and the first version of this paragraph understated it by
roughly 40x.** Two different effects were conflated, and the smaller one got written down:

1. *Loading the real JetBrains Mono* instead of measuring in the `monospace` generic —
   0.45–1.13 user units on 150–373-unit diagrams, 0.2–0.4%. That is what the original
   figure measured, holding the face constant.
2. *Changing the face* from mono to the deck's body sans, which is what the change
   actually does off sketch. A proportional face sets narrower labels than mono, and a
   Mermaid node is sized from its label. Measured origin/main against HEAD on three
   committed decks: **node widths 3–16% narrower**, the widest labels moving most
   (`mermaid-diagram-surface` −3.9% / −12.0% / −15.9%; `containment-tier` −3.1% to
   −11.2%; `per-slide-diagram-band` −3.8% / −8.0%).

Effect 2 dominates and is a visible typography change to every existing deck's diagrams,
not a rounding shift. Caught by the adversarial trio's checker, which noticed the note
contradicted its own changelog bullet. Recorded plainly because a reviewer sizing the
blast radius from the wrong number would sign off on the wrong thing.

The alternative was to inject faces only under `sketch`, which would have kept every
existing deck byte-identical. **We chose the single code path**: a conditional "load fonts
only sometimes" leaves the mono path measuring against a coincidence, and the whole point
of this change is that measure and paint agree. Every committed diagram PDF in the repo
was re-rendered in the same change, and the resize was put in front of the human at
export sign-off with these numbers rather than the earlier ones.

## What the change let us DELETE

#1332 set the test for a correct fix explicitly: it should let us delete the
reconciliation devices, not accumulate more. Owning the page removed the constraint
that every one of these existed to work around.

- **The `%%{init}%%` merge kernel** — `withEngineInit`, `engineInitDirective`,
  `directiveSafe`, `prune`, `FRONT_MATTER_RE`. They serialized the engine config into
  a directive, filtered the values Mermaid's directive sanitizer would blank, dropped
  empty ones, stripped apostrophes, and spliced the result in ahead of any author
  directive. All of it served ONE constraint: the export ran in a process it did not
  control, so its config had to ride inside the diagram source. Both paths call
  `mermaid.initialize` now, and the "merge, don't replace" guarantee (#1311) is
  Mermaid's own directive-over-siteConfig behavior rather than ours.
- **`DIVERGENT_KEYS`** — retired, not emptied. `fontFamily` was its sole entry, and
  only because `sanitizeDirective`'s allow-list bars the hyphen, so a real font stack
  could not survive a directive and the export bought a monospace one. Both paths read
  `--font-body` through one map entry now, and
  `test/unit/core/diagram-theme-parity.test.js` asserts equality with **no exception
  set at all** — an empty allow-list is a standing invitation to add to it.
- **`DIVERGENT_CONFIG`: four entries → one.** `securityLevel`, `startOnLoad` and
  `suppressErrorRendering` are Mermaid SECURE KEYS, which `sanitize` strips from
  anything that is not `initialize`; the export could not state them even where it
  agreed. All three moved into `engineInitConfig`. Only `flowchart.useMaxWidth`
  remains, and it is a genuine behavior choice.
- **The kernel's `finishTheme` port** — the single place a path was licensed to alter
  the palette the map built. Its only sanctioned use was `DIVERGENT_KEYS`.

## How `sketch` actually reaches the labels

Not by a sketch branch in the diagram code. `base.sketch.css` re-points `--font-body`
to `--sketch-font-body`, and `MERMAID_VAR_MAP.fontFamily` reads `--font-body`. The
preview gets that free — its reader is `getComputedStyle(section)`, so the cascade has
already applied the re-point.

The export cannot: it resolves tokens **offline** against palette text, where there is
no element and no class, so a class-scoped rule is invisible to it. The re-point is
therefore applied in the reader (`readScopeToken`), which is where a path difference
belongs, and the diagram **scope** grew from a bare band string to `{ band, hand }`.

`hand` is `resolveDiagramHandType` — rules 2 and 3 of `resolveDiagramLook` **without**
rule 1. That is the whole distinction, and it is deliberate: rule 1 takes the hand
SHAPE away from any palette carrying categories by pattern (`a11y-*`, `onyx`,
`concrete`) and from the print band, because a pattern cannot survive being painted
through a hachure stroke. That reasoning is about the redundant-encoding channel and
says nothing about TYPE. So a texture deck in `mode: sketch` gets hand LABELS inside
machine-drawn nodes — which is what `engineering/mermaid.md` §5.3e already described
as the intent. `resolveDiagramLook` now calls `resolveDiagramHandType` rather than
repeating it, so the shape answer and the type answer cannot drift.

Because `fontFamily` is a GLOBAL Mermaid theme variable, hand type also reaches the
remaining families (sequence, gantt, pie, journey, timeline, quadrant, sankey, xychart,
C4, block, packet, architecture, gitGraph),
which honor no `look` and keep machine-drawn shapes. **Chosen, not tolerated**: a
sketch deck should speak in one voice, type is a separate question from shape, and
holding those families back would need per-family overrides Mermaid does not cleanly
offer.

## One correction to the record

`2026-08-12-sketch-label-voice.md` recorded that a deck-authored `%%{init}%%` carrying
`themeVariables` "replaces the engine's palette wholesale rather than deep-merging it",
and flagged `engineering/mermaid.md` §5.3 as needing a correction for saying an
author's own init "is fine and costs nothing".

**Measured on Mermaid 11.14, that is not what happens, and §5.3 was right.** A second
directive carrying `themeVariables` DOES deep-merge: with the engine's
`primaryColor: #123456` and an author's `lineColor: #ff0000`, the render comes back
with both. What the probe actually hit was the apostrophe: `detectDirective` runs a
blanket `'` → `"` swap over the payload before `JSON.parse`, so ONE apostrophe in any
value makes the payload invalid JSON and Mermaid's catch drops **every** directive in
the diagram, palette included. Measured — an apostrophe in `primaryColor` alone is
enough to take the whole palette to stock `#ECECFF`/`#333333`, whereas a hyphen only
blanks the one value it appears in.

That hazard never reached the engine: `prune()` stripped apostrophes from every
emitted string, and `engineInitDirective`'s docstring named the trap. It is recorded
here because it is the real explanation for a measurement the earlier note attributed
to the wrong cause — and because the defense and the trap were both deleted in this
change, so the next person to consider a directive transport needs to find them.

## Verification

Driven on the real export, not a fixture (HARD RULE #23). `tools/check-diagram-labels.js`
loads an exported deck's HTML sidecar in headless Chromium and, for every label inside
every `.mermaid-svg`, reports the COMPUTED `font-family` and compares content width to
box width.

| deck | labels | in the hand face | clipped | rough nodes |
|---|---|---|---|---|
| `mode: sketch`, indaco | 26 | 26 | 0 | 12 |
| `mode: boardroom`, indaco | 23 | 0 (body face) | 0 | 0 |
| `mode: sketch`, a11y-deuteranopia | 23 | 23 | 0 | **0** |

The third row is the texture contract holding: hand type, machine-drawn shapes.

## What this does NOT do

- **It does not make the remaining renderers hand-DRAWN.** Mermaid honors `look` in six
  families, not the four this note first claimed: flowchart, state, class, ER, **mindmap**
  and **requirementDiagram**. The rest — sequence, gantt, pie, journey, timeline,
  quadrant, sankey, xychart, C4, block, packet, architecture, gitGraph — get hand type and
  keep crisp shapes until Mermaid migrates them; that is upstream. Measured across all 19
  families and pinned by `test/integration/mermaid/diagram-look-support.test.js`, because
  the four-family claim had been repeated through three documents without anyone checking
  it.
- **It does not CHANGE elk's status, but it very nearly removed it.** `layout: 'elk'`
  works on the export — the CLI's bundle carries the elk loaders and the worker now
  registers them, as the CLI does. The worker did not, for the first two commits of this
  branch, and elk silently degraded to dagre; see the correction above. The engine still
  does not *ship* elk as its own dependency, and the runtime still does not register it,
  so `layout: 'elk'` remains export-only.
- **It does not touch `flowchart.useMaxWidth`.** The surviving sanctioned divergence,
  left alone deliberately: sharing it would change exported SVG attributes with no
  measured visual effect, which is churn taken on faith.

## The one contract that had to be carried across by hand

An author who pins a Mermaid `theme:` is opting out of the deck palette, and the export
honored that by emitting **no directive at all** — the stand-down was a side effect of
the transport rather than a stated rule. Moving the config beside the source instead of
into it silently dropped it: the engine's `themeVariables` went out regardless, and
since the engine sets essentially every one of them, a pinned diagram came back wearing
the deck palette. `test/integration/mermaid/mermaid-init-merge.test.js` caught it —
`fill:#E8F0F7` where the test expected forest's `#cdffb2`.

Fixed by stating the rule: `engineInitConfig(vars, { omitPalette })` drops `theme` and
`themeVariables` when `authorPinsTheme` says so. Re-measured on the real export, indaco
deck, `theme: forest`:

| | cluster | node | font |
|---|---|---|---|
| directive pin | `#cdffb2` | `#cde498` | trebuchet (forest's own) |
| front-matter `config.theme` | `#E8F0F7` | `#BCD5EC` | Outfit (deck palette) |
| no pin | `#E8F0F7` | `#BCD5EC` | Outfit |

Identical to the pre-change behavior on all three rows, including the documented
asymmetry that front matter is not a stand-down. It is also slightly better than the
directive era: emitting nothing used to cost a pinned diagram `wrappingWidth`,
`padding` and the quadrant/c4 sizes as well, which the old docstring called out as a
hole. Opting out of the palette is not opting out of the layout.

**The stand-down remains export-only, and this change did not close that.** The preview
configures Mermaid once per RUN of diagrams sharing a palette and renders that run's
fences concurrently against the one global config, so standing down for a single pinned
fence means re-initializing mid-run and restoring afterwards. That is a change to the
runtime's diagram queue, not to the config plumbing — a different subsystem from the one
this change touches, and pulling it in would blur what the diff is for (HARD RULE #18,
pre-existing and off-path). Recorded here and in `engineering/mermaid.md` §5.3 rather
than left implicit.

## What the adversarial trio caught (HARD RULE #25 tier 3)

This replaced both export render paths in a shared kernel and is architecturally novel,
so it escalated past maker-checker to the full trio. The **Munger inversion** produced
the finding of the branch, and it is worth recording how, because the shape generalizes.

It did not look for a bug. It asked what would make shipping this the wrong call, took
the change's own load-bearing premise — *"this is a change of FONTS and CONFIG DELIVERY
rather than a change of renderer"* — and tested it in the one dimension nobody had:
renderer **capability**. Every deletion here (`DIVERGENT_KEYS`, `finishTheme`, the
directive kernel) was justified by "the two paths are the same thing now", and that
premise was false on day one — the worker had dropped two of the CLI's four prologue
steps. The change deleted the repo's entire vocabulary for "the paths differ" at the
precise moment the paths acquired a new, ungated difference.

Both regressions are fixed above. Three of its other findings were adopted:

- **`mermaid` and `@mermaid-js/mermaid-zenuml` are now declared dependencies.** The
  worker `require.resolve`s both from Lattice's own module location; the CLI resolves its
  copies from its own (`import-meta-resolve`), so it never needed them declared here. Left
  undeclared they resolved only because npm hoists — under pnpm's isolated layout or Yarn
  PnP, `resolveBundles` throws and EVERY diagram in every deck degrades to a `<pre>`.
  `mmdc` had no such exposure, because a bin-link works under any layout. That is a
  portability regression the change would have shipped invisibly on this machine.
- **The prologue-drift gate**, described above.
- **Characterization tests for the two directive hazards**
  (`test/unit/mermaid/directive-hazards.test.js`). The inversion's argument: prose cannot
  hold a claim about a dependency's behavior, because prose does not re-evaluate. The
  allow-list and the apostrophe trap still govern every directive an AUTHOR writes, on
  both paths, and deleting their defense left those claims with nothing re-checking them.
  Writing that test also caught a mistake in the first draft of the test itself — it
  grepped the allow-list source for `-`, which is always present as a range separator in
  `A-Za-z`. It now builds the expression and asks whether a hyphenated value passes.

One finding was **rejected on measurement**: the inversion reported 24 stale committed
example PDFs. They were stale when it looked; they were regenerated in the same session,
and the claim is left here rather than quietly dropped because the underlying point —
that a typeface flip makes every committed diagram artifact stale — is the real cost of
the "always inject" decision and was correctly identified as such.

One recommendation was **declined, deliberately**: splitting the mono → body-face flip
into its own PR. The inversion is right that it is a house typographic decision arriving
inside a font-loading repair, and right that it was bundled with the single-code-path
argument when the two are separable. It stays because `DIVERGENT_KEYS` cannot retire
without it — the export reading `--font-body` IS the convergence — and splitting would
mean shipping a change whose stated purpose is unification while leaving the one key that
diverges in place. The typographic case, stated plainly since the record did not make it:
a diagram label is prose about the system, not notation *of* it, and it should read in
the same voice as the slide around it. Mono was a workaround for a measurement
constraint, and the constraint is gone.

## What the red team caught — and why the verification harness was the worst of it

The red team attacked the shipped worker rather than reading it. Six findings landed; two
were HIGH and both are regressions this change would otherwise have introduced.

**S1 — a dead render page reported as a successful batch.** `renderAll` returned
`ok: true` unconditionally, because `renderOne` catches everything. So a browser that died
mid-batch produced N per-diagram failures inside a *successful* payload: the caller's
`if (!out.ok …) return null` never fired, the retrying one-at-a-time path was skipped, and
every failed index became a `<pre>`. Measured — a renderer killed 4 s into an 80-diagram
batch lost **70 of 80 diagrams and exited 0**. Not one of those errors was a diagram
error; they were `detached Frame`, `Target closed`, `Execution context was destroyed`,
i.e. exactly the class the retry exists for.

Fixed by classifying: `isFatalPageError` separates transport failures from mermaid parse
errors, and a fatal one ends the batch with `ok: false` so the caller retries. Re-run
against the same attack: `payload ok = False`, aborts at diagram 27 of 60 instead of
grinding through all of them.

**S2 — no timeout at any layer, and the blast radius had grown.** Puppeteer's default
`protocolTimeout` is 180 s *per call*, `page.$eval` had no budget, and the caller's
`execFileSync` had none either. Observed: three diagrams burning 540 s of dead wall clock
in one batch, and a re-run still hung at **11 minutes**. `mmdc` had the same gap, but it
booted a browser per diagram — one wedge cost one diagram. Sharing one page across the
deck converted that into the whole deck, which is a blast-radius regression this change
created. Now bounded at both layers (60 s per CDP call; a batch-size-scaled budget on the
child), so the attack finishes in 66 s and degrades instead of hanging.

**S4 — the harness that verified this whole change could not detect the bug it verified.**
The one worth dwelling on. `tools/check-diagram-labels.js` compared `scrollWidth` to
`clientWidth` on the label — but mermaid's `.nodeLabel` is a `display: inline` span, where
both are **always 0**. The `clipped` counter was structurally 0 on every deck ever run
through it, including a deliberately broken one. Every "0 clipped" in this record's
earlier drafts was vacuous.

The replacement compares the painted label's `getBoundingClientRect()` against its
`<foreignObject>`, which is the actual invariant: mermaid sizes the box from what it
measures, so when measure and paint share a face the two are **0.00 apart**, exactly.
Measured on the same flowchart — injected 180.84 / 180.84 → 0.00; suppressed
180.84 / 183.30 → 2.45.

Two things fell out of fixing it, and neither would have been found otherwise:

- **The fix's real effect is now measurable.** Same deck, same harness: `origin/main`
  renders **13 of 24 labels mismeasured**; this branch renders **0 of 24**. Ten of those
  thirteen were the sub-pixel mono/`monospace`-generic drift, which is the 0.2–0.4% effect
  — visible at last, and gone.
- **A real clipping bug, pre-existing, in the demo deck.** The other three were gross
  (163.89 units off) and produced visibly truncated labels — "Raw Signals from the field"
  painted as "Raw Signals from". Cause: a diagram on a slide whose layout is `content`
  rather than `diagram`; the demo deck's opt-out slide said `_class: boardroom` where
  every other diagram slide says `_class: diagram …`. Present identically on
  `origin/main` (worse, at 163.89 vs 141.92), so pre-existing — but it was about to ship
  inside this PR's own committed demo PDF, which is a window this change would have
  created. The deck now uses the documented `_class: diagram boardroom` pairing and the
  slide measures clean.

  **The underlying defect is logged, not fixed** (HARD RULE #18, pre-existing and
  off-path): *a Mermaid diagram on a non-`diagram` slide layout has its labels painted
  ~1.5× the size its box was measured for.* That is slide-layout sizing, a different
  subsystem from the font plumbing, and pulling it in would blur what this diff is for.

Three smaller ones, all fixed: **S3** — `resolveBundles` derived one directory from where
`mermaid` happened to land, so under a nested layout (a consumer app pinning its own
mermaid) both candidates collapsed to the same wrong path and *every* diagram degraded; it
now probes `require.resolve.paths`. **S5** — the new `fontsLoaded` guard deduped by
family, so a missing *weight* was invisible, which is the likely failure since mermaid sets
cluster titles and bold runs at 700; it reports `family|weight|style` now. **S6** — the
restored registrations were guarded `if (zenuml)`, which re-armed the exact silent skip
they were added to fix; they throw instead.

One **pre-existing** defect was fixed rather than logged, against the usual rule: the
`<pre class="mermaid-fallback">` degradation interpolated the diagram source unescaped, so
a fence body of `</pre><img src=x onerror=…>` landed live in the exported HTML sidecar
(verified). Identical on `origin/main` and off-path — but it is one call to a helper that
already existed, and this change makes the path materially easier to reach. Fixing beat
logging at that size.

**Logged, not fixed** (off-path, both verified identical on `origin/main`): the `my-svg`
id-isolation substitution rewrites author-visible label text (a node labeled
`the my-svg identifier` exports as `the lattice-mmd-1 identifier`); and mermaid's
module-level id counters (`actorCnt`, class ids, sankey node ids) leak across renders in
the shared page, so sequence and sankey ids depend on batch position. The latter is worth
a closer look than it got here — within a batch the drift accidentally *prevents* a
duplicate-id collision that the one-at-a-time path still has.
