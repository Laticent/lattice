---
status: proposed
summary: >
  An audit of #2997's plugin-contract work against the decisions in 2026-11-01-plugin-contract-hollywood.md.
  The host channels (state facade, walls, the locked bake page, services, data, front matter) match the note.
  The `ctx.vocabulary` channel does not: it hands plugins engine FUNCTIONS (the diagram theme, slide lookups,
  record compilers, the video matcher, check drawing), which is the core handing out utilities through a
  different door, against owner decision 1 ("pure helpers become owned dependencies, not ctx members"). Eight
  of those deviations already have an answer in the note and get realigned; the owner settled the other three:
  escape helpers go to `@laticent/markup`, the engine keeps drawing check marks, and charts are designed as one
  plugin before #2997 lands.
---

# Plugin contract: an alignment audit of what shipped on #2997 (2026-11-01)

**Answer.** The core should not hand plugins code. Owner decision 1 already says so ("pure helpers become owned
dependencies, not `ctx` members"), and the note's own sorting rule (§2, "The rule that sorts a member") gives
every member one home:

1. The **logic** is the host's (the deck, the surface, the install, other plugins, trust): `ctx`, as a
   capability or as data the host computed.
2. A **value** a host tool needs without running the plugin: the manifest.
3. Otherwise it is **pure**: it stays in the plugin, unless an engine caller does the engine's own work with
   it; then it goes in a `@laticent/*` package named for its job.

`ctx` may carry **data** and **host capabilities**. It may not carry an engine helper for the plugin to run.
On #2997 the host channels follow that; `ctx.vocabulary` does not. This note lists every member, says which
rule it falls under, and what changes.

## 1. What matches the decisions

| Shipped | Decision it follows |
|---|---|
| The state facade: a syntax rule never sees `state.md` or `env`, and pushes only declared token types | §4, "never a live host object" |
| Frozen token views for renderers; the code renderer gets `info.record` | §4 |
| The KaTeX wall's `finish` fails closed; the host owns the wall | §2 `sanitize` row (the file sits in `lib/plugins/host-katex-wall.js`, host code, rather than `lib/core/`, to stay under the structure gate's single-consumer ceiling) |
| `draw.output` picks the sanitizer; no plugin names its own profile | §2 `sanitize` row |
| The host launches and confines the bake's page (`host-page-worker.js`, `ctx.runPage`); Mermaid only draws in it | §2 `sandbox` row |
| `ctx.service`, bounded by `requires`/`optional`, built with the owner's ctx | §2 `services` row |
| `ctx.data()` / `ctx.dataPending()`, loaders in the host | §2 `plugin-data` row |
| `ctx.deck.frontMatter(key)` | §2 `code-text` row |
| `ctx.fonts.faces`; the page's placeholder picture served by the host | §2 `fonts`, `media` rows |
| `spansFromHighlightHtml` in the code plugin; `languages.needed`/`missing` in the engine | §2 `highlight` row |
| `splitCodeLines` in `@laticent/markup`; the index list in `@laticent/segno` | §2 `code-text` row, §5 |
| The slot compiler in `@laticent/segno` | §2 `slots` row |
| The spark spec in the sparks plugin | rule 3 |
| The Mermaid fence matcher in Mermaid, served to the gallery gate, which fails closed | §2a |
| Inline kinds and services are ctx factories, with no static fallback | §4 |

## 2. What does not, and the fix the note already gives

Each row is a function the engine hands a plugin through `ctx` today.

| Member (where it is built) | What it is | Rule | The note's answer | Change |
|---|---|---|---|---|
| `vocabulary.diagram.buildDiagramTheme` (bake, pass) | Mermaid's theme assembly over the palette | 3: Mermaid's own logic; a palette as input does not make it the host's | §2 `diagram-theme`: moves into Mermaid; Mermaid reads tokens through `readToken`/`token` | Move `mermaid-theme-map.js` into the plugin; `tools/audit-diagram-contrast.mjs` and `check-ownership` read it from the plugin's folder as a build tool does |
| `vocabulary.diagram.resolveDiagramLook`, `resolveDiagramHandType`, `textValueTokens` | The deck's diagram look from its front matter and class | 1: depends on the deck. The engine resolves it too (`runtime`, `lint-core`, the markdown-it kernel) | (the note assumed no engine user; there are three) | The host resolves the look and passes the **value**: `ctx.deck.diagramLook` (render, pass) and per figure in `slideAt` (bake) |
| `vocabulary.deck.slideClassSpans`, `slideClassAt`, `slideIndexAt`, `resolveDiagramBand` (bake) | Slide position lookups over the source | 1: depends on the deck | §2 `deck-walk`, §4 `bake`: `ctx.slideAt(offset)` → `{ index, class, band, look }` | Replace the four functions with the one getter |
| `vocabulary.slots.coreSlot`, `CORE` (base) | The engine's record shapes, compiled by the plugin | 1: the pill shape is the engine's catalog (a legend plate and a chart point read it) | §2 `slots`, §4 `inline`: the kind declares its slot, the host compiles it and passes parsed `fields`; a kind that post-processes keeps `resolve(fields, raw, ctx)`; "drops: the plugin compiling its own slot" | The host compiles every declared slot and passes `fields`. Pills keeps its icon-only re-read and checks its quoted label as `resolve` hooks. `compileSlot` stays in Segno for the host, not for plugins |
| The code record, parsed in the plugin (`record.js` compiles its slot and reads `focus=`/`mark=`) | Same as above | 1 | §2 `code-text`: the host parses the `@code{…}` record and the `code:` default and passes resolved options | The code fence gets `options.record` resolved by the host. The linter and the Compose panel read the same declared slot through the host |
| `vocabulary.video.detectProvider` (base) | The provider matcher over an engine table | 2 + 1: the table is the plugin's data; matching is a host security check | §2 `video`, §2a: the table is declared manifest data (`providers`); the host owns one matcher over it | Move the table into the manifest; the host matcher reads it; the plugin receives the matched `provider` in `fields` |
| `exportCtxFor` → `vocabulary.video.fenceStep` (Marp export) | The old `video` fence's rewrite | 3: video's syntax | §2 `video-migrate`, §2a: moves into the plugin; the fix driver calls a declared `fixes` hook | Move `video-migrate.js` into the plugin; add the `fixes` hook; delete `host-export.js` |
| `vocabulary.checks` (base): the whole module, data **and** `stateHtml`, `stateElement`, `parseInlineState` | Status data plus drawing | Data: 1. Drawing: see §3, Q2 | §2 `checks`: "reaches the checks plugin as frozen data … Drawing a state stays the plugin's" | Pass only the data (`CHECKS`, `STATUSES`, `MARKERS`, classes). Drawing: Q2 |

**The spec lags the contract.** `spec/LPM.md` §5 documents the role-module ctx as `api: 1`, and the note (§4,
"Versions") makes the changed role-module contract `api: 2`, with `KNOWN_API` accepting both. The branch changed the
contract (the state facade, ctx factories, frozen token views, no `ctx.escape`) without the bump:
`lib/plugins/resolve.js` still knows only `[1]`, every in-tree manifest says `api: 1`, and LPM still describes the old
ctx. The fix is the note's: in-tree manifests move to `api: 2`, `KNOWN_API` becomes `[1, 2]` (the zip and door contract
stays `api: 1`), and LPM gains an `api: 2` section.

`lib/core/segno-spec.js`, a one-line re-export of `@laticent/segno/read`, goes too: its callers require the
package.

## 3. Where the decisions disagree with themselves, or with the code

- **Q1. The render ctx's `escape`, `escapeAttr` (and `encodeConfig`).** §4 keeps them ("keeps from today") while
  decision 1 bars pure helpers from `ctx`. `escape`/`escapeAttr` are pure, and the engine escapes too, so rule 3
  sends them to a package: `@laticent/markup` (HTML string work). `encodeConfig` is the host's marker format,
  paired with `hydrateAttrs`, so it is a host capability and stays.
- **Q2. Check drawing.** The note gives drawing to the plugin, but the engine draws the same marks
  (`lib/transformers/prose-projection.mjs` calls `stateHtml`), and status marks must keep working with the plugin
  off. By rule 3 the drawing is a pure helper with an engine caller, so it belongs in a package, or the engine
  owns it and the plugin asks the host to draw (`ctx` capability). A package for one renderer is thin; the
  capability keeps one drawing.
- **Q3. Charts.** Chart-family imports 28 chart component transforms, which is the plugin-reaches-into-the-engine
  case in its purest form. §7 Q2 is still open, and the owner has since asked whether charts should be one
  component that behaves like Mermaid (one plugin, many kinds).

### Owner decisions (2026-11-01)

- **Q1:** `escape` and `escapeAttr` move to `@laticent/markup`; plugins and the engine import them. `encodeConfig`
  stays in `ctx` (the host's marker format).
- **Q2:** the engine keeps the drawing of a check mark. The checks plugin gets the status data and a host
  capability to draw a state, not the drawing functions.
- **Q3:** design charts as one plugin with many kinds first, and hold #2997 until it is built: chart-family is not
  moved into the engine as an interim step.

## 4. Why it drifted

Each deviation was taken to keep a byte-identical render while moving fast, and each was written down as a
"deviation" instead of being sorted by the note's rule. Passing the engine's function through `ctx` made the
import gate pass, because the gate counts imports, not what `ctx` carries. Three changes stop a repeat:

- The structure gate learns what a `ctx` member is: a function the host did not bind to a plugin, deck or
  surface fails, the way an import does.
- Every new `ctx` member is sorted by the three-question rule in its PR, with the answer in the note.
- The design note is updated in the same PR as the code (task 8), not at the end.

## References

- `engineering/decisions/2026-11-01-plugin-contract-hollywood.md` §2, §2a, §4, owner decisions 1–4.
- `lib/core/plugin-ctx.js` `vocabularyOf`, `lib/plugins/host.js` `ctxFor`, `lib/plugins/host-bake.js`
  `hostBakeExtras`, `lib/runtime/index.js` `PASS_VOCABULARY`, `lib/plugins/host-export.js`.
