---
status: proposed
summary: >
  The 16 contribution points plugins use fall into six standard patterns: grammar, data provider, service, check,
  slot and figure. One rule splits the figure pattern in two: a library that needs a layout engine to measure text
  draws a DEFERRED figure (a placeholder now, an SVG string later, from a locked page); every other library draws an
  IMMEDIATE figure inside the render. Mermaid is the one plugin whose export breaks the pattern: it finds its fences
  with its own readers of the source before the engine parses. The proposal moves Mermaid's export onto the host path function-plot
  already uses (read placeholders from the rendered page, draw in the locked page), makes that path manifest-driven,
  moves the preview's flicker protection from Mermaid into the shared host, and retires `bake`.
---

# Standard plugin patterns, and a deferred figure the host finds for the plugin (2026-11-06)

**Answer.** Every plugin contribution is one of six patterns, and each pattern has one shape: what the plugin is
handed, what it returns, when it runs and where. The owner asked two questions that this note settles for figures:
**what does a drawing plugin return, and is drawing synchronous?**

- **What it returns:** markup as a string. An immediate figure returns HTML or SVG from the render. A deferred figure
  returns `{ svg, alt }` or `{ error }` from `draw`. Both drawing paths already return a string today (§2).
- **Synchronous or not:** reading the deck is always synchronous. Drawing is synchronous unless the library needs a
  layout engine to measure text, because then it must run in a locked page, and reaching another page is a message
  and a wait. That is the cost of the wall, not of the library (§3).
- **Who finds the figures:** the engine, always. A plugin is handed its fence's content; it never scans Markdown.
  Mermaid's export is the one place that breaks this today, and §4 fixes it.

This builds on the Hollywood contract (`2026-11-01-plugin-contract-hollywood.md`): the host calls, the plugin is
handed a frozen `ctx`, and walls and sanitizers are the host's, chosen from what the plugin declares it outputs.
Nothing here changes that contract. It names the patterns the contract already serves and closes one hole in it.

## 1. The six patterns

Mapped from every `lib/plugins/*/*.manifest.json` against the host code that calls each point (schema:
`lib/plugins/plugin.schema.json`, 17 points; 16 have a user, `returns` has none).

| Pattern | Contribution points | The plugin is handed | It returns | Runs | Users today |
|---|---|---|---|---|---|
| **Grammar**: teach the parser a syntax and render it | `syntax`, `fences`, `codeRenderer`, `inline`, `highlight` | the token's content and attributes (a `state` facade for `syntax`) | an HTML string; on a throw the host degrades to `degradesTo` (`lib/plugins/host.js:91-102`) | engine render, synchronous | math, code, anima, function-plot, mermaid, avatars, checks, icons, pills, sparks, video |
| **Data provider**: tables the host reads, no plugin code at render | `data`, `providers`, `registers`, `meta` | nothing; the host reads the table | data | build time, or a lazy read on first use (`lib/core/plugin-data.js:27-51`) | avatars, icons, video, callout, sparks, meta |
| **Service**: a function another plugin calls | `services` | the owning plugin's `ctx`, bound by the host | a value, or null when the plugin is off | when called, synchronous | avatars, checks, icons, mermaid, pills |
| **Check**: findings about a deck | `lint`, `diagnostics` | the deck (lint) or the render (diagnostics) | findings; an undeclared diagnostic id throws (`host.js:110-119`), an undeclared lint export is never installed (`tools/build-plugin-registry.js:129`) | lint, or render; synchronous and pure | video, function-plot, meta |
| **Slot**: fill a slot a component declares | `extensionPoints` | the section's HTML and a frozen `ctx` | `html \| {html, cls} \| null` | engine section transform, synchronous | chart-family |
| **Figure**: draw a picture from an author's text | `fences` (the placeholder), `hydrate`, `draw`, `bake`, `render.surfaces` | the figure's source and its slide context | immediate: HTML/SVG from the render; deferred: §3 | §3 | math, chart-family (immediate); function-plot, mermaid (deferred) |

`styles` is not a pattern of its own: it is the token-only CSS every pattern may ship (12 plugins), merged at build
time (`build-css.js`).

**"Data provider" is the existing name** for the second row: the schema already calls `meta` one. The four points
share one property that matters for security and speed: no plugin code runs during a render. `data` is bulk read-only
data a kernel reads through `ctx.data()` (Node reads it synchronously; a browser fetches it as a script only for a deck
that uses the plugin). `providers` is a trust table (video hosts and id patterns) that only the host's matcher reads.
Neither fetches during a render; the one asynchronous provider path is a TikTok short link resolved in the browser on
tap (`docs/src/playground/video-overlay.js:92`).

## 2. What a figure plugin returns today

| Plugin | Library needs a layout engine? | Preview | CLI export (PDF, PNG, PPTX, player) |
|---|---|---|---|
| chart-family (28 kinds) | no, our own code | drawn **inside the render**: `transformSection(html, ctx)` splices an inline SVG (`lib/plugins/chart-family/chart-family.dispatch.js`). The kernels a deck uses load first (`docs/src/lib/ensure-charts.ts`) | the same kernels, the same render |
| math (KaTeX) | no, it only computes | inside the render | KaTeX in QuickJS compiled to WebAssembly, in the CLI's own process (`lib/plugins/host-katex-wall.js`); the call returns before the next line runs |
| function-plot | **yes** | the engine emits a placeholder; `hydrate` draws it in the page or the sandboxed draw frame | **the host reads the placeholders from the rendered capture page** and runs the same `hydrate` in a locked page (`lib/export/locked-figures.js`), sanitizing each drawing with the slide sanitizer |
| mermaid | **yes** | the engine emits the source as a code block; the runtime's pass draws it in the sandboxed draw frame and gets an **SVG string** back, sanitized with the diagram profile (`lib/core/sanitize-diagram-svg.mjs`) | **`bake` finds fences itself**: a line walker over raw Markdown (`lib/plugins/mermaid/shared/mermaid-fences.js`) plus a markdown-it pass for fences in a quote or list (`nested-fences.js`); it draws each in a locked page, and pastes the **SVG string** into the source before the engine runs (`lib/plugins/mermaid/mermaid.bake.js`) |

So both deferred plugins already return a string, and three of the four export paths already let the engine find the
figure. Mermaid's export is the exception, for history rather than need: the bake predates the plugin contract (it was
`lattice.js`'s `preprocessMermaid`, moved unchanged in phase D of `2026-09-27-plugin-system.md`).

## 3. Immediate and deferred figures

**The rule:** a figure is **deferred** when its library needs a layout engine to measure text, and **immediate**
otherwise.

Every library that draws from an author's text runs behind a wall (`2026-10-19-first-party-plugins-in-the-sandbox.md`).
There are two kinds of wall, and the kind decides the timing:

| Wall | Has a layout engine? | Reaching it | Holds |
|---|---|---|---|
| none (our own code), or QuickJS in WebAssembly in the same process | no | a function call: the answer is back before the next line | chart-family, math |
| a locked page (export) or the sandboxed draw frame (preview): a separate browser context on an opaque origin, no network | yes | a message, then a wait | mermaid, function-plot |

So "deferred" is not a property of the plugin's taste; it is forced by the wall. An immediate figure never flickers:
the first frame the browser paints already holds it. A deferred figure needs the protections in §5.

**The deferred-figure contract** (the proposal):

1. **Render, synchronous.** The engine parses the deck once. For each fence or inline kind the plugin declares, it calls
   the plugin's renderer, which returns a **placeholder**: an element carrying a stable id, the source and the slide
   scope (palette, orientation, size). The plugin never scans Markdown; the engine found the figure.
2. **Draw, asynchronous.** The host collects the placeholders from what the engine produced and calls
   `draw(job) → Promise<{ svg, alt } | { error }>` in the wall the manifest's `draw` block names. `job` is the
   placeholder's source plus the serializable slide context (the Hollywood `draw-*` projection). `svg` is a string,
   because a string crosses every wall (frame, locked page, worker, Node) and can be cached by source and scope. `alt`
   is the text the narrator and screen readers read.
3. **Write, by the host.** The host sanitizes `svg` with the profile the manifest's `output` names (`svg-diagram` →
   `sanitizeDiagramSvg`, anything else → `sanitizeSlideHtml`, as `docs/src/lib/preview-draw-host-impl.ts:96-100`
   does), and writes it into the placeholder. On `{ error }` it shows `degradesTo`.
4. **Who waits.** The preview shows the placeholder and swaps the drawing in (§5). The export waits for every drawing
   before it writes the file, so an exported slide is never half-drawn.

## 4. The change: Mermaid's export finds its fences through the engine

**Today:** find fences in the source with the plugin's own readers → draw → paste SVG into the text → the engine reads the result.
**Proposed:** the engine renders → the host reads Mermaid's placeholders from the capture page → draws each in the
locked page → sanitizes → writes. This is `locked-figures.js`'s flow, which function-plot already uses.

Steps:

1. **Make `locked-figures.js` manifest-driven.** Today it names function-plot (`NAME = 'function-plot'`, `:42`). It
   becomes the host's deferred-figure driver for every plugin whose manifest declares a `draw` block and
   `surfaces.pdf: "figure"`. (function-plot's manifest says `player: "figure-baked"` although this module serves
   `--player` too, `locked-figures.js:2-3`; slice 2 corrects the manifest so the driver can key on it.) reading the placeholder selector, the library and the output kind from the manifest.
2. **Move Mermaid onto it.** Mermaid's `surfaces.pdf` and `surfaces.player` change from `figure-baked` to `figure`.
   The per-slide band and palette come from the placeholder's section (the rendered page already knows the slide),
   which removes `ctx.slideAt(offset)` and `paneOrientations` from the bake's needs. The image-set export's re-bake
   hook (`ctx.state.rebake`) becomes a re-draw of one placeholder in another band.
3. **Delete the raw scanner from the draw path.** `mermaid.bake.js` and the `bake` call in `lib/plugins/host-bake.js`
   go. `bake` then has no user and is retired from the schema, unless the owner wants it kept for a future plugin
   (question 2).
4. **Move the other readers of `mermaid-fences.js` onto model ranges.** Five read Mermaid fences from source today:
   the narrator (`lib/core/chart-narration.js`), `slide-speech.js`, `web-ref-readers.js`, Mermaid's exported
   `fences(markdown)` service (`lib/plugins/mermaid/mermaid.services.js:12`, whose callers move with it) and the
   host's "uses mermaid" check (`lib/plugins/host-grammar.mjs:213`, which only decides whether the plugin loads). Each moves to the deck model's
   fence ranges (`docs/src/lib/segno-markdown`), so narration, speech and the security scan agree with the drawing.
   The URL scan (`mermaidRemoteRefs`) keeps over-reporting by design: it may read every fence-shaped block, because a
   false alarm is the safe direction (§7).

**What moves in exported bytes.** Only shapes where the scanner and the engine disagree today:

- a fence inside an HTML block (`<div>` … `~~~mermaid` … `</div>`): the engine reads HTML, so no diagram; today's
  line walker matches it (checked: `matchMermaidFences` returns the fence, markdown-it with `html: true` returns the
  block as HTML), so the export draws one. After: no diagram, matching the preview. Fences in a blockquote or a list
  are already drawn by the export since 2026-10-18 (`nested-fences.js`, `followups.d/2739-p7`), so they should not
  move.
- anything else the corpus differential finds.

Every shipped deck is measured before and after: `npm run identity:check -- --strict` for the engine's HTML, and
`npm run regress` (pixel diff of each deck's exported PDF) run on `main` and on the branch in the same sandbox, so
golden drift that exists on both cancels out. The owner signs off on a demo deck rendered in dark and light (Quality
Bar: export bytes).

## 5. Flicker belongs to the host

The preview protects a Mermaid diagram from flicker in three ways, all inside `lib/plugins/mermaid/mermaid.hydrate.js`:

1. a cache of finished drawings keyed by source and slide scope (`mermaidSvgCache`, `:1055`), replayed in the same
   microtask as the swap that brought the slide in, before the browser paints (`settleFenceFromCache`, `:624`);
2. the outgoing drawing held on screen while the new source draws ("hold the ink", `:672-710`);
3. CSS that hides a fence still waiting to be drawn (`mermaid.styles.css`).

Before them, an author saw 10 painted frames of source per keystroke (`2026-09-05-diagram-fence-flash.md` §3). The
shared host (`lib/plugins/host-browser.mjs`) has none of the three: it has the settle state machine, the budget timer
and `releaseFigure`. So function-plot, the other deferred plugin, does not get them.

**Proposal:** the three protections move into the host, keyed by the same `(scope, source)` pair, and apply to every
deferred figure. A future deferred plugin then cannot ship without them, and Mermaid's hydrate loses about 150 lines.
Whether function-plot flickers on a keystroke today is **UNVERIFIED**; the first slice measures it on the real
Playground before and after.

## 6. Order of work

One PR per slice, each measured and independently revertible:

1. **Host flicker protections** (§5), with function-plot as the second user. Preview only; no export bytes move.
2. **A manifest-driven deferred-figure driver** (§4 step 1), function-plot only. Byte-identical exports, proved by the
   corpus differential.
3. **Mermaid onto the driver** (§4 steps 2–3). Export bytes move on the shapes in §4; owner sign-off with dark and
   light renders before merge.
4. **The other `mermaid-fences.js` readers onto model ranges** (§4 step 4), then delete `mermaid-fences.js` and
   `nested-fences.js`.

## 7. Questions for the owner

1. **The six pattern names** (grammar, data provider, service, check, slot, figure; figures split into immediate and
   deferred). Adopt them as the vocabulary for plugin docs and the scaffold (`lib/packages/new-plugin.js`)?
2. **Retire `bake`** once Mermaid leaves it, or keep it in the schema with no user? Recommendation: retire it. A
   contribution point that rewrites the deck's source before the parse is the hole this note closes, and a future
   plugin that wants it should argue for it in review.
3. **The flicker protections in the host** (§5), so every deferred figure gets them. Recommendation: yes, as slice 1.
4. **`returns`** has no user (it was added for npm plugins, `2026-10-16-npm-plugin-threat-model.md` decisions 10–12, §6 and §6.1). Out of
   scope here; noted so the catalog is complete.

## 8. Not verified

- Whether function-plot flickers in the preview today (§5).
- The full list of decks whose export bytes move in slice 3; the corpus differential produces it.
- Whether `lib/export/marp-bundle.js` and `marp-fidelity.js` scan source for fences: a grep matched them, unread.
- The ~150-line estimate for Mermaid's hydrate shrinking is a reading of `mermaid.hydrate.js`, not a measured diff.
