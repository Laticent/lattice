---
status: proposed
summary: A bridge is a transpiler from Lattice to another engine (Marp first). Flattening a layered stylesheet for Marp is exact on 276 decks, which lifts @layer's Marp veto, but activating @layer stays a separate call. Plugins shrink to what an author writes and how it draws; two hosts (Node, browser) own the rest; authors pick from export presets.
---

# Bridges, and two plugin hosts (2026-10-15)

## 1. The answer

**A bridge is a transpiler from Lattice to another slide engine.** The Marp export is the first
one. Today it copies Lattice's stylesheet into the Marp bundle unchanged, and that copy is why
HARD RULE #26 vetoes `@layer`: Marp's own base styles are unlayered, and an unlayered rule beats
every layered one. A bridge that **compiles** the stylesheet instead removes that veto. Lattice
could write layered CSS, and the Marp bridge would flatten it into the plain CSS Marp expects.

**Measured, through a real marp-cli:** the flattened stylesheet gives the same computed style
as the layered one on every slide element of every deck the census rendered: 275 of the 276
example decks plus the gallery baseline (§3.1). Without
flattening, the veto reproduces on every deck.

**Removing the veto does not mean `@layer` should be turned on.** That is a separate decision
(D2) with real costs. Layering changes Lattice's own rendering on at least 119 elements of the
gallery deck alone (§3.1). And **an author's own CSS loses**: a deck's `style:` front matter and
`<style>` blocks, which win today, lose to the flattened Lattice rules, at export and after it
(§4.4). The benefit is a real specificity tax whose decisive part, the cross-file share, is
not measured (§3.6). This note recommends adopting the bridge model now, and deciding
activation only after those are measured and solved.

**The same idea simplifies plugins.** A plugin says what an author writes (a fence, inline
syntax) and how it draws (`render` anywhere, or `draw` in a browser), plus a few facts only it
knows. **The host**, meaning the code that runs plugins, decides the rest: when a plugin runs,
which surfaces get it, and what an export waits on. There are two hosts, Node and the browser.
Marp is not a host; it is a bridge's target.

**At export, the author picks a preset** for where the deck will be opened. The preset decides
how each plugin travels: live (our runtime draws it in Marp), frozen (we draw it and ship the
picture), stock (Marp's own version), or as is. This matters because **the VS Code Marp preview
blocks our scripts by default** (§3.2). One choice in its security menu, *Disable*, lets them run,
and that is the owner's usual setting, so VS Code gets two presets.

The owner decisions are in §9. Nothing here is built yet.

## 2. Words used in this note

| Word | Means | Examples |
|---|---|---|
| **Engine** | A program that turns a deck's source into slides | Lattice; Marp; later Slidev, Quarto |
| **Host** | A place where *Lattice's plugin code runs* | Node (CLI, build); a browser page (Studio, Playground, desktop app, export capture, the exported HTML player, which runs anima's code) |
| **Format** | A finished artifact in which no plugin code runs, and which nobody edits back into a deck | PDF, PPTX, ODP, PNG, video. Exported HTML is a format **unless** it carries the player, which makes it a browser host packed in a file |
| **Bridge** | Lattice code that translates a deck into *another engine's source*, which the user keeps editing and that engine renders | Export to Marp (`lib/core/marp-bundle.js`, `tools/export-marp.js`) |
| **Target environment** | Where a bridged deck is opened. One engine can have several, with different abilities | marp-cli; the Marp for VS Code preview |

A format is the end of the line. A bridge's output is not: it is source, and someone else's
engine renders it again later, possibly after the user edits it. That is why Marp felt like
neither a host nor a format.

## 3. What was measured

The examples-wide census, the runtime-loaded gallery census (with the size figures) and the
manifest count are committed next to this note, in `2026-10-15-bridges-and-two-hosts/`, with
their results and a README saying how to rerun them. The author-CSS test, the micro-tests and the
VS Code run were scratch runs and are not committed; the VS Code behavior is also recorded in
`engineering/gotchas/vscode.md` and in VS Code's own source (§3.2).

### 3.1 Flattening `@layer` for Marp

**Question.** If Lattice's stylesheet were fully layered, can a bridge turn it into CSS that
Marp renders exactly as the layered sheet means?

**Method** (`layer-census.cjs`):

1. Build `dist/lattice.css`, then export each deck with `tools/export-marp.js`.
2. For the deck's palette, make three stylesheets, each the full engine CSS plus the palette as
   one Marp theme:
   - **L**, layered: each `/* === source === */` section of `dist/lattice.css` wrapped in one of
     the seven reserved layers, assigned in bundle order and never moving backward, plus a
     `theme` layer for the palette. `@font-face` and `@property` are hoisted out.
   - **C**, bridged: L run through `@csstools/postcss-cascade-layers` 6.0.2, which removes the
     layers and raises selector specificity to keep their order.
   - **A**, the reference: L, with Marp's own CSS moved into a `marp-base` layer below
     everything. This writes out by hand what "Marp's base sits under Lattice" means.
3. Render each through `@marp-team/marp-cli` 4.2.3 (`--html=false`: CSS only, no runtime).
4. In Playwright's Chromium (build 1194), read `getComputedStyle` for every element of every slide, plus its
   `::before` and `::after`, and compare.

On the gallery deck, a fourth sheet, **D**, is today's unlayered bundle, to measure what
layering itself changes. The gallery was run twice: with the spike's layer order and with the
repo's declared order (`tools/build-css.js:259`, `base` before `root`). Both gave the same
numbers. The examples-wide run used the spike's order only. The gallery was then rendered the way an author sees it (`runtime-census.cjs`): through the
bundle's own `marp.config.cjs`, so its real HTML allowlist applies and the runtime loads and
settles, with `::marker` in the census. That renders the 139 spans, 8 KaTeX blocks and 8
background divs that `--html=false` escapes (5,699 elements instead of 2,016). The red team ran
this first; the committed script reproduces its numbers exactly.

**Results.**

| Comparison | What it tests | Result |
|---|---|---|
| **A vs C**, every deck rendered | Does flattening reproduce the layered meaning inside Marp? | **0 differing elements** across **276 decks** (275 example decks and the gallery baseline), **40,590 elements, 14 palettes** (4 of them dark). The 276th example, `data-viz-gallery.md`, has no front matter, so Marp renders it in its own default theme; it is excluded |
| A vs L, every deck rendered | The veto: layered Lattice next to unlayered Marp base | elements differ on **all 276** decks. On the gallery, 121 of 2,016: Marp's pagination `::after` wins position and padding |
| A vs C, gallery, real allowlist, runtime loaded | The same, on the DOM an author actually sees | **0 of 5,699**, screen and print media (`runtime-census-results/`); also 0 with `mustard-dark` in the red team's run |
| D vs A, gallery, CSS only | What layering changes in Lattice's own meaning, Marp aside | 20 of 2,016 |
| D vs C, gallery, real allowlist, runtime loaded | The same, on the real DOM | **119 of 5,699** (`runtime-census-results/`) |

**Reading the results.**

- **Flattening is exact.** Across the examples, and on the gallery with the runtime, the
  flattened sheet means exactly what the layered sheet means. Micro-tests by the red team also
  agreed on `!important` across layers, inline `!important`, `@keyframes` in reverse layer
  order, nested layers, `@layer` inside `@media`, `:where()` and `:has()`. The veto in
  `2026-06-18-layer-activation-scope.md` (R-PATH) is real, and the bridge removes it **for the
  CSS Lattice ships**. Author CSS is outside that, and breaks (§4.4).
- **Layering changes Lattice's own rendering, and not on a few elements.** On the gallery, 119
  elements change with the runtime loaded, mostly because a rule in an earlier file had higher
  specificity than a rule in a later file and layers ignore specificity. Examples: inline
  `code` on the title slide switches from JetBrains Mono at 43.4px to Outfit at 81.2px; a title
  paragraph widens from 881px to 1,612px; a `div.cell-stage` gap halves from 48px to 24px; a
  `div.masthead-lede` loses its centering. Each is a rule to move or re-scope before activation,
  by the protocol in `engineering/cascade.md` §"What changing the cascade now would require".
  The examples-wide count is not measured (the census ran CSS only).
- **Flattening costs size, less than it first looked.** What ships is the theme stylesheet Marp
  writes into the page: on the gallery, 1,315,199 → 1,703,226 bytes (+29.5%), and gzipped
  130,074 → 136,908 bytes (+5.3%) (`runtime-census-results/`).
  The flattener repeats `:not(#\#)` per selector to encode a layer's rank, which compresses well.

**Not covered:** the runtime's DOM beyond the gallery; the VS Code preview's own stylesheet;
author CSS, which breaks (§4.4). **One gap in the reference itself:** A puts Marp's own
`!important` rules (the advanced-background `display:block!important`) in the lowest layer, and
in the lowest layer an `!important` rule *wins*. So for `!important`, A means "Marp's base wins",
the opposite of its intent. No element differed on the gallery's 9 `![bg]` slides, but the
reference must define `!important` explicitly before it gates anything.

### 3.2 The VS Code Marp preview and our scripts

`engineering/gotchas/vscode.md` settled this on 2026-09-06: our scripts are blocked at the
default security level and run at *Disable*. This note's run reproduces it on current versions
and adds two facts.

Driven on a real code-server 4.141.0 (VS Code 1.141.0) with marp-vscode 3.6.1 from Open VSX,
opening an export of `examples/diagram-narration.md` (seven Mermaid fences):

| Marker | Default level (Strict) | After *Markdown: Change Preview Security Settings → Disable* |
|---|---|---|
| Content Security Policy | `script-src 'nonce-…'`; our three tags carry no nonce | none |
| Console | `Refused to load the script …` for `mermaid-v11-min.js`, `lattice-dagre-min.js`, `lattice-runtime-min.js` | clean |
| `<html data-lattice-runtime>` | absent | `loaded` |
| Mermaid fences | raw source text on every slide, under a "Some content has been disabled" banner | marked rendered, but each SVG is 0 px wide (blank) **in this headless harness only**; see below |

New since the gotcha entry:

- **Only one of the four levels runs our scripts.** VS Code's Markdown preview builds its policy
  from the level (the built-in `markdown-language-features` extension). *Strict*, *Allow insecure
  local content* and *Allow insecure content* all keep `script-src 'nonce-…'`, so our scripts stay
  blocked; they loosen images, fonts and styles only. *Disable* returns no policy at all, and so
  does VS Code's older "trusted preview workspace" flag, which maps to the same level. Workspace
  trust (Restricted Mode) is a separate gate: marp-vscode needs it to render the deck's HTML at
  all, but it does not unblock scripts.
- **The security level cannot be shipped.** VS Code stores it per workspace in extension state,
  not in `settings.json`.
- **`markdown.marp.enableHtml` is deprecated in marp-vscode 3.6.1** in favor of
  `markdown.marp.html: "all"`. The bundle's `vscodeSettings()` (`lib/core/marp-bundle.js:508`)
  still writes the old key, which works through a legacy branch and shows a warning.

The bundle's own README still says it cannot confirm whether the scripts run
(`lib/core/marp-bundle.js:667`). That is stale.

**The blank Mermaid is a harness result, not a confirmed product defect.** It reproduces in a
headless code-server here (twice in September, once on 2026-10-15). In the owner's real VS Code,
with the same bundle (the three script tags, `lattice.css` and the palette registered as
`markdown.marp.themes`, `theme: indaco`) at *Disable*, Mermaid draws. A 0 px width is what
Mermaid produces when it measures text in a frame that is not being painted, which a headless
webview can be; the gotcha entry also records that the diagrams drew when
`bierner.markdown-mermaid` was installed. Unconfirmed either way.

So **live drawing does not work out of the box**, but it is one menu choice away, and the owner's
own habit is to choose *Disable*, and in the owner's VS Code that renders Mermaid live today.

### 3.3 Why the CLI export page runs without the runtime

1. **The overflow watcher** repaints the authoring badge during print (`lattice.js:3100-3110`).
2. **A clean exported file:** the runtime is treated as a no-op on export output, because
   Mermaid is pre-drawn and the styles are embedded (`lattice.js:3105-3106`, `3112-3114`).
3. **A `<script src>` does not resolve** in a shared HTML file (`lattice.js:3112-3113`).
4. **Same bytes with or without `--fluid`:** PDF, PPTX and PNG are rendered from the cleaned
   page, and the fluid viewer is written only after rasterizing (`lattice.js:3114-3117`).
5. **Speed:** stripping the tag replaced request interception, which pushed the 53-component
   suite into CI timeouts (`lattice.js:3107-3109`).
6. **The player's policy** pins exactly one script by hash (`lib/export/player-core.mjs:3333-3335`).

Mermaid's Node bake also draws in a browser (Puppeteer in a child process,
`lib/plugins/mermaid/shared/render-worker.js`). What needs Node is the orchestration around it:

- drawing **before** the engine lays out the deck, so auto-split and overflow measurement see
  the real diagram size (`bakeDeck`, `lattice.js:1830-1831`);
- re-drawing a figure in another color scheme for the image-set export (the re-bake hook,
  `lib/plugins/host-bake.js:18-31`, `lattice.js:1835`), with a kept/failed report;
- per-figure context: each fence is re-oriented to its pane and drawn for its own slide's
  band, hand, texture and print mode (`lib/plugins/mermaid/mermaid.bake.js:441-530`).

So "just load the runtime in the export page" is wrong. The reasons are real. What changes is
**who owns them**: today each plugin that draws in a browser carries a bake, an exec mode and a
surfaces table to work around them. Under §5 the host carries them once.

### 3.4 The plugin manifest restates the folder

`lib/plugins/resolve.js:247-258` checks that `contributes.styles: true` matches a
`<name>.styles.css` file, and that `tokens` is **exactly** the set of `var(--…)` reads in it.
The same "declared ⇔ the module provides it" check covers `hydrate`, `bake`, `highlight`,
`data`, `services` and `inline`. The first four can be read from the file listing; `services`
and `inline` need the module loaded, so §5.3 keeps those declared. Mermaid hand-lists 50 tokens; the chart family, 104.

`measure-manifests.mjs` applies §5.3's changes to the seven in-tree manifests and re-serializes
both versions at the same indent: **597 lines → 216 (−64%)**. Mermaid goes from 136 to 29, the
chart family from 130 to 19.

The system has 12 `contributes` keys (`lib/plugins/plugin.schema.json`), 15 top-level generated
files in `lib/plugins/`, and four `ctx` shapes a plugin can receive (render 7 fields, bake 11,
hydrate 5, pass 7). The open code-plugin branch (`claude/code-highlighting-plugin-gvpnq5`,
`2026-10-15-code-plugin.md` on that branch) adds a 13th key, `codeRenderer: true`, of the same
"this module provides X" kind.

### 3.5 What the Marp bundle does per plugin today

From `lib/core/marp-fidelity.js` and `lib/core/marp-bundle.js`:

| Plugin | Today in the Marp bundle | In this note's words | Why |
|---|---|---|---|
| math | Typeset by our KaTeX before export; Marp's own math turned off | frozen | **security**: Marp's MathJax let `\style{…"/on…="…}` run a handler in marp-cli and VS Code (`marp-bundle.js:400-404`, `marp-fidelity.js:246-247`) |
| mermaid | Fence left in place; our runtime and Mermaid shipped as script tags | live (blocked in VS Code by default, §3.2) | |
| code | Marp's own highlight.js | stock | |
| function-plot, anima, code packages | Left as code blocks ("unmirrored") | as is | |
| chart family | Runtime coverage claimed by the bundle README, no fidelity row | unverified | |

Each choice is hard-wired in `marp-bundle.js`. No author picks it.

### 3.6 What `@layer` would buy

`engineering/cascade.md` §"The `!important` inventory" says full activation would retire about
zero `!important`: the remaining ones defeat inline styles that Mermaid and KaTeX emit, which
layers cannot reach. So the benefit is not fewer `!important`. It is the **specificity tax**:
rules that win only because someone raised their selector or relied on file order. Counted over
the 147 non-token CSS files in `lib/` and `themes/` (2026-10-15):

| Measure | Count |
|---|---|
| Doubled-class selectors (`.x.x`), the Stage 1 technique for winning on specificity | 255, in 34 files |
| Lines containing "specificity" (`grep -ci specificity`) | 167 |
| Specificity entries in `engineering/gotchas/` | 35 lines |

A sample of the comments shows both kinds of fight. Some are **cross-file**: a modifier against
a component, a finish against the accent field (`base.finish.css:522`, "only source order gives
them"). Layers would end those. Others are **within one file** (a component's variant against
its own base rule), and layers do not touch them. **The cross-file share is not measured.** It
is the number that decides whether activation pays (D2).

Two benefits are forward-looking and not measured: plugin and theme CSS from zips (phase E) could
sit in a layer that cannot outrank engine chrome whatever its specificity, and an author's own
deck CSS would win by being unlayered rather than by specificity.

## 4. The bridge model

### 4.1 Lattice's source is free; the bridge compiles down

Lattice's own source (its CSS, its syntax, its runtime) can target the modern platform. A bridge
compiles that source down to what its target accepts, the way Babel compiles modern JavaScript
for old browsers. A constraint that exists only because of one target lives in that target's
bridge, not in Lattice's source.

`@layer` is the first case, and the only one measured. Others may exist, for example authoring
syntax shaped by Marp's directive comments, or what the `marp-fidelity` ledger records; each
needs its own measurement before it moves.

### 4.2 A bridge declares what its target environments can do

| Environment | Raw HTML | Runs our scripts? | Runs engine plugins? | Comments become |
|---|---|---|---|---|
| marp-cli (`npm run pdf` / `html` in the bundle) | through the bundle's allowlist (`marp-bundle-html.js`) | yes (real headless browser) | yes (`marp.config.cjs`) | speaker notes, except the bundle's own trailer comments (`marp-bundle-html.js:187-196`) |
| Marp for VS Code, untrusted workspace | **off** | no | no | speaker notes |
| Marp for VS Code, trusted workspace, default level | **all of it, no allowlist** (`enableHtml: true`, `marp-bundle.js:508`) | **no** (Strict policy) | no (no custom engine) | speaker notes |
| Marp for VS Code, trusted, at *Disable* (the owner's usual setting) | all of it | yes | no | speaker notes |

The allowlist that protects marp-cli does not exist in VS Code, so anything a bridge emits must be
safe without it.

### 4.3 How a plugin travels: presets first

| Choice | What ships | Editable in the target? | Our quality? |
|---|---|---|---|
| **Live** | The source, plus our runtime and the plugin's library, loaded through one runtime entry point | yes, it redraws as you type | yes |
| **Frozen** | Our finished drawing, with a way back to its source | the prose, yes. The drawing changes only on re-export | yes |
| **Stock** | The target's own version, where it has one and it is safe | yes | the target's |
| **As is** | The source, nothing drawn | yes | n/a |

**The product is the preset, not the four-way choice.** The export dialog asks where the deck
will be opened (VS Code with scripts allowed, VS Code at its default, marp-cli) and the preset fills in every plugin the deck uses
(`lib/plugins/deck-plugins.mjs` and each plugin's `detect` know which). Per-plugin overrides sit
behind an *Advanced* control. Only the preset combinations are tested and gated, so the matrix
of plugins × choices × environments does not ship untested cells.

**Frozen is real work for the bridge. The red team rendered the obvious form and it failed:**

- **Inline SVG fails the allowlist.** Mermaid draws labels as HTML inside `<foreignObject>`
  (`htmlLabels: true`, `lib/plugins/mermaid/shared/init-directive.js:490`) and styles them with
  an SVG `<style>`. The bundle's allowlist refuses both on purpose: `foreignObject` because it can
  load or run something, `style` because Marp reads it before render (`lib/core/marp-bundle-html.js:46-53`), and its `safeUrl` refuses
  `data:image/svg+xml`. Rendered through the bundle's config, the frozen diagram came out with
  `&lt;foreignObject&gt;` escaped as text: no labels, no styling. Widening the allowlist reopens
  HARD RULE #22, and VS Code has no allowlist at all (§4.2).
- **The likely carrier is a sidecar image file**, referenced with a Markdown image: an SVG file,
  or a PNG. Not measured: whether the label fonts survive when an SVG loads as an image (an image
  cannot fetch fonts, so they would have to be embedded or the text converted to paths), and how
  a PNG looks at 4k.
- **The source cannot live in an HTML comment.** The red team tried it: Mermaid's `-->` ends the
  comment early, and the rest of the source (`B --> C[<img src="x" />]`) rendered as slide text.
  Marp also turned the comment into a speaker note, which `--pptx` carries into the file. The
  bundle already has a safe carrier, its inert JSON blocks (`<script
  type="application/lattice-front-matter">`, with `<` escaped), or the source can be a sidecar
  file next to the image.
- **Drift.** If the author edits the source in VS Code, the picture is stale until the next
  export. The frozen block carries a hash of its source; the next export, the import, and
  (where scripts run) the preview warn when they disagree.

So P1 starts with a frozen-Mermaid spike in marp-cli and in VS Code (untrusted and trusted)
before anything ships, and D3 waits for it.

**Stock is opt-in, and never offered where the target's version is an untrusted-content sink.**
Marp's math is the precedent: it is frozen for security, not taste (§3.5).

**What frozen costs a plugin.** For a plugin with a static form, nothing: the host already
draws it for PDF export. For one without (anima's `surfaces.pdf: "none"`), frozen is not
offered. Stock needs an optional per-bridge translation the plugin may supply.

### 4.4 The `@layer` case in full

**What the bridge does.** It concatenates the stylesheets it ships (the engine CSS and the
deck's palette) into one theme and flattens them as one unit, because the layer order is
declared once; flattening each file alone would rank their layers independently.

**What the census settled** (§3.1): exact on all 276 decks it rendered, in marp-cli, CSS only, and on
the gallery with the runtime loaded.

**What it leaves open:**

- **The author's own CSS loses, at export and after it.** Flattening raises Lattice selectors by
  an ID-level step per layer rank (`section:not(#\#):not(#\#) h1`). An author's CSS has no such
  step. The red team measured it on the gallery: today, a `style:` front-matter rule colors `h2`
  `rgb(1,2,3)` and a `<style scoped>` block colors it `rgb(4,5,6)`; bridged, both lose to Lattice
  (`rgb(240,229,200)` and `rgb(42,26,6)`). Three example decks carry a `<style>`
  (`finish-override.md`, `finish-backdrops.md`, `backdrop-register.md`), and the owner's own
  workflow, "export, then edit in VS Code", adds more after export.
  - **The reference does not settle it.** Under the layered meaning, unlayered author CSS beats
    every layer; today, specificity decides; bridged, Lattice wins. Three different answers, so
    the census's "0 differences" says nothing about CSS outside what the bridge flattens.
  - **The bridge can rewrite what exists at export** (front matter and `<style>` blocks, raised
    above the top rank, with Marp's per-slide scoping of `<style scoped>` handled), but that is
    unbuilt and unmeasured. **CSS written after export** needs a different answer: a flattening
    that lowers early layers with `:where()` instead of raising late ones, a documented override
    form in the bundle README, or accepting the loss.
  - **This blocks activation (D2), not the bridge.**
- **`!important` inverts across layers** (`engineering/cascade.md` rule 2). The flattener
  handles this per spec; the Mermaid and KaTeX overrides of inline styles stay `!important` either
  way (cascade.md, "A fourth surprise").
- **Size**: +29.5% on the theme stylesheet Marp ships, +5.3% gzipped (§3.1).
- **A dependency we then own.** Marp fidelity would rest on the flattener keeping up with every
  CSS feature Lattice adopts. Pin its version, and keep the census as a test over a fixture deck
  so a bump that changes output fails the build.
- **A new HARD RULE #22 sink.** The flattener parses palette and plugin CSS and serializes it
  again, which is the "CSS re-wrap" shape. postcss kept a hostile `<\/style` escaped in the red
  team's test, but a later minify step could turn it back into a live terminator, and
  `checkCssTreeRewrapSinks` only detects css-tree (`tools/check-ownership.js:7794`). The
  flattening step calls `sanitizeStyleText` on its output and is registered with the gate.
- **Lattice's own migration**: the elements whose meaning layering changes (§3.1) are fixed
  before activation, not by the bridge.

**What changes in the rules, if D1 and D2 pass.** HARD RULE #26's core, *never half-layered*,
still holds for every stylesheet a browser loads from Lattice. Its veto, R-PATH, would no longer
apply, because the Marp consumer would receive flattened CSS. Activation stays one coordinated,
gated pass.

### 4.5 Import is best effort, and later

Exporting is what we control. Importing a Marp deck, or other formats, is later and best effort,
with no fidelity promise. The one property worth keeping now is that frozen output keeps a way
back to its source, so a deck we exported can come back losslessly.

## 5. Two hosts, simpler plugins

### 5.1 What a plugin says

1. **Claims**: what an author writes. A fence name and its body language; inline syntax with its
   trigger characters and install anchor; an `@kind`. These stay readable without running code,
   because the grammar host and the zip importer act on them.
2. **How it draws**, in one of two forms:
   - `render(source, ctx) → html`, synchronous, on either host (math, code); or
   - `draw(figures, ctx) → results`, needs a browser, and receives a **batch**. Each figure
     carries its own context (band, hand, orientation, print, texture). Each result is
     `{ markup }` or a failure with the plugin's own message, so the host can report what was
     kept and what failed. Mermaid's need to group figures by palette (one global
     `mermaid.initialize`) is handled inside one `draw` call, with no separate pass mode.
3. **Facts only the plugin knows**: whether it has a static form (anima does not); whether its
   drawn size can change layout (Mermaid's can, so the host draws it before auto-split).
4. **Styles**: a token-only stylesheet, if it has one.
5. **Payload**: the library it loads, with its source and hash, loaded only when the deck uses it.
6. Optionally, **what it shares** with other plugins (services, data, extension points), and a
   **per-bridge translation** for the stock choice.

### 5.2 What the host decides

- **When a figure is drawn.** Live in the Studio. Ahead of time for an export, in a browser page
  the host owns, *before* layout for a plugin whose drawn size changes layout (today's Mermaid
  bake, generalized). Again in another color scheme for an image set (today's re-bake hook,
  generalized: `draw` again with each figure's context changed).
- **Which surfaces get what**, including the bridge presets.
- **What an export waits on**: the settle state, figure markers, time budgets.
- **What a failure shows**: the fallback, by default the source.
- **Each target's constraints**: the export page's clean-output, policy and byte-identity rules
  (§3.3), owned once by the host instead of encoded per plugin. Two of them, the unresolvable
  `<script src>` and the player's single pinned script, are properties of the *delivered file*,
  not of the page that captures it. So the host has a named **export mode**: draw everything
  ahead, then deliver a file with no plugin script in it (or, for the player, only the pinned
  one). P2 defines it before the contract freezes (D4).
- **Where plugin code may run, by the channel it arrived through.** "The host decides when"
  never means "any host runs anything". In-tree plugins run on both hosts. A zip plugin carries
  no code (phase E refuses `exec`, `hydrate` and `bake`, `lib/packages/code-shape.mjs:331-337`, and script
  files, `lib/packages/read.js`),
  and a code-door fence runs only behind its consent and sandbox (`2026-09-27-plugin-system.md`
  §4.10). The Node host never runs third-party `render` in its own process.

`ctx` holds what the whole call needs: the plugin's options, a token reader, its loaded library,
and its name. What differs per figure travels on the figure.

### 5.3 The manifest, field by field

| Field | Verdict | Read today by | After |
|---|---|---|---|
| `tokens` | derive from the stylesheet | `resolve.js:254` equality check | the build reads `var()` calls; a new check holds every derived token to the token registry, so a typo is still caught |
| `contributes.styles`, `data`, and `bake` / `hydrate` / `highlight` | derive from the **file listing** | `resolve.js` | a role file's presence is the declaration |
| `contributes.services`, `inline` kinds, `codeRenderer` | **keep declared** | `build-plugin-registry.js:125-172` `require`s the module to learn them; `resolve.js` checks module against manifest | deriving these would mean running plugin code to learn what it contributes, and would delete the two-sided check that a consent dialog reads. They stay declared |
| `render.surfaces` | remove | `marp-fidelity.js:294` (`moot` vs `unmirrored`) | the bridge preset; "no static form" moves to §5.1's facts |
| `render.figureClasses` | derive, or keep | the `drawnFigureClasses` ratchet, `check-ownership.js:7911,8070`, which bans these classes as selectors outside `lib/plugins` so callers use the host's `[data-lattice-figure]` marker | the ratchet still needs the names it bans. Derive them from the plugin's stylesheet and drawing code if that proves reliable; otherwise this one field stays |
| `render.exec`, `render.parity` | remove | the host | a host decision from §5.1's facts |
| `hydrate.budgetMs` | remove | `build-plugin-registry.js:478` → `host-browser.mjs:209` | a host default |
| `vendor` license entries | derive from `payload` | | |
| `type`, `format`, `api`, `$schema` | collapse to one version field | | |
| `name`, `title`, `description`, `requires`, `optional` | keep | | |
| `fences`, `syntax`, `inline` claims, `registers`, `extensionPoints`, `diagnostics` | keep | | what an author writes, and real vocabulary |
| `payload` | keep | | a trust fact |
| `degradesTo` | keep, default "show source" | | |

The 2026-09-27 design asked for a manifest "readable without running any of its code" (§1 of that
note). This keeps the property: only facts a file listing or a stylesheet scan can establish are
derived, and anything that needs a module evaluated stays declared and cross-checked.

### 5.4 The two hosts

| Host | Today | After |
|---|---|---|
| **Node** | `host.js` (render), `host-grammar.mjs` (syntax), `host-bake.js` (bake) | grammar plus `render`; drives a browser page for `draw` when an export needs drawings before layout |
| **Browser** | `host-browser.mjs` in the runtime; its serialized copy, `hydrate-script.js`, for the CLI export page; the exported player | one browser host. Whether the export page loads it as is, or needs an export mode of the runtime (watcher off, everything inline), is P2's first question |

PPTX, ODP, PDF and the rest are formats made after the hosts finish. Marp is a bridge's target.

## 6. What changes in canon, if the decisions pass

| Doc | Change | Gated on |
|---|---|---|
| `lib/core/marp-bundle.js` README text and `vscodeSettings()` | the measured behavior; `markdown.marp.html: "all"` | nothing (P0) |
| `2026-09-27-plugin-system.md` | §4.2, §4.3, §4.6 and §4.7 superseded where §5 changes them; phase E's zip format waits for §5.3 | D4 |
| CLAUDE.md HARD RULE #26 | keep "never half-layered"; replace the Marp veto with "a bridge flattens for targets that cannot take layers" | D2 |
| `engineering/cascade.md` | §"Why full activation is vetoed" becomes "how the Marp bridge flattens" | D2 |
| `2026-06-18-layer-activation-scope.md` | R-PATH resolved; Stage 2 still all-or-nothing | D2 |

## 7. Risks, and what proves each step

| Risk | Proof |
|---|---|
| Flattening diverges with the runtime's DOM, or in the VS Code preview | The census with the runtime loaded and the real allowlist, across every example deck, in marp-cli and in the real VS Code preview at Disable; the reference defined explicitly for `!important` (§3.1) |
| A flattener bump changes output | The census over a fixture deck as a unit test, with the flattener pinned |
| Layering changes Lattice's own render | Every element the census lists as changed is moved or re-scoped, proven with `tools/pixel-check.js` against in-sandbox baselines (cascade.md's protocol) |
| Frozen output breaks the bundle or leaks markup | The P1 spike: frozen Mermaid in marp-cli and VS Code, labels visible, source not in the speaker notes, through #22's sanitizer |
| Export bytes change | Export sign-off per the QUALITY BAR, dark and light, sent before merge, for **P1** (the bundle changes), **P2+P3** (drawing moves; byte proofs for Mermaid, the chart family, function-plot and anima, not Mermaid alone) and **P4** (the bundle's `lattice.css` changes) |
| Author CSS silently loses | The census extended to decks with `style:` front matter and `<style>` / `<style scoped>` blocks, and to CSS added after export; author rules must win where they win today |
| The simpler plugin contract loses a capability | Port Mermaid first; its PDF stays byte-identical in light and dark, and the image-set re-bake still reports kept and failed |
| Zip plugins inherit the old shape | Phase E ships after §5.3 |

## 8. Order of work

Each phase ships on its own and leaves the tree green.

- **P0. Fix what is wrong today.** The five bundles that omit a palette they import
  (`bundleMissingPalettes` in `layer-census-results.jsonl`), the deprecated VS Code key and the
  bundle README's stale claim. Separately, find out why Mermaid draws blank in the headless
  harness, so the harness can be trusted for the census in §7. Logged as
  follow-ups by this note's PR.
- **P1. The bridge and its presets.** Name the Marp exporter a bridge, add the environment table
  and the preset dialog over today's per-plugin behavior (§3.5). Starts with the frozen-Mermaid
  spike (§4.3). No CSS compilation.
- **P2 + P3 together. Two hosts and the simpler contract.** The `draw(figures)` contract (§5.1)
  and host-owned drawing ahead of layout replace the per-plugin bake and `hydrate-script.js`;
  the manifest and `ctx` changes (§5.3) land with them, Mermaid first. Before phase E.
- **P4. `@layer`, only if D2 passes.** Fix the elements layering changes, activate in one pass,
  and add the flattening step to the Marp bridge in the same PR, through `sanitizeStyleText` and
  registered with the #22 re-wrap gate.

P0 and P1 depend on nothing else. P2+P3 do not depend on P1, except that `render.surfaces` stays
until P1's presets replace it (§5.3), because the fidelity ledger reads it. P4 depends on D2 and on the open
items in §4.4.

## 9. Owner decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | Adopt the bridge model: the Marp export is a transpiler with environment presets | **yes**. Worth having without `@layer` |
| D2 | Activate `@layer` behind a flattening bridge | **not yet**. It needs three things first: (a) the cross-file share of the specificity tax, measured, so the benefit is a number; (b) an answer for author CSS that keeps it winning where it wins today, at export and after it (§4.4); (c) the examples-wide count of elements layering changes, with the runtime loaded (at least 119 on the gallery alone) |
| D3 | VS Code presets for drawn plugins | **Two presets.** *VS Code, scripts allowed* (the owner's workflow, at *Disable*): **live**, which works today in the owner's VS Code. *VS Code, default*: **as is** for now, then **frozen** (a sidecar image with its source in an inert JSON block) once P1's spike shows the labels survive and nothing lands in the speaker notes |
| D4 | Simplify the plugin contract (§5) before phase E's zip format ships | **yes**, with the host's export mode (§5.2) defined first. Changing the schema costs far more once user plugins exist |
| D5 | Merge the code-plugin branch with `codeRenderer: true` now, or adopt §5.3 first | **merge first**. It is one more flag of an existing kind, and P2+P3 migrate it with the rest |
| D6 | Third-party bridges (a package kind), or first-party only | **first-party** until a second bridge exists |

**The smallest alternative**, for comparison: do P0, and hard-wire a frozen default for VS Code
inside `marp-bundle.js`. It fixes what hurts today (raw diagram source in the VS Code preview)
with no new model and no contract change. It leaves the plugin noise, the four-way choice
hard-coded per plugin, and the `@layer` question exactly where they are.

## 10. Non-goals

- **Import fidelity.** Best effort, later (§4.5).
- **Running Lattice plugin code inside Marp's engine.** Live means our runtime in the target's
  page, never Lattice plugins as markdown-it plugins in someone else's parser.
- **A second bridge now.** Slidev and Quarto (`2026-06-14-competitive-analysis.md` §5) inform the
  shape; Marp is the only one built.
- **Changing how authors write decks.**

## 11. Adversarial review (HARD RULE #25)

The first draft went to the adversarial trio and a fact-checker on 2026-10-15. What changed:

- **Inversion lens.** The draft never said what `@layer` buys, and `cascade.md` already found
  it retires about zero `!important`. Fixed by §3.6 (measured tax, unmeasured cross-file share)
  and by splitting D1 (the bridge) from D2 (activation), with D2 now "not yet". Also adopted:
  presets as the product (§4.3), source-hash drift detection, a token-registry check to replace
  the equality check §5.3 deletes, a pinned flattener with a census test, P3 no earlier than P2,
  and the smallest alternative in §9.
- **Checker.** Math is frozen for security, not quality (fixed in §3.5 and §4.3, with stock
  barred from untrusted-content sinks). Three "remove" fields have live consumers (§5.3 now names
  each and its replacement). Some "derive" facts need the module to be read (§5.3 splits them).
  Phase dependencies were wrong (§8 rewritten). The draft claimed R-PATH resolved from one deck
  (now the census over every example, and conditional on D2). The exported player runs plugin
  code (§2 now calls it a browser host). Mermaid's draw-ahead needs per-figure context and a
  per-figure result (§5.1). Anima has no static form (§4.3, §5.1). An HTML comment cannot carry
  Mermaid source (§4.3).
- **Fact-checker.** 41 claims confirmed. Fixed: the math reason; the README line (667); that
  `gotchas/vscode.md` had already settled the VS Code question (§3.2 now says it reproduces
  it); the spike's layer order differed from the repo's (the gallery rerun in the repo's order
  gave the same numbers; the examples-wide run used the spike's order); the manifest "after" figure depended on an unstated method (now a committed script).
- **Red team.** The flattening held under every attack: the real allowlist, the runtime loaded
  (0 of 5,699), a dark palette, print media, and micro-tests on `!important`, `@keyframes`,
  nested layers, `:where()` and `:has()`. What broke was around it, each demonstrated: the inline
  frozen SVG fails the bundle's allowlist, and a comment cannot carry Mermaid source (§4.3, D3
  now "as is" until a spike); the author's own CSS loses at export, not only after it (§4.4);
  layering changes 119 gallery elements with the runtime, not 20 (§3.1); the size cost is +5%
  gzipped on what ships, not +62% (§3.1). Also fixed: module-read manifest facts stay declared
  (§5.3); a trust policy by channel and a named export mode (§5.2); export sign-off for P1, P2+P3
  and P4 (§7); the flattener is a #22 re-wrap sink (§4.4); VS Code's raw-HTML behavior by
  workspace trust (§4.2); the reference's `!important` gap (§3.1). I re-ran the red team's
  runtime-loaded comparison myself and got the same 0 and 119.
- **Second round (a fresh checker on the revised note).** The census results, the manifest count
  and every cited line reproduced. Fixed: P2+P3 keep `render.surfaces` until P1 lands (§8); in
  marp-cli an author's comments still become speaker notes (§4.2); which results are committed and
  which were scratch runs (§3); the examples-wide census ran in the spike's layer order (§3.1);
  "every example deck" overstated the census (now 275 of 276 plus the gallery); five bundles, not
  one, omit an imported palette (§8); the specificity comment count is 167, not 211 (§3.6); and
  three smaller citations.

## References

- `engineering/cascade.md`; `2026-06-18-layer-activation-scope.md` (R-PATH)
- `2026-09-27-plugin-system.md`; `2026-09-13-plugin-architecture.md`
- `2026-06-13-export-to-marp.md`; `lib/core/marp-bundle.js`; `lib/core/marp-bundle-html.js`;
  `lib/core/marp-fidelity.js`
- `engineering/gotchas/vscode.md`
- `2026-06-14-competitive-analysis.md` §5; `2026-06-14-presentation-import.md`
