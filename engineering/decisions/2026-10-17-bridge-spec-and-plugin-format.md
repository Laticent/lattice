---
status: proposed
summary: A bridge is a public contract with two entry points (from source, from a rendered slide), a required declaration that generalizes the Marp fidelity ledger, and a four-tier conformance harness over the example decks that the host, not the bridge, sets the exams for. Calco is the second bridge, from the rendered slide. The plugin manifest shrinks to claims, drawing and facts; the host owns what a bridge or an export decides. Four open decisions for the owner at the end.
---

# The bridge spec, its harness, and the simpler plugin format (2026-10-17)

Follows `2026-10-15-bridges-and-two-hosts.md` (the "bridges note"). Its §9 records the owner's answers
that make this note the next step: **D6** (only we write bridges now, but build as if contributors
will: transpilation becomes a spec with a conformance harness) and **D4** (simplify the plugin format
before phase E's zip format ships). Nothing in this note is built. What ships with it is a measured
sketch of the harness (§6), so the numbers are real.

## 1. The answer

**A bridge is a function with a public contract, in three parts.**

1. **Two entry points.** A bridge starts from the deck's *source* (the Marp bridge: Lattice Markdown in,
   Marp Markdown, CSS and a runtime out) or from a *rendered slide* (Calco: a laid-out page read in a
   browser, a picture of it, and a `.pptx` or `.odp` out). §3.
2. **A declaration.** Every bridge ships a data file saying, for each Lattice feature, what the
   recipient gets. It is today's `lib/core/marp-fidelity.js` ledger, generalized so Calco can write
   one. §4.
3. **A conformance harness.** One harness reads the declaration and checks it against the example
   decks: static, then probes, then text and pixel checks on whole decks, then safety. The host fixes
   the exams. A bridge cannot lower its own bar. §5.

**The plugin format shrinks to what only a plugin knows** (§9). A plugin stops naming bridges: today
`render.surfaces.marp` forces every plugin to change when a bridge appears. The declaration moves that
choice to the bridge that owns it, with a default row so a new plugin never needs a hand edit. The host
also gets a named **export mode** (§10), the precondition the bridges note left open.

**The sketch shows the checks have signal, and where they do not.** On six decks both bridges ran in
104 seconds. A text check found nothing wrong with a Marp slide whose layout was lost (`panes`), and a
pixel check found it, weakly. A pixel check found nothing wrong with Calco's motion loss, because a still
reference cannot show motion. So the harness needs per-row probes and a declared *observable* for every
loss, not just whole-deck scores (§5.1, §6). Today's checks attest 13 of the 32 Marp ledger rows by
rendering and the other 19 by spelling, prose or nothing (§2).

## 2. What exists today

**The Marp ledger.** `lib/core/marp-fidelity.js` holds 32 rows (`main` at `1828726`, counted by
`allEntries()`): 13 `mirrored`, 6 `baked`, 11 `unmirrored`, 2 `moot`. Two test files read it. How each
row is checked:

| Coverage | Rows | What checks the claim |
|---|---|---|
| `mirrored` | 13 | `marp-fidelity-render.test.js` renders the engine and the runtime bundle and compares a projection of each. Every row has a probe, and two probes may cover one row from different angles |
| `baked` | 6 | `marp-fidelity.test.js` checks the *spelling*: the `via` symbol appears in code the exporter calls. The file says so ("KNOWN GAP: the `baked` rows have no equivalent", line 145) |
| `unmirrored` | 11 | nothing checks the note. Someone observed it on a real render, and the README prints it |
| `moot` | 2 | a test pins that Mermaid never prints as a gap; nothing else |

The ledger is honest about its method, and it attests with output for the largest group only. The
34 tests across both files take 18 seconds.

**Calco.** `lib/export/office-export.js` is the Lattice host for `@laticent/calco`
(`docs/src/lib/calco/`). Three steps run per slide in a browser page: `readSlide` measures every visible
word with the style the browser drew it in and hides that text; the **host photographs** the slide;
`restoreSlide` puts the text back. Then `writePptx` or `writeOdp` put the picture and the text frames in
one file. Boxes and rules also become native shapes. SVG, MathML, charts and diagrams stay in the
picture (`2026-10-06-calco-office-export-library.md` §2, `2026-10-07-calco-native-shapes.md` §7).
Calco never reads Markdown or Lattice's CSS. **Two hosts call it with two different cameras:** the CLI
photographs with Chromium (`office-export.js:59-75`), and the Studio uses html-to-image
(`docs/src/components/studio/export/deck-export.js`), which copies computed styles onto a clone and has
its own list of fixes. Calco's checks today are unit tests of the writers and one reader fixture.
Nothing compares a whole Lattice deck with the file Calco wrote.

**The plugin manifest.** Nine in-tree plugins. `measure-manifests.mjs` applies the bridges note's §5.3
changes and gets **908 → 424 lines (−53%)** (`main` at `1828726`; the bridges note quoted 797 → 370 on
eight plugins).

## 3. The two entry points

| | From source | From a rendered slide |
|---|---|---|
| **Example** | Export to Marp (`tools/export-marp.js`, `lib/core/marp-bundle.js`) | Calco (`lib/export/office-export.js`) |
| **Input** | the deck's Markdown, the palette, the plugin set | a laid-out page, one `section` per slide |
| **Output** | *source* in another engine, which a person edits and that engine renders again | a *file* (pptx, odp) whose text frames an office suite edits |
| **What it can see** | what the author wrote: directives, fences, comments | what the browser drew: positions, fonts, colors, wrapped lines |
| **What it loses** | what only Lattice's engine does (panes, focus steps) | what is not text or a plain box (charts, equations, motion) |
| **Runs where** | Node | a read step inside the page, a picture the host takes, and a Node writer |

Both routes stay, because a deck owner picks by what they need to edit afterward: the source route
keeps the deck *authorable* and loses the layout engine; the rendered route keeps the *layout* exactly
and loses authoring.

**The contract.** Each entry point is a protocol with steps the host runs, and the bridge owns only the
steps that touch its target:

```
source:    transpile(deck: Deck, options)                         → bundle: { path → bytes }
rendered:  read(page code, run in the page by the host)           → readout (plain data)
           [the host captures the picture and restores the page]
           write(readout, pictures, meta, options)                → file bytes

Deck     = { markdown, frontMatter, palette, plugins }   // as authored, after plugin admission
readout  = { slides: [{ frames, shapes, notes, description }] }   // JSON, no handles
```

Three rules follow from the review of this note:

- **A bridge never holds a live page or a capture device.** The host injects the `read` code, takes the
  picture with whichever camera it has, and hands the bridge only data. The Studio and the CLI therefore
  run the same `write`, and a bridge cannot reach the network or the filesystem through a page handle.
  The host writes the output.
- **The host owns the camera, so a declaration is keyed to a bridge *and* a host.** `calco@cli` and
  `calco@studio` are different things to the harness: the `pictured` rows are claims about a rasterizer,
  and the two hosts use different ones. Today only the CLI host is measured (§6). Until the Studio
  host runs T3, the census marks it **UNVERIFIED** (HARD RULE #23).
- **A source bridge's output is checked, not trusted.** It returns JavaScript and Marp Markdown, which
  `sanitizeStyleText` does not cover. T4 (§5) pins the bundled runtime by hash and scans the rest.

## 4. What a bridge declares

A bridge ships `<id>.bridge.json`, readable without running anything (the property the 2026-09-27
plugin note asks of manifests).

```jsonc
{
  "spec": 1,                                  // the bridge spec's own version
  "id": "marp",
  "title": "Export to Marp",
  "entry": "source",                          // "source" | "rendered"
  "environments": [                           // where the output is opened (bridges note §4.2)
    { "id": "marp-cli",       "version": "4.5.1", "rawHtml": "allowlist", "ourScripts": true },
    { "id": "vscode-trusted", "rawHtml": "all",   "ourScripts": "needs-disable" }
  ],
  "rows": [
    { "id": "headingSplit", "covers": { "plugin": "headingSplit" }, "coverage": "baked", "via": "bakeSplits",
      "probe": "heading-split" },
    { "id": "anima", "covers": { "package": "anima" }, "coverage": "unmirrored",
      "observable": "pixel", "probe": "anima-scene",
      "note": "renders as a code block showing its JSON scene" },
    { "id": "shell-grammar", "covers": { "topic": "code plugin shell grammar" }, "coverage": "baked",
      "via": "htmlConfigSource", "environments": { "vscode-trusted": "unmirrored" },
      "note": "VS Code's preview reads no engine config, so a shell fence is stock bash there" }
  ],
  "census": { "describes": "markdown-it plugins and plugin packages" }
}
```

### 4.1 Rows and coverage

Today's ledger rows already have this shape (`plugin`/`package`/`topic`, `what`, `coverage`, `via`,
`note`). New:

- **`covers`** replaces three ad-hoc keys with one typed key, so the harness can enumerate the source of
  truth (plugins, packages, components, registers) and find features with no row and rows with no
  feature.
- **`probe`** names a fixture under `lib/bridges/<id>/probes/` that the harness renders. It is a fixture
  id, not an example deck.
- **`observable`**, required on every `unmirrored` row: what a reviewer could see differ. One of
  `text`, `pixel`, `dom`, `pages`, `file` (a structure in the output file) or `none`. §5.1 uses it.
- **`environments`** overrides one row's coverage for one target environment (the shell grammar is baked
  for marp-cli and stock in VS Code; today that is two sentences in the README). Environments pin the
  target's version, because a score depends on it.

The **census** is the host's, not the bridge's: for each entry point, the host decides what set of
features the bridge must cover, so declaring a narrow census cannot pass T1. The declaration's `census`
field only *describes* it for a reader; the ledger already says this in prose ("it reads ONE file",
`marp-fidelity.js:23`).

The coverage values depend on the entry point, because the place the work happens differs:

| Entry | Value | Meaning |
|---|---|---|
| source | `baked` | the bridge rewrites the source; the target needs no help |
| source | `mirrored` | the shipped runtime redoes it in the target's page |
| source | `unmirrored` | the target shows something else; `note` says what |
| rendered | `native` | becomes an editable object (a text frame, a shape) |
| rendered | `pictured` | stays in the picture: looks right, not editable |
| rendered | `unmirrored` | the file shows something else; `note` says what |
| both | `moot` | the feature reaches the recipient unchanged with no bridge work; no README text |

`moot` keeps today's meaning for Mermaid: the shipped runtime draws it in Marp, the row exists so the
census is complete, and the README never lists it as a gap. It still carries a probe (§5.1). A third
bridge may add values only by changing the spec, so the harness can always say what each promises.

### 4.2 Rows Calco would declare

From reading `office-export.js` and the two Calco notes. This is a proposal; S3 (§12) turns it into a
measured declaration.

| Row | Coverage | Check |
|---|---|---|
| Words, with font, size, color, weight, slant, letter-spacing | `native` | every DOM word outside a figure appears in a text frame |
| Plain boxes and rules (cards, dividers) | `native` | the shape exists and the picture has no ghost of it |
| Speaker notes, alt text | `native` | present per slide |
| Charts, diagrams, SVG labels, MathML | `pictured` | pixel only; the text check exempts words the DOM marks as inside a figure |
| A tag drawn by `::before` | `pictured` | named as not yet native (`2026-10-07-calco-native-shapes.md` §8) |
| Backgrounds, photos | `pictured` | pixel |
| Motion (`anima`, focus steps, transitions) | `unmirrored`, observable `file` | the file has the poster frame and no animation part |
| Reflow when an editor types more text | `unmirrored`, observable `none` | a probe that grows a frame and checks the line count |
| Code ligatures, small caps, tabular digits | `native` where the embedded face keeps them | probe; unmeasured |

### 4.3 What the declaration replaces in the plugin manifest

`render.surfaces` has five keys (`engine`, `preview`, `pdf`, `player`, `marp`). Only `marp` is read by a
bridge, at `lib/core/marp-fidelity.js:313` (`pluginPackageRows` builds a Marp row from each manifest).
The other four describe Lattice's own surfaces, which the host decides. With a declaration, the plugin
stops naming `marp`.

**A plugin must not need a hand-written row in every bridge.** Each bridge computes a **default row**
for any plugin it has no row for, from the plugin's own facts (§9: `degradesTo`, `staticForm`,
`layoutAffecting`, whether it draws in a browser). The Marp default is today's derived row: "renders as
a code block showing its source". An explicit row overrides the default. T1 asserts that a plugin with no
row gets the default, so a zip plugin (phase E) is covered the day it installs. A plugin with
`layoutAffecting: true` must have an explicit row and a probe, because a source bridge cannot reproduce
bake-before-split.

The bridges note's §5.3 said this field becomes "the bridge preset". D1 removed presets; the
declaration's row is its replacement.

## 5. The conformance harness

One harness, four tiers, ordered by cost, each reading the declaration. It is the **Exporter kind** of
the conformance harness (`2026-10-15-conformance-harness.md` §6.2, phase 3) specialized for bridges, and
it reuses that note's rules against gaming (§6.3): debt keyed to the commit that seeded it, a fixture
that fails for the right reason with a passing twin, a stated minimum instance count per clause, and
"every clause names what it catches". One owner for the check "every construct has a ledger row": the
bridge's T1, which the component harness reads.

| Tier | What it checks | Cost (measured) | When |
|---|---|---|---|
| **T1 Declaration** | schema valid; the host's census matches the rows both ways; every `via` exists; every `unmirrored` row has `note` and `observable`; a plugin with no row gets the default | milliseconds | every PR |
| **T2 Claim probes** | each row's probe goes through the reference and the bridge, comparing a *projection* of what the row claims, with a floor (the reference produced at least N of it) | 34 tests in 18 s for Marp today (both ledger test files) | every PR |
| **T3 Decks** | each example deck goes through the bridge and its target, and text, pixel and page-count checks compare each slide with Lattice's own render | about 17 s per deck for both bridges (§6); 283 decks ≈ 80 minutes serial | nightly, and on a changed bridge |
| **T4 Safety** | output passes the HARD RULE #22 sinks; bundled scripts are pinned by hash and nothing else executes; for a file output, an OOXML scan finds no external link target and no macro part; two runs give identical bytes | not measured | every PR (first three), nightly (determinism) |

### 5.1 What each coverage value promises

| Coverage | T2 asserts | T3 asserts |
|---|---|---|
| `baked`, `mirrored`, `native` | the projection is equal, with the floor | slides carrying the row score within the blessed band; no exemption |
| `moot` | the projection is equal, with the floor | none beyond the band |
| `pictured` | the figure is absent from the text layer and present in the pixels | the text check exempts words the *DOM* marks as inside a figure; the pixel check applies |
| `unmirrored` | **the difference `note` describes is still there**, in the way its `observable` names | applies only when the observable is `pixel`, `text` or `pages`, and the slide is outside the band; otherwise T3 stays silent about the row |

**The stale-gap rule.** If an `unmirrored` row's probe stops showing the difference, the build fails
and says "promote this row". It does *not* fire from a whole-deck score alone: a still page cannot show
motion or reflow, and a word bag cannot show a lost period. The review found both, and the sketch
confirms the first (Calco's `anima` slides score inside the band, §6). **Promotion needs a positive
probe**: the row changes to `baked`, `mirrored` or `native` only when a probe shows the feature
now reaches the target. "The difference went away" is not enough, because the README would then claim
fidelity nothing attests.

### 5.2 Who sets the exam

A bridge must not grade itself. The host owns:

- **The census** (§4.1).
- **A floor on editable text.** For a rendered bridge, the host's reference sets a minimum share of
  non-figure words that must appear as text, per slide. A bridge cannot lower it by declaring everything
  `pictured`. A bridge that is one image per slide fails.
- **The baselines.** For admission, the host's run blesses the numbers. In-tree bridges keep a committed
  baseline per bridge, host and slide beside their declaration.
- **Page count.** T3 fails when a deck's page count differs from the reference, unless a row with
  `observable: pages` covers it (`panes` and `focus steps` do). Pages are compared by index only when the
  counts match.

### 5.3 Scores and baselines

Pixel scores differ by bridge: Calco through LibreOffice carries a floor of about 0.1 RMSE (0–1) that
Marp through Chrome does not (about 0.05). So each bridge keeps a **blessed baseline per slide**, not per
deck, because a median hides a regression on two of twelve slides. T3 fails when a slide gets worse than
its baseline by more than the bridge's declared band. The baseline **ratchets**: an improvement tightens
it; loosening one needs a justified re-bless in the PR, as `npm run bench:bless` does (HARD RULE #19).
A bump of a pinned target (marp-cli, LibreOffice) is its own bless, explained in its own PR, so a
Dependabot update does not move 283 baselines unseen.

### 5.4 What the harness does not check

It does not check that a bridge's output is pleasant to edit, that PowerPoint (rather than LibreOffice)
opens the file, or that VS Code's preview shows what marp-cli shows. The first is a judgment, the others
need the real application. Those stay with the export sign-off the QUALITY BAR requires, and a bridge's
PR still owes it whenever output bytes change.

## 6. The sketch, measured

`engineering/decisions/2026-10-15-bridges-and-two-hosts/bridge-harness-sketch.mjs` runs the T3 checks for
both entry points over any decks, on the CLI host. Lattice's PDF is the reference; the Marp bundle goes
through marp-cli 4.5.1; the Calco `.pptx` is read for its text and then rendered by LibreOffice. Output
is `bridge-harness-sketch-results.json`. Six decks, one run, `main` at `1828726`, 104 seconds of wall
clock. Page counts matched on every deck. Scores are medians and worst slides:

| Deck | Slides | Marp text recall / precision | Marp pixel (median / worst) | Calco editable-text recall | Calco pixel (median / worst) |
|---|---|---|---|---|---|
| `a11y` | 7 | 0.97 / 0.97 | 0.061 / 0.070 | 0.64 | 0.114 / 0.170 |
| `auto-glossary` | 7 | 1.00 / 1.00 | 0.051 / 0.064 | 1.00 | 0.093 / 0.123 |
| `anima-scene` | 6 | 1.00 / 0.76 | 0.268 / **0.558** | 1.00 | 0.097 / 0.158 |
| `pane-layouts` | 7 | 1.00 / 0.92 | 0.105 / 0.233 | 1.00 | 0.106 / 0.109 |
| `chart-lead-blocks` | 7 | 0.97 / 0.98 | 0.055 / 0.170 | 0.86 | 0.097 / 0.113 |
| `accent-finishes` | 12 | 0.97 / 0.98 | 0.058 / 0.078 | 0.96 | 0.101 / 0.145 |

*Recall* is the share of Lattice's words the bridge kept; *precision* is the share of the bridge's words
that Lattice also has. Pixel is RMSE between 30-dpi pages (0 identical, 1 opposite).

What the numbers show:

- **A declared loss shows, and by how much depends on the loss.** The worst *ordinary* Marp slide in
  these decks scores 0.078. The three `anima` slides (the ledger's "renders as a code block showing its
  JSON scene") score 0.483, 0.549 and 0.558 on pixels and 0.25–0.53 on text precision: six to seven times
  the ordinary worst. The `panes` slides (a ledger row: "both panes' content is stacked") score
  0.093–0.233 in `pane-layouts` and 0.170 in `chart-lead-blocks` slide 6: **1.2 to 3 times the ordinary
  worst, which is weak**, and the words are the same, so the text check sees nothing (recall 0.96–1.00).
  A pixel band catches the worst pane slides and misses the milder ones. That is the case for a probe per
  row (§5.1) and against reading whole-deck scores alone.
- **A loss a still page cannot show scores as nothing.** In Calco, `anima-scene` slides 3–5 score
  0.063–0.074, below Calco's own floor, because the reference PDF shows the same poster frame the file
  does. The motion is lost and no still comparison can say so. This is why the stale-gap rule (§5.1)
  requires an `observable` and a probe, and why it would otherwise have fired on Calco's motion row at
  once.
- **The two text checks measure different things.** Marp recall stays above 0.9 because Marp keeps text
  as text. Calco's *editable-text* recall is low where figures are: `a11y` slides 4–7 at 0.25–0.64,
  `chart-lead-blocks` slides 2–4 and 6 at 0.71–0.86. I did not verify that every missing word is a
  chart label, so this reading is **UNVERIFIED** word by word; `accent-finishes` slide 3 (0.54) is
  unexplained. To exempt a figure's words by declaration, the text check needs word positions from the
  page itself, which `pdftotext` cannot give. The reference words must come from the DOM, each tagged
  `figure` or `prose`.
- **The pixel floors differ by bridge** (about 0.05 for Marp, 0.10 for Calco), so §5.3 uses blessed
  per-slide baselines and not a shared threshold.
- **Cost.** About 17 seconds per deck for both bridges (stages: reference 3–8 s, Marp 3–5 s, Calco 4–7 s,
  LibreOffice 2–3 s). 283 example decks serial is about 80 minutes. T3 therefore belongs in the nightly
  tier and on a changed bridge, as the component render tier does.
- **Limits of the sketch.** CLI host only: the Studio camera is not measured. One page size, 30 dpi,
  one reference renderer. Pages pair by index. No per-row exemption, no probes, no VS Code preview. Six
  decks do not set a band; they show where the checks have signal. The band comes from a full nightly
  run.

## 7. Where this sits next to the conformance harness

`2026-10-15-conformance-harness.md` already plans an **Exporter** kind (phase 3: "one coverage deck
through every format", "Marp-ledger completeness") and a nightly step that runs report-only
(`CONFORMANCE_RENDER=1`, ruled yes on 2026-10-16, §13.3). This harness is that kind for bridges, with
the extra a bridge needs: a declaration. It reuses the host, the gaming rules and the report-only
posture. It adds one thing the component harness has no counterpart for: a CI step. **Adding a step to
the nightly or to `ci.yml` is the owner's call** (CLAUDE.md, second filter, row 2), so it is open
decision B2, not a default.

## 8. Bridges that contributors write

D6 says to build as if they will. Nothing here opens the door; it removes what would force a redesign
later.

- **The contract is data plus steps with plain-data inputs and outputs** (§3). A contributor bridge
  needs no repo internals, no page handle and no filesystem.
- **The channel decides where it runs**, as for plugins (`2026-09-27-plugin-system.md` §4.10). In-tree
  bridges run in the Node host and the browser host. A contributor's `read` code runs in a page, so it
  needs the sandbox and consent a code package already uses; a contributor's `transpile` and `write`
  would run in a sandbox, never in the CLI's own process. That is the decision to take before a package
  kind exists.
- **The harness is the admission test**, with host-owned exams (§5.2), because a contributor would
  otherwise declare a narrow census, a `pictured` everything and a baseline of their own. A package kind
  would require a passing T1–T4 run on a fixed deck set.
- **No `bridge` package kind now.** Phase E packages carry data and refuse code, so a bridge that must
  run code cannot ride that channel yet.

**The smaller alternative.** Probes for the six `baked` rows plus the stale-gap rule, on Marp alone, fix
the 19 unattested rows without a spec. That is S1 and S2 in §12. What the generalization adds is Calco,
and S3 onward is separable: the owner can stop after S2 and keep most of the Marp value.

## 9. The simpler plugin format

The bridges note's §5.3 gave a field-by-field verdict. This section turns it into one manifest and
settles what that note left open.

**A plugin says four things.**

| Part | Content | Today's field |
|---|---|---|
| Claims | fence names and body language, inline syntax, `@kind`, registers, extension points, diagnostics | `contributes.fences`, `syntax`, `registers`, `extensionPoints`, `diagnostics`, `inline` |
| Drawing | `render(source, ctx) → html` or `draw(figures, ctx) → results` | `render.exec`, hydrate and bake modules |
| Facts | `staticForm`, `layoutAffecting` (drawn size changes layout), `degradesTo` | `render.surfaces.pdf: "none"`, Mermaid's bake-before-split special case, `render.degradesTo` |
| Payload | the library, its source and hash | `payload`, `vendor` |

Plus `name`, `title`, `description`, `requires`, `optional`, `icon`, and one version field
(`"lattice": 1`) in place of `type`, `format`, `api` and `$schema`.

**What the build derives** (the bridges note's verdicts, with two changes):

- `tokens`, `contributes.styles`, `data`, `bake`, `hydrate`, `highlight` and `vendor` come from the
  stylesheet and the file listing. A check holds every derived token to the token registry, so a typo is
  still caught.
- **Changed:** `render.figureClasses` is *kept*. The `drawnFigureClasses` ratchet needs the exact names
  it bans outside `lib/plugins`; deriving them makes the gate depend on a parser that guesses. Two names
  for Mermaid cost two lines, and a wrong derivation costs a silent hole in a gate.
- **Changed:** `render.surfaces` goes away with no replacement in the plugin. The four Lattice surfaces
  are host decisions. `marp` moves to the Marp bridge's declaration, and the default row (§4.3) covers a
  plugin with none.
- `services`, `inline` kinds and `codeRenderer` stay declared, because reading them means loading the
  module (bridges note §5.3).

**The drawing contract** (bridges note §5.1) stays: `draw(figures, ctx) → results`, a batch, each figure
with its own context, each result `{ markup }` or a failure carrying the plugin's message. One rule is
added: **`draw` must be re-runnable on the same figure with a changed context** (band, hand, texture,
print), because the image-set export re-draws a figure per color scheme. Mermaid already works this way
(`lib/plugins/host-bake.js:18-31`, the re-bake hook).

**Before and after:** Mermaid 175 → 59 lines, the chart family 130 → 19, all nine plugins 908 → 424.
The system's gain is that a field nobody sets cannot disagree with the folder.

**The zip format** (phase E) waits for this format. That is D4. A zip carries no code, so it declares
claims, facts, styles and payload only; `draw` and `render` stay in-tree until the sandbox channel
exists.

## 10. Export mode: the host's precondition

The bridges note (§3.3, §5.2) made a named export mode P2's first question. The definition, from the
six reasons the CLI export page runs without the runtime (`lattice.js:3112-3129`; reason 6, the player's
pinned script, is `lib/export/player-core.mjs`):

**Export mode is the browser host loaded with `mode: 'export'`.** In that mode:

1. The overflow watcher is off, so print never gets the authoring badge (reason 1).
2. The host draws every figure to completion before layout and before capture, waits on the settle
   barrier (`data-lattice-settle`, bounded) and marks each result `[data-lattice-figure]` (reason 5: no
   request interception, no per-plugin selector). **A hard budget ends the wait,** and the timeout path
   emits the plugin's `degradesTo` fallback, so a hung plugin cannot hang an export and the bytes of a
   timeout are defined.
3. After capture, the host removes plugin scripts from the delivered file (reasons 2, 3). The exported
   player keeps only its one pinned script (reason 6).
4. PDF, PNG and PPTX are captured from the post-draw page, and the `--fluid` viewer is written after
   rasterizing, so bytes are unchanged with and without it (reason 4).

**One guard is missing.** Step 2's `[data-lattice-figure]` marker also drives the harness's text
exemption. A reviewer found that author HTML carrying `data-lattice-figure` reaches the output unchanged
(`data-lattice-settle` is already renamed to `data-author-lattice-settle`, the marker is not). S4 must
confirm it and add the marker to the author-namespace guard before anything keys on it.

This section is a design, not a measurement. It claims the runtime in export mode can replace the page's
hand-injected script without moving a byte. **That is the first thing S4 must prove**: byte-identical
PDFs for Mermaid, the chart family, function-plot and anima in light and dark, with the export sign-off
the QUALITY BAR requires. If the bytes move, this section is wrong and is revised, not the proof.

## 11. What changes in canon, if the decisions pass

| Doc | Change | Gated on |
|---|---|---|
| bridges note §5.3, `render.surfaces` row | "bridge preset" becomes "the Marp bridge's declaration and default row" (D1 removed presets) | this note |
| bridges note §5.3, `render.figureClasses` row | "derive, or keep" settles to "keep" | this note |
| `lib/core/marp-fidelity.js` | becomes the Marp declaration; the two tests move onto the harness | S1, B1 |
| `2026-09-27-plugin-system.md` | §4.2, §4.3, §4.6, §4.7 superseded where §9 changes them | D4, S4 |
| `2026-10-15-conformance-harness.md` §6.2 | the Exporter kind cites this note for bridges | S3 |

## 12. Order of work

Each step ships alone and leaves the tree green.

- **S1 Spec and Marp declaration.** The schema, a T1 that reads the existing ledger with the same
  meaning, and the two current tests moved onto it. No behavior change.
- **S2 Marp probes and the stale-gap rule.** Probes for the six `baked` rows and each `unmirrored` row,
  with `observable`; the stale-gap rule in report-only mode. The owner can stop here (§8).
- **S3 Calco's declaration, the protocol split and T3.** Split `office-export.js` into `read`, the
  host's capture and `write` where it is not already; measure the rows in §4.2; run T3 on the CLI host
  and mark the Studio host UNVERIFIED until its own run.
- **S4 The plugin format and export mode** (the bridges note's P2+P3, with §9–§10 as its input). The
  byte-sensitive step; owes the export sign-off.
- **S5 Phase E's zip format** on the simplified manifest.

S1 depends on nothing.

## 13. Risks, and what proves each

| Risk | Proof |
|---|---|
| The declaration is a second source of truth that drifts from the code | T1 enumerates the real features against the host's census and fails on a missing or stale row |
| Stale-gap rule promotes a row whose loss is still real, so the README overclaims | `observable` is required and promotion needs a positive probe (§5.1) |
| A bridge grades itself | the host sets census, editable-text floor, page count and admission baselines (§5.2) |
| The pixel band is wrong and flaps | per-slide baselines from a full nightly run; T3 report-only until then; target versions pinned |
| The Studio camera differs from the CLI's and the harness vouches for the wrong one | declarations keyed `bridge@host`; Studio UNVERIFIED until measured (§3) |
| A rendered bridge's output differs between LibreOffice and PowerPoint | the harness uses LibreOffice only; the QUALITY BAR sign-off covers PowerPoint |
| The plugin format loses a capability | port Mermaid first; its PDF stays byte-identical in light and dark and the image-set re-bake still reports kept and failed |
| The spec over-generalizes from two bridges | the vocabulary is closed; a third bridge adds a value by changing the spec in a PR |

## 14. Open decisions for the owner

One round. My recommendation is first in each.

| # | Decision | Options |
|---|---|---|
| **B1** | Where do declarations live? | **(a) `lib/bridges/<id>/<id>.bridge.json`**, a new folder holding bridge code, declaration, probes and baselines, as `lib/plugins/<name>/` does for plugins; it costs a move of two files. (b) Keep `lib/core/marp-fidelity.js` as the Marp declaration and put Calco's in `lib/export/`; two conventions |
| **B2** | CI step for T3 | **(a) Nightly, report-only, as the component render tier is ruled (§13.3 of the conformance note), plus a sampled run on a changed bridge.** (b) Gate every PR on a sampled five-deck set (about 90 s); its flake rate is unmeasured. Either adds a CI step, which is yours to decide |
| **B3** | `render.figureClasses` | **(a) Keep it** (§9). (b) Derive it and add a test that the derivation equals the committed list |
| **B4** | Stale-gap rule posture | **(a) Report-only for one release, then a failure.** It will find stale notes the first day. (b) A failure at once |

**Owner answers, 2026-10-17: yes to B1, B2, B3 and B4**, each as recommended. So declarations live in
`lib/bridges/<id>/<id>.bridge.json`; T3 runs nightly and report-only, plus a sampled run on a changed
bridge (adding that CI step is now approved by this answer, and still needs its own PR); `render.figureClasses`
stays in the plugin manifest; and the stale-gap rule is report-only for one release, then a failure.
S1 starts without another question (`followups.d/2761-p2-bridge-spec-s1-marp-declaration.md`). The
owner also asked for a follow-up to run a Calco file through the Studio host and a real PowerPoint
(`followups.d/2761-p3-calco-studio-host-and-powerpoint.md`).

## 15. Non-goals

- Building any of this.
- A `bridge` package kind, or running a contributor's bridge (§8).
- Changing the Marp bundle's output, Calco's output, or any plugin's behavior.
- Import from a bridge's target (bridges note §4.5).
- Activating `@layer` (D2; its measurements are in the bridges note).

## 16. Adversarial review (HARD RULE #25)

Tier 2, as the note is a public contract: a red team, a Munger inversion, an independent checker and a
fact-checker, on the first draft. What changed:

- **Checker.** Mermaid's `moot` coding contradicted the draft's example and T1 (fixed: §4.1 defines
  `moot` as claim-bearing and probed). The "about ten times" headline overreached (the worst
  ordinary Marp slide is 0.078, not 0.05, and the pane slides separate weakly: §6). The sketch's median
  took the upper middle value, and it checked no process status, no page count, and decoded entities
  twice (all fixed in the sketch and re-run on six decks). The text check cannot be built from
  `pdftotext` (§6 now requires DOM-tagged words). Citations: `marp-fidelity.js:313`.
- **Red team.** The stale-gap rule would promote rows whose loss a still page cannot show (fixed:
  `observable` and positive-probe promotion, §5.1). Slide-count mismatches went unchecked (§5.2). A
  bridge could set its own census, floor and baseline (§5.2). The sandbox claim failed with a live page
  handle (§3: data-only protocol). A `.pptx` can carry external links or macros (T4). Authors can forge
  the figure marker (§10, S4). Settle budgets had no timeout bytes (§10).
- **Inversion.** Calco's host takes the picture, and the Studio uses a different camera (§2, §3).
  Dropping `render.surfaces.marp` would have forced a hand row per plugin per bridge (§4.3 default row).
  Baselines churn on target bumps (§5.3). The conformance harness already planned an Exporter kind
  (§7). Layout-affecting plugins need a probe (§4.3). The smaller alternative is §8.
- **Fact-checker.** 3 refuted, all fixed: `marp-fidelity.js:313`, `lattice.js:3112-3129`, the "0.05"
  claim. The 92 s wall clock was unverified in the draft; the re-run measured 104 s for six decks.

## References

- `2026-10-15-bridges-and-two-hosts.md` (§4, §5, §9); `2026-09-27-plugin-system.md`
- `2026-10-15-conformance-harness.md` (§6.2, §6.3, §13.3)
- `2026-10-06-calco-office-export-library.md`; `2026-10-07-calco-native-shapes.md`
- `lib/core/marp-fidelity.js`; `test/unit/core/marp-fidelity.test.js`;
  `test/unit/core/marp-fidelity-render.test.js`; `lib/export/office-export.js`
- Evidence: `2026-10-15-bridges-and-two-hosts/bridge-harness-sketch.mjs`,
  `bridge-harness-sketch-results.json`
