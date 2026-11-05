---
status: shipped
summary: >
  One spine, two independent consumers. The spine is the shared readers (scanHtml, cssRefSpans, the
  Markdown reading) plus ONE policy table: which addresses are another site, which attributes fetch on
  render or on a click, which tags and attributes are script, which styles end early. The linter reads
  the SOURCE through the spine and warns; the renderer reads its OUTPUT through the spine and blocks.
  Neither calls the other or reads the other's results; they agree because they ask the same questions
  of the same facts. A build:check census rule keeps private readers and private copies of the table
  out. D1 to D5 answered by the owner 2026-11-03: lint reads source, warnings only, the sanitizer's
  lists join the table, the census rule goes in, and the table and Markdown rules ship first with room
  to raise the lint-core budget for the HTML and CSS rules.
---

# One security spine: the linter warns, the renderer blocks, and neither depends on the other

**Answer.** Security has two jobs done by two independent consumers:

- **The renderer blocks.** It reads its own output and removes what is unsafe: the scanner refuses web
  addresses, the sanitizer strips script, the browser's policy stops anything left. It must work with
  no linter in sight, because a deck can arrive from anywhere.
- **The linter warns.** It reads the source the author wrote and tells them what is unsafe and how to
  fix it. It must work with no render, because a linter works on sources.

Neither calls the other, and neither reads the other's results. They agree because both ask the same
questions of the same facts: **the spine**. The spine is the shared readers plus one policy table.
Today those facts are scattered: the scanner keeps its attribute lists inside `remote-ref.js`, the
sanitizer keeps its strip list inside `sanitize-slide-html.mjs`, and the linter has neither. So the
work is to put the facts in one place, have the renderer read them from there, and give the linter
rules that read them too.

## Why this note exists

The owner asked, after Segno R4 (#3018): "what should the linter be doing to make sure things are
flagged as insecure, and more broadly, a shared spine that all use to ensure security is built in?"

Two earlier drafts of this note got the shape wrong, and the corrections are the design:

1. The first had `lint:deck` render the deck and lint the output. The owner: "linting works on
   sources." A linter that needs a render is coupled to the renderer.
2. The second kept lint on source but had the renderer REPORT what it removed, for the Studio to show.
   That still couples them: a surface reading the renderer's removals depends on the renderer telling
   it. The owner: "linter warns, renderer blocks"; if they depend on each other, there is a problem.
   They should arrive at the same fact through the same spine and act on it independently.

## What exists today (read from the tree, 2026-11-03)

| Fact | Where it lives | Who reads it |
|---|---|---|
| Is this address another site? | `lib/core/media-sources.js` `isRemoteRef` | the scanner (as `isRemoteUrl`) |
| Which attributes fetch on render | `RENDER_FETCH_ATTRS` in `lib/core/remote-ref.js:804` | the scanner only |
| Which attributes fetch on a click | `CLICK_FETCH_ATTRS` in `remote-ref.js:812` | the scanner only |
| Which attributes name an address at all | `FETCH_ATTRS` in `remote-ref.js:90` (exported) | the scanner, the gallery gate, the code door (`lib/core/door-attr.mjs:14`) |
| Which tags and attributes are stripped | `FORBID_TAGS`, `FORBID_ATTR` in `lib/core/sanitize-slide-html.mjs:40-41` | the sanitizer only |
| Which style text is script or ends early | `STYLE_SCRIPT_RE` in `sanitize-slide-html.mjs:105`; `sanitizeStyleText` | the sanitizers only |

The readers are already shared: `scanHtml` and `cssRefSpans` (Segno R2, R3, R4). The Markdown side is
not: lint-core reads Markdown images with regexes of its own (`BG_LINE_RE` at `lint-core.js:986`, and
others), which the deck pipeline's P3 and P4 replace with the shared document model
(`2026-10-22-segno-deck-pipeline.md`).

The linter (`lib/authoring/lint-core.js`) has no security rule. The nearest are `unknown-plugin`,
`plugin-fence-attributes`, `shell-fence-is-script` and `author-script-defers`.

## The design

### 1. The spine: readers plus one policy table

A small, require-free kernel, `lib/core/content-policy.js`, holds every fact both consumers need:

- the attribute sets: render-time fetch, click-time fetch, any address;
- the tags and attributes the sanitizer strips, and which attributes are event handlers (`on…`);
- the style tests: script in a style, a `</style>` that ends the element early;
- the address question, by re-exporting `isRemoteRef` and the allowed-origin rule (the site's own
  origin, plus the deck's `webOrigins`).

Each fact is DATA plus a pure predicate, with no reading of markup in it. The readers stay where they
are (`scanHtml`, `cssRefSpans`, the Markdown reading). The kernel requires nothing, so the docs dev
server and the plugin code door can load it (the rule `css-ref-reader.js` follows).

### 2. The renderer blocks, reading the spine

`remote-ref.js` and the sanitizers import their lists from `content-policy.js` and keep their own
logic. Behavior does not change: on the corpus, every rendered and exported document is byte-identical
before and after. The renderer gains nothing and loses nothing, except that its facts now live where
the linter can read them too.

The renderer keeps its own visible marks, which are part of its output and need no linter: the web-
image placeholder, and the code door's note in the slide (`data-package-error`).

### 3. The linter warns, reading the spine

`lint:deck` gets rules that read the SOURCE through the shared readers and ask the spine:

| The author wrote | Read with | The spine's question | The warning |
|---|---|---|---|
| `![](https://…)`, `![bg](https://…)`, a reference definition | lint-core's Markdown reading today; the deck model once P4 ships | is this address another site? | "loads from another site: the preview shows a placeholder and the export leaves it out" |
| Raw HTML `<img src>`, `srcset`, `<video poster>`, SVG `<image href>` | `scanHtml` | a render-time fetch attribute, to another site? | the same |
| `ping=`, `<form action>`, `formaction=` | `scanHtml` | a click-time fetch attribute? | "sends a request when clicked; the preview removes it" |
| `<script>`, `<iframe>`, an `on…=` handler, a `javascript:` link | `scanHtml` | a stripped tag, a handler, a script scheme? | "the preview strips this; it never runs" |
| A `style` or `<style>` with a web address, script, or `</style>` | `cssRefSpans` and the style tests | an address to another site, or a style that is script or ends early? | the web-address warning, or "ends the style early; the preview neutralizes it" |
| Markup `scanHtml` reports as `unsure` | `scanHtml` | (the reader's own fact) | "a browser may build this differently from the preview" |

Each rule lives in `lint-core.js` (HARD RULE #7), is a warning (D2), and gives a fix. The Studio shows
these warnings where it already shows lint: the Coach and the editor marks. The export dialog can run
the same lint on the source before it exports. Neither surface reads anything from the renderer.

**What the linter cannot see, and why that is acceptable.** Markup the ENGINE writes, such as a chart's
SVG or a plugin's drawing, is not in the source. The renderer still blocks anything unsafe in it,
because blocking never depended on the linter. Where a source construct produces it, the linter can
warn on the construct (a plugin that is not approved, `unknown-plugin`). What the linter cannot see, it
does not claim to.

### 4. A census gate, so the spine stays the only source of facts (D4)

A `build:check` rule fails on two things outside the sanctioned readers and the kernel:

- a private reader: a regex over `src=`, `href=`, `url(` or `background` applied to markup or a style;
- a private copy of a policy list: a literal set of fetch attributes, stripped tags or handlers.

Its allowlist fails on a stale entry, like HARD RULE #22's. Day one it lists one entry, with its
reason: lint-core's Markdown image regexes (until the deck pipeline's P4). `lib/export/html-player.js`,
the R4 migration this note first listed, moved onto `cssRefSpans` in #3024. The readers R4's census never
counted (`player-prune.js` `namesRemoteResource`, `css-scan.js`, `door-attr.mjs`, `slide-camera.mjs`,
`svg-intake.ts`) are what this rule will find first: `followups.d/3024-p2-segno-census-readers-outside-the-list.md`
records each, with which one decides a refusal. It changes what an existing gate finds and adds
no CI job or step.

## Cost, measured

Gzip sizes of each piece bundled alone (esbuild, minified, level 9; 2026-11-03):

| Piece | Gzip | In the engine bundle already? |
|---|---|---|
| `media-sources.js` (`isRemoteRef`) | 1.2 KB | **Yes** (`lattice-playground.js` carries it), so it is free for lint-core |
| `content-policy.js` (the table) | not built yet; lists of names, expected well under 1 KB | n/a |
| `scanHtml` (`html-ref-reader.js` + `html-ref.generated.js`) | 1.9 KB + 3.1 KB | No |
| `cssRefSpans` (`css-ref-reader.js` + `css-ref.generated.js`) | 1.4 KB + 2.5 KB | No |

`lintCoreGz` counts lint-core and its imports beyond the engine's own closure. It measured 123.5 KB
against its 124.3 KB ceiling (127,248 bytes in `docs/route-budget.json`) in #3018's `docs-build` run
41681169802 (job 126075346272, on `9567c54`), so 0.8 KB is left. The two readers come to about 8.9 KB bundled
alone, which does not fit (D5). S2 measures the real figure in the Studio build.

## Phasing

Each phase ships alone and reverts alone.

| Phase | What | Evidence it owes |
|---|---|---|
| **S0** | `content-policy.js`; `remote-ref.js` and the sanitizers import their lists from it | Every rendered and exported document byte-identical on the corpus; the scanner's fuzz in three engines unchanged |
| **S1** | Lint's Markdown-address rules (no new reader; `isRemoteRef` is free) | Each rule fires on a picked case; every hit on the 349 decks under `examples/` reviewed; lint time and `lintCoreGz` measured |
| **S2** | Lint's HTML and CSS rules, over `scanHtml` and `cssRefSpans` | The same, plus a differential: on seeded markup, the linter warns on exactly what the renderer blocks, judged by running both independently |
| **S3** | The census rule in `build:check` | Its failing arm: a planted regex reader, and a planted copy of a list, each fail the build |

S2's differential is the spine's acceptance test. It does not make the linter depend on the renderer.
It checks, offline, that the two consumers reach the same verdict from the same facts.

## S0, as built (2026-11-04)

`lib/core/content-policy.js` holds the attribute sets (`FETCH_ATTRS`, `RENDER_FETCH_ATTRS`, `HREF_FETCH_TAGS`,
`CLICK_FETCH_ATTRS`), the strip lists (`FORBID_TAGS`, `FORBID_ATTR`), `isEventHandlerAttr`, `STYLE_SCRIPT_RE`, and
the `</style` test (`styleEndAt`, `endsStyleEarly`). `remote-ref.js` requires it; `sanitize-slide-html.mjs` and
`sanitize-style-text.mjs` default-import it and re-export the names their importers already used, so no caller
changed. A test pins that each consumer holds the table's own objects, not a copy.

Two things differ from §1, and both are forced:

- **The address question is not re-exported.** The table requires nothing, because three loaders take it by
  inlining its body: the docs dev server (`vite-cjs-lib-dev.mjs`, which inlines only require-free siblings), the
  code door's sanitizer page and the function-plot capture page. Re-exporting `isRemoteRef` would make it require
  `media-sources.js` and break all three. The address facts stay where they already were the one table:
  `media-sources.js`: `isRemoteRef`, and `webOrigin`, which is the renderer's actual web-image test (moved there in
  S1, below).
- **Two pages evaluate the sanitizer's TEXT.** The code door's page (`code-door-worker.js`) and the capture page
  (`locked-figures.js`) used to need `sanitize-slide-html.mjs` to import nothing. It now imports the table, and
  `lib/core/policy-page-script.js` swaps that one line for the table's body, refusing loudly if the line changes.

Evidence: `npm run identity:check -- --strict` against `origin/main`, 443 decks paired, 0 differ, lint identical,
39 stylesheets identical. Five decks exported as `.html` and `--player` before and after (the web-image demo, a
Mermaid deck, the plugin sandbox tour through the code door, the export-fidelity deck, the baseline gallery):
byte-identical except one Mermaid Gantt's "today" line, which moves with the clock (identical once that line is
masked). The scanner's fuzz in Chromium, WebKit and Firefox (2,000 inputs each, `reading` composition and `--wide`):
0 leaks in each, recorded in the PR. **What S0 does not do:** lint does not read the table yet (S1 needs only the
address facts), so the table stops drift on its lists, not on which source construct fetches. That is S2's
differential's job. A test pins that remote-ref.js's `FETCH_ATTRS` and the slide sanitizer's three exports are the
table's own objects; the scanner's other sets are not exported, so S3's census rule is what catches a copy of them. The Studio on the dev server loads
`content-policy.js` over `/@fs` and renders with no console error.

## S1, as built (2026-11-04)

`web-image` (lint-core rule 12d, a warning) fires on a Markdown image, an `![bg]` background, an image written through a
reference definition, and an image in the chrome: a front-matter `header:`/`footer:` (reported once, at its line) or a
slide's `<!-- header: … -->` comment. It reads the source with the engine's own Markdown parser (`boundaryParser`), so a
link, a code span, a fenced example and a speaker note are not images, and a reference resolves across slides as the
render resolves it. Chrome is read the engine's way too: `readDirectiveComment`, values parsed inline with no
references, and a directive comment inside a paragraph ignored, because the engine's directive pass never sees one.

Its address question is the renderer's, not `isRemoteRef`: `blockWebImages` refuses an address whose `webOrigin` the
reader has not allowed, and `isRemoteRef` also says yes to `file:` and `blob:`, which the renderer does not block. So
`webOrigin` moved, unchanged, from remote-ref.js into `media-sources.js`, and remote-ref.js re-exports it. Requiring
remote-ref.js from lint-core instead would have added both scanners to lint: +16.5 KB gzip, measured.

Evidence: on the 445 decks `examples/`, the galleries and the baseline decks hold, lint and the renderer, each run
alone, agree on 444. The one difference is two Mermaid diagram addresses (`plugin-sandbox-tour.md`), which the renderer
blocks and no S1 rule covers: S2's. `lint:deck --all` finds three hits in 491 files, all deliberate web images (the
`web-images` demo's two, and `styles-device-check.md`'s "A blocked web image" slide); both decks are on
`tools/lint-subject-decks.js` for `web-image`, because the web image is what they show. A warning still fails
`lint:deck --strict`, the repo's own deck gate, so every future demo of a web image needs that entry.

Review (red team, inversion, checker, 2026-11-04) found and this PR fixed: a crash on CR-only line endings, a miss in
table cells (a cell's inline token has no line map), a front-matter finding numbered slide 1 instead of 0 (the editor
put its mark on the wrong line), a warning on every `![bg]` of a slide where the engine draws only the last, and a
line fallback that could land on a code span. **Not covered, and S2's:** a `backgroundImage:` front-matter key or
directive, `@video{… poster=…}`, raw `<img src>`, a Mermaid label (the renderer blocks each); a duplicated
front-matter `header:` (the engine reads the last, lint the first); an address at the site's own origin, which the
Studio loads and lint still warns on. A unit test pins the agreement on a seeded
deck with the chrome cases. `lintCoreGz` +776 B (126,438 to 127,214 against a 127,248 ceiling, the gate's own hash
fixing), declared in `docs/route-budget.d/security-spine-web-image.md`; that leaves S2 34 B, so S2 needs the ceiling
raise D5 allows. `lint:deck --all` takes 7.8 s over 491 files with the rule.

## S2, as built (2026-11-04)

Lint reads raw HTML and CSS from the SOURCE with the renderer's own readers and asks the renderer's own table.
`findWebMarkup` (lint-core rules 12e to 12h) takes every `html_block` and `html_inline` token the engine's Markdown
parser makes, every Mermaid fence, the front matter's `style:` and `backgroundImage:`, and each `backgroundImage`
directive comment, and reads them with `scanHtml` and `cssRefSpans`. The rules:

| Rule | Fires on | The table's fact |
|---|---|---|
| `web-image` (S1's, more sources) | `<img src>`, `srcset`, `<video poster>`, SVG `<image href>`, `<link href>`, a refresh `<meta>`, an SMIL `href`, `<base href>`, a `style`/`<style>`/paint `url()` or `@import`, `backgroundImage`, the front matter's `style:`, a Mermaid address | `WEB_MEDIA`, `MEDIA_FETCH_ATTRS`, `RENDER_FETCH_ATTRS`, `HREF_FETCH_TAGS`, `URL_PAINT_ATTRS`, `SMIL`; `webOrigin` |
| `web-request` | `ping`, `action`, `formaction`, `attributionsrc` to another site | `CLICK_FETCH_ATTRS` |
| `stripped-markup` | `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<base>`, `on…=`, `javascript:`, `srcdoc`, a `style` holding script | `ACTIVE_STRIPPED_TAGS`, `isEventHandlerAttr`, `isScriptUrl`, `FORBID_ATTR`, `STYLE_SCRIPT_RE` |
| `style-ends-early` | `</style` in the front matter's `style:` | `endsStyleEarly` |
| `markup-unsure` | an `unsure` span from `scanHtml` | the reader's own fact |
| `video-web-poster` (the video plugin's) | a `poster=` from another site on a drawn `@video{…}` | `webOrigin`, through a new `ctx.webOrigin` |

Each finding carries the exact `address` (or, for `stripped-markup`, the `construct`), so the differential compares
addresses, not sites.

**What moved, all unchanged.** The readers went from remote-ref.js to `lib/core/web-ref-readers.js` (`cssRefSpans`,
`remoteCssRefs`, `scanHtml`, `rawTextEnd`, the entity decoder, `mermaidRemoteRefs`, `refreshTarget`); remote-ref.js
re-exports every name. The element and attribute sets the scanner kept privately (`WEB_MEDIA`, `MEDIA_FETCH_ATTRS`,
`URL_PAINT_ATTRS`, `SMIL`) and the vendored-script list went into `content-policy.js`, so the linter reads the same
objects. `npm run identity:check -- --strict` against `origin/main`: 443 decks paired, 0 differ, lint identical, 39
stylesheets identical.

**Three choices.** (1) `<style>`, `<link>` and `<meta>` are stripped by the sanitizer too, but `stripped-markup` does
not name them: an author writes a `<style>` block as deck CSS, which the CLI export keeps, and a `<link>` or a refresh
`<meta>` is a fetch, which `web-image` names. (2) A `<script src>` naming one of Lattice's vendored builds, with no
inline body, is not reported: it is the documented way to draw diagrams in a Marp preview outside Lattice, and the
preview draws them itself. (3) A Mermaid address is worded as "names an address on another site", not "loads": the
renderer reads a diagram's whole text and counts every address in it, a `click` link included.

**The acceptance test.** `test/unit/authoring/security-spine-differential.test.js` seeds one deck with every family and
the near misses (a link, a code span, a fenced example, a comment, an attribute selector, `sample:` and `data:`), then
runs each consumer alone: the engine renders it, `blockWebImages` (with `fonts`, so every refusal is counted) lists the
blocked addresses, and the slide sanitizer (DOMPurify on jsdom) strips what runs. Lint's addresses equal the
renderer's, 21 of them, and lint's stripped constructs equal the sanitizer's removals per construct. Its failing arm:
with lint's refresh-`<meta>` branch disabled, the test fails, naming `https://refresh.example/`. The repeated
front-matter `header:` is read the last, by both.

**After the inversion review (2026-11-04).** Two gaps it found are fixed and seeded in the differential: a `<style>`
inside `<svg>` (every design tool's logo export) raised a false `markup-unsure` and hid its web addresses, which the
renderer reads through its no-parser branch; lint now reads that text the renderer's way, and stays silent on a clean
one. And every directive the engine writes into a slide's `style` as a custom property (`color`, `backgroundColor`,
`backgroundPosition` …, read from `lib/core/meta-keys.js`), in a comment or the front matter, is read as CSS, not only
`backgroundImage`. Not fixed: an `<iframe src>` to another site raises both `stripped-markup` and `web-image`, both true.

**After the checker and the red team (2026-11-04).** Lint read the front matter its own way (top-level keys, the last
wins), and two consumers read it differently: the engine's `parseFrontMatter` trims each line, so an indented key is a
directive, and the CLI export's `readGlobalStyle` pastes the FIRST `style:`, at any indentation, quoted or a `|` block.
Lint now asks each: directives through `parseFrontMatter`, and `style:` through `readGlobalStyle`, which moved from
lib/export/export-scaffold.js into lib/core/front-matter-style.js so both read it. A `style:` address gets its own message:
the export pastes it and the page's content policy refuses the load. The differential seeds both, and a `srcset` whose
web candidate is second.

**What lint still cannot see.** An address at the site's own origin, which the Studio allows (`withOwnOrigin`): lint
reports it, the safe direction, and says so in `spec/diagnostics.md`. Markup the ENGINE writes (§3).

On the corpus: `lint:deck --all --strict` is clean over 491 files. The new rules fire on two decks, both reviewed: six
vendored `<script>` tags in three galleries (choice 2), and two Mermaid `click` links in `plugin-sandbox-tour.md`, the
two addresses S1 found the renderer blocking and no rule covered; that deck is on `tools/lint-subject-decks.js` for
`web-image`, because its "clickable task" slides show exactly that. Cost: `findWebMarkup` takes 107 ms over the 458
decks lint reads (a full lint of them takes 2.9 s); `lintCoreGz` 127,214 to 140,683 B (+13,469), and the ceiling moves
by that amount (`docs/route-budget.history.md`, D5).

## P2, the declaration channel, as built (2026-11-04)

`cssRefSpans` gains an opt-in `decls` fact (css-ref-reader.js): each span says which declaration or descriptor it sits in
(`decl`: a custom property as written, any other name lowercased, '' in a selector or an at-rule prelude) and whether it
is inside a function (`inFunction`). The reader reads it from the stretches its tape skips (names, `:`, `;`, comments),
with `;` and `:` inert inside a `(` or `[` block, and the first name of a declaration naming it. The two refusal readers
#3024 left out move onto it:

- **css-scan.js `findAddressStrings`** (the theme, layout and package gates): url targets, `image-set()` strings and an
  address-shaped string in a custom property or `@property` `initial-value`, now read from the spans.
- **door-attr.mjs `cssRefTargets`** (the code door): every url target, every string inside a function, and an
  address-shaped string in a custom property or `initial-value`.

Their shared "is this string a network address?" test (`ADDRESS_START`, copied in both) moved into `content-policy.js`
as `isAddressString`. `lib/core/web-ref-readers.js` became a factory that requires nothing (the parsers handed in, as
css-ref-reader.js does): S2's version required its parsers, which broke the two loaders that inline remote-ref.js's
require-free siblings, the docs dev server and the code door's sanitizer page (found in this change, before merge).

**A door bypass the red team found, and fixed.** `attrRefTargets` read a value with `cssRefTargets` only when it held a
literal `(` or `--`. CSS reads `\2d\2d q`, `-\-q` and `\2d-q` as the custom property `--q`, so a package's
`\2d\2d q:"https://…"` passed the door, and Chromium, WebKit and Firefox fetched it through a child's
`image-set(var(--q) 1x)`. Old and new door alike; the renderer's scanner still blocked a web address there by default, so
this was a bypass of the door layer. The door now reads any value holding a backslash too (test/unit/cli/code-door.test.js).

**A gate bypass, found and fixed.** The oracle below found a sheet both the old walk and the rebuilt reader let through, in
all three engines: an address-shaped string inside `image()` in an `@font-face` `src`. `findAddressStrings` now also
reports an address-shaped string inside any function (kind `function`). The address shape is the test, so
`format("woff2")` and `type("image/png")` stay text; no shipped stylesheet (193) has a hit.

**Evidence.** `test/unit/core/css-decl-readers-differential.test.js` holds both against the walks they replaced (frozen
in `tools/segno-legacy/`) as decisions, over the 193 shipped stylesheets and two fuzz seeds: every refusal stands except
one inside a `[…]` block, which CSS reads whole (26 such inputs on seed 7), and no shipped sheet changes its verdict. Its
failing arm: with the channel's `decl` assignment disabled, four of its six tests fail. The browser oracle,
`tools/fuzz-css-decl-readers.mjs`, loads each CSS input of the web-reference fuzz as written (with consumers that read
`--q` and `--a` through `image-set(var(…))`), and, for the door, each declaration cut from them as a `style` attribute,
rechecked alone. "The whole gate" is `findCssExfil`: the address reader with its keyword rules (`@import`,
`expression()`, a script scheme).

| Seed | Engine | Sheets that fetched | Let through by the whole gate, old / new | Declarations that fetched | Let through by the door, old / new |
|---|---|---|---|---|---|
| 7 | Chromium 141 | 138 of 1,482 | 0 / 0 | 253 of 2,845 | 0 / 0 |
| 7 | WebKit 26 | 147 | 0 / 0 | 283 | 0 / 0 |
| 7 | Firefox 142 | 136 | 0 / 0 | 248 | 0 / 0 |
| 11 | Chromium 141 | 131 of 1,530 | 0 / 0 | 265 of 3,062 | 0 / 0 |
| 11 | WebKit 26 | 150 | 0 / 0 | 308 | 0 / 0 |
| 11 | Firefox 142 | 130 | 0 / 0 | 260 | 0 / 0 |

These are the second run. The first put `--q` and `--a` in one consumer declaration, which is invalid at computed-value time
when either is undefined, so an input defining only one fetched nothing (the red team): it saw 108 sheets and 194
declarations on Chromium seed 7, about a quarter fewer. The fuzz holds no escaped custom-property name, which is how the
door bypass above went unseen; test/unit/cli/code-door.test.js pins that case.

The fuzz spells each address around the beacon's port, so a run's inputs differ with the port. The first run, before
the `image()` fix, held the `image()` sheet (seed 7, f7-2503): it fetched in all three engines and passed both the old
gate and the rebuilt one. The unit test pins that case. Read alone, the address reader lets through one sheet the old walk
refused, in every engine: an `@import "…"`, which the keyword rule refuses; the old walk named it only by misreading
where a string holding a raw newline ends. **What P2 does not do:** `slide-camera.mjs` `CSS_URL` /
`REL_URL` (what a picture export inlines) stays as it was; moving it changes export bytes and waits on the owner's sign-off
(followups.d/3024).

## S3, the census, as built (2026-11-04)

`checkSecuritySpineCensus` in `tools/check-ownership.js` (run by `build:check`; no CI job or step added) counts four
shapes in every shipped source file under `lib/` and `docs/src/` (tests, generated and vendored files aside), outside the
spine's own files (`content-policy.js`, `media-sources.js`, `web-ref-readers.js`, `css-ref-reader.js`,
`html-ref-reader.js`, `css-image-set-block.js`):

| Shape | What it catches |
|---|---|
| `url-reader` | a regex that reads `url(` |
| `attr-reader` | a regex that reads an address attribute (`src=`, `href=`, `srcset=`, `poster=`, `background=`) |
| `style-closer` | a bare `</style` search, the table's `endsStyleEarly` written again |
| `list-copy` | a literal list of three or more names, most of them from one table list (fetch attributes, stripped tags, media elements, paint attributes) |

Each count is held exactly to `SANCTIONED_SPINE_READERS` (file, shape, count, why): a new hit fails, and so does a stale
entry. **Day one holds 56 entries, not the one §4 expected**: the census found every regex reader in the tree, not only
the ones R4's hand-kept list named. Each says why it is not the spine's, in one of four kinds: it reads text the engine
itself wrote in a fixed shape (18), it refuses on any `url(` and so fails closed (9), it reads Lattice's own font,
`data:` or runtime references (13), or one of 13 others: the renderer's own element sets, one lint rule's script test,
and the readers that decide something on an author's text, each naming its follow-up (one is lint's own prefilter): `slide-camera.mjs` (followups.d/3024, waits on export sign-off), the Studio export's
`deck-export.js`, `pane-css.js`'s raw-text closers, and the hints in `web-image-hint.ts` and `inline-url-media.mjs`
(followups.d/3022). lint-core's Markdown image regexes, the one entry §4 named, are gone: S1 reads Markdown with the
engine's parser.

The checker and the red team found spellings the first cut missed (`URL\(` with `i`, `url[(]`, `url\x28`, `\ssrc=`,
`src="(.*?)"`, `src=(\S+)`, a `'</style'` string); each now counts, which added two readers of the engine's own `<img src>`
(bg-image.js, collage-stamp.js). A test pins that `run()`, the body of `build:check`'s ownership step, calls the census.
**Its failing arms** (`test/unit/tools/security-spine-census.test.js`): a regex reader and a copy of the fetch attributes
planted in a scratch tree each fail it; one more reader in a sanctioned file fails it; a stale entry fails it. A template
literal that WRITES `url(${u})` or `<img src="${u}">`, a comment, and a whole `<style>…</style>` matcher do not count.
The census takes 0.34 s per run.

**Known limits.** A regex built from pieces at run time, a list split across helpers, built by `split()` or keyed by tag
(`{ img: ['src'] }`), `.astro` files, and a reader written as a character scan are not seen; and a count cannot tell one
reader swapped for another in a file already sanctioned at that count. The census catches the shapes the tree has used.

## The picture camera, as built (2026-11-05)

`lib/core/slide-camera.mjs` (the one camera behind the PNG, JPEG and PDF photo layer, in the CLI and the Studio) reads
CSS with `cssRefSpans` now. Its three regex readers are gone: `REL_URL` (which relative `url()` it makes absolute),
`CSS_URL` (which pictures it fetches and inlines) and `layerUrl`'s pattern (which background a computed style draws).
The census holds 55 entries; the camera keeps one, the `list-copy` false match. `cssUrlSpans` keeps only what the
browser fetches: a `url` span outside an attribute selector that is a valid url token.

- **The fix.** `u\72l(` is a `url(` to the browser and to the camera now, so the picture draws instead of coming out
  blank. An address spelled with an escape (`url(https\3a //…)`) is fetched, and `urlSwap` writes the data over its span,
  since its literal text is not in the CSS. A `url(` inside a comment or a string is no longer fetched or rewritten.
- **What it reads.** The camera notes addresses from the sheet, the clone's inline styles and its `<style>` elements:
  the places the swap writes. The old reader matched the whole serialized slide too, so a picture address written as
  text on a slide was fetched and never used.
- **Bytes.** Picture export is byte-identical on the demo decks: `bg-on-any-slide.md` and `adaptive-image.md`, each
  in `color-mode: dark` and `light`, 32 of 32 PNGs identical before and after. Over the 193 shipped stylesheets the
  camera notes the same addresses, and the absolutized sheet differs only inside comments in 5 of them, where the old
  regex rewrote a `url(…)` written as prose (`test/unit/core/slide-camera-css-differential.test.js`, against the regexes
  frozen in `tools/segno-legacy/slide-camera-css.mjs`).
- **The browser oracle.** `test/integration/export/slide-camera.test.js` draws an escaped `u\72l(` background and an
  escaped address in Chromium. The old camera fails each assertion on its own; the new one passes both.
- **What the checker found, and fixed before merge.** (1) The Studio's picture-encode worker imports only `encodeCanvas`,
  yet a camera that loads the parser put it in the worker's bundle: 52 KB (10.3 KB gzip) where it was 14.8 KB. The PNG
  and JPEG writers moved to `lib/core/canvas-encode.mjs`, which the camera re-exports, and the worker is 14.7 KB (5.1 KB gzip) again. The worker and the encoder pool import it
  directly. The PDF composer still imports `encodeCanvas` through the camera, which keeps the camera a core file with a
  core consumer (`tools/structure.js` `CORE_SINGLE_CONSUMER_CEILING`); its worker bundle is the same 1,546,417 bytes
  either way, because its other imports already carry the parser. (2) The parser reads the 2.9 MB
  built sheet in about 49 ms where the regex took 2 ms, and the camera reads the page sheet once per slide, so
  `cssUrlSpans` keeps the spans of its last four texts over 4 KB: a later slide's read of the same sheet costs about 5 ms
  (Node, `dist/lattice.css`). (3) With an escaped address, the span pass runs before the literal pass, so an escaped
  `…a.png?v\3d 1` gets its own picture and not `…a.png`'s spliced inside it.

- **A Safari defect the raise loop found.** The camera keeps only valid url tokens (`isValidUrlToken`, css-ref-reader.js),
  and that test was a regex over each character of the token. JavaScriptCore gives up and answers false on an unquoted
  token of about half a megabyte (500,000 characters failed, 100,000 passed) and a quoted one of about a megabyte, so in WebKit the camera read a phone photo written inline as a `data:` URL as a bad url and did not draw
  it at its size: `export-photo-size.spec.ts` failed in webkit-tablet with a PowerPoint picture of 260,794 bytes against
  its 168,000 budget (it passes on main, where the camera's own regex never asked). `isValidUrlToken` is now a scan with
  the regex's answers (`test/unit/core/css-url-token-scan.test.js` holds the two to the same answer on hand cases and
  20,000 fuzzed tokens) that reads a 4 MB token in WebKit. The narrator (`prose-projection.mjs`) asks the same test, so in
  Safari it now takes a video's poster from such a background instead of reading the declaration as dropped. The player
  export (`inline-url-media.mjs`) asks it too, but leaves a `data:` URL as it is, so nothing it writes changes. The spec passes in webkit-tablet and gecko.

## The Studio export, as built (2026-11-05)

`docs/src/components/studio/export/deck-export.js` reads each `url()` in a slide's computed style with `cssRefSpans`
(`computedUrlSpans`), in the two places it had its own regex: `valueWithoutWebUrls`, which swaps a web picture outside
the deck's allow-list for the hatch before the capture, and `backgroundImageUrls`, which names the backgrounds to probe
for a missing picture. The media elements and the attributes on them that the sweep reads now come from the policy
table (`content-policy.js` `WEB_MEDIA` and `MEDIA_FETCH_ATTRS`), not a per-tag list of its own. The census holds 54
entries.

- **The fix.** A `content` value that only spells `url(https://…)` inside a string keeps its text; the old regex
  matched it and set `content: none`. An escaped address in a computed value is decoded as the browser decodes it.
- **Bytes.** The Studio's PDF export of a four-slide deck (a full-bleed picture, a picture beside the text, and a web
  picture the deck has not allowed) is identical before and after, in `color-mode: dark` and `light`, except the
  export's own `/ModDate`. Every page rasterizes to the same pixels. That deck's `::after` with a `url(` in its
  `content` string draws in neither export (the scoped `<style>` does not reach the capture), so the `content` fix
  is held by the unit test (`deck-export.test.ts`, with the old regex as the failing arm), not by the render.
- **The attribute table.** `web-sweep.test.ts` pins each element and attribute the sweep reads, so a change to
  `WEB_MEDIA` or `MEDIA_FETCH_ATTRS` shows up as a changed verdict there. The sweep reads a few attributes the old list
  did not (`video srcset`, `img poster`); none fetches, and the restore puts each back.
- **Review.** The red team ran every computed-value shape it could build (`image-set()`, `cursor` lists, `content`,
  `filter`, `shape-outside`, hostile addresses) through Chromium, WebKit and Firefox and found no web picture the old
  sweep replaced that the new one lets through. It found a pre-existing leak off this change, logged as
  `followups.d/3022-p2-export-probe-fetches-web-backgrounds.md`.
- **Sign-off.** Moving this reader changes export bytes only for the spellings above, so the dark and light renders go
  to the owner with the merge ask (CLAUDE.md, Quality Bar). The camera's move (above) does the same.

## Decisions for the owner

All answered by the owner on 2026-11-03.

- **D1. Where lint reads. Answered: the source.** "Linting works on sources."
- **D2. Severity. Answered: a warning, never a block.** The renderer blocks; the linter explains.
- **D4. The census rule. Answered: yes.** Under this model it also catches a private copy of a policy
  list, not only a private reader.

- **D3. The sanitizer's lists move into the shared table. Answered: yes.** Asked first as "should the
  sanitizers report what they remove?", and re-asked when the model changed: the renderer reports to no
  one, so the question became whether the stripped tags, stripped attributes, event handlers and style
  tests move into `content-policy.js`, so the linter can warn on them. They do.
- **D5. Order and bytes. Answered: the table and the Markdown rules first, and the budget may rise.**
  S0 (the table) and S1 (Markdown-address warnings, no new bytes) ship first. S2 (the HTML and CSS rules)
  follows, and the owner is comfortable raising the `lintCoreGz` ceiling to make room. S2 measures the
  real cost in the Studio build and raises the ceiling by that measured amount, declared in
  `docs/route-budget.d/`. Loading the readers lazily stays off the table: it would break lint-core's
  "synchronous, shared by CLI, `validate()` and browser" contract (HARD RULE #7).

## Not decided here

- The exact wording of each warning and fix. That is S1's and S2's, against real decks.
- The CLI export's reader, which is the 2909-p4 follow-up.
