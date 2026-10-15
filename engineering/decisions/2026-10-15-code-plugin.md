---
status: in-progress
summary: >
  Highlighting moves out of the engine core into a `code` plugin that owns every fence no other
  plugin claims, loads highlight.js core plus only the languages a deck uses, maps highlight.js
  classes to role tokens in one place, and gives every fence the branded panel. Formatting is a
  separate `code-format` plugin: a per-language adapter registry that runs as a bake before the
  render, only when a block asks for it. Per-fence config is a segno record, `@code{…}`, in an
  inline code span directly above the fence. The audit found ten defects in today's wiring,
  including unreadable code on plain slides and an off-by-one in line focus; the plan fixes all
  of them in the same line of work.
---

# A code plugin, and a code-format plugin beside it (2026-10-15)

Status: in progress. The owner's decisions are in §9; progress is in §11. Parents: `2026-09-27-plugin-system.md` (the plugin
contract), `2026-10-14-plugin-inline-door.md` (the `@kind{…}` inline form this note's config uses),
`2026-09-28-segno-unified-inline-notation.md` (the record grammar), `2026-07-19-preview-bundle-hljs-common.md`
(the Studio's 36-language bundle this note replaces).

## 1. The answer

- **One plugin, `code`, renders every fenced block that no other plugin claims.** It is the fallback
  renderer, not a claimant of fence names: ```` ```mermaid ```` and ```` ```anima ```` stay with their
  owners and never reach it. It owns highlight.js, the line model (numbers, focus, marks, diff), the
  block chrome (title, panel) and the mapping from highlight.js classes to role tokens. The engine
  stops importing highlight.js.
- **It costs nothing when a deck has no code.** On Node it loads `highlight.js/lib/core` plus only the
  languages the deck's fences name (about 8 ms, against 105 ms for the full build today). In the Studio
  the 36-language bundle (53 KB gz) leaves the startup bundle and arrives as a payload only when a fence
  is present. Exported decks highlight at render time, so they carry no highlighter at all, as today.
- **Formatting is a second plugin, `code-format`.** It is a registry of per-language adapters
  (Prettier for web languages, ruff for Python, and so on, §6) that runs as a *bake*, the async text
  pass the plugin host already runs before the synchronous render. It runs only for a block that asks
  (`@code{format}`) or a deck that turns it on, and it fetches only that language's adapter. A formatter
  error never fails the render: the author's source renders as written and `lint:deck` warns.
- **Config sits in an inline code span directly above the fence**, as a segno record:

  ````md
  `@code{title=load.ts, numbers, focus=3-5, format}`
  ```ts
  export async function load(id: string) { … }
  ```
  ````

  The fence keeps the language. A deck sets defaults once in front matter (`code: numbers, format`).
- **Themes stop knowing highlight.js exists.** The twelve `--hljs-*` tokens become role tokens
  (`--syntax-keyword`, `--syntax-string`, …). Every committed theme declares them; `derive.js` computes
  them for a theme the Studio derives from a palette. The map from highlight.js classes to roles lives in
  one stylesheet inside the plugin (`code.styles.css`). (Correction after review: a few other places
  still name highlight.js classes — the Mermaid plugin's source styles, the Studio's Compose preview,
  the shell grammar — so a different highlighter would touch those too.)

## 2. What exists today, and what was measured

Four read-only agents mapped the current wiring; the numbers below were re-measured here.

**Highlighting is engine core, not a plugin.**

- `lib/engine/index.js:39` runs `require('highlight.js')` at module load: the full build, 192 languages.
  Measured on this machine, three runs: 102-118 ms for the full build, 7-9 ms for `lib/core` plus
  TypeScript. The engine as a whole loads in 308-371 ms, so the full build is about a third of it, paid
  by every process including decks with no code.
- `lib/engine/index.js:320-347` is markdown-it's `highlight` callback. It highlights any fence whose tag
  highlight.js knows, on every slide. **A plain content slide is highlighted.** What it lacks is a panel
  (§3, defect 1).
- The Studio swaps in highlight.js's 36-language `common` build with an esbuild resolve hook
  (`tools/build-playground.js:85-91`) and fetches the other 157 grammars one per language
  (`docs/src/lib/ensure-hljs-language.ts`). The common build is about 161 KB minified, 53 KB gz, inside
  a 497 KB gz bundle.
- No highlight.js runs in any exported deck's browser code. Export-to-Marp ships the fence source and
  lets the recipient's marp-core highlight it, without Lattice's shell grammar
  (`lib/core/marp-fidelity.js:194-204`).

**The code components add no highlighting.** `code` is CSS and a manifest. `compare-code` splits columns on
`<p><code>` labels with regexes (`compare-code.transform.js:29-71`). Focus and build stepping wrap lines in
`<span class="ln">` through `splitCodeLines` (`lib/core/collections.js:241`). There are no line numbers,
no file title, and no diff marks beyond highlight.js's `diff` grammar.

**Other plugins stay out by refusal, not precedence.** The plugin host takes over markdown-it's `fence`
renderer once (`lib/plugins/host.js:117-176`): a claimed fence goes to its plugin, everything else goes to
the code renderer. A plugin may not claim a fence name highlight.js owns (`lib/plugins/resolve.js:330-345`,
`new-plugin.js:36`, `code-door-fence.mjs:118`). That refusal is what keeps ```` ```ts ```` safe, and this
note keeps it.

**Tokens.** Fourteen tokens color code: `--code-bg`, `--code-text` and twelve `--hljs-*`. Every one of the
18 base themes hand-sets all twelve; the `-dark` variants inherit them. Two gates police them:
`checkHljsContrast` (4.5:1 against `--code-bg`) and `checkHljsSeparation` (distinguishable under simulated
color blindness). `derive.js:688-707` already computes ten of the twelve from the palette for Studio themes;
`--hljs-params` and `--hljs-tag` are not derived. No theme CSS uses an `.hljs-*` selector; the coupling is in
the token *names*, which name a library rather than a role (HARD RULE #11).

**Formatting does not exist.** No formatter is in `package.json` or `docs/package.json`, and no render path
formats code.

## 3. Defects found (each one ships fixed in this line of work)

| # | Defect | Evidence | Fix |
|---|---|---|---|
| 1 | **Code on a plain slide is unreadable.** Colors tuned for the dark panel render on the light slide with no panel: pale yellow (`load`, `get`, `Promise`) on white. | Rendered `indaco`, slide 1 vs slide 2 of the probe deck (`plain.001.png`, `plain.002.png`) | Every fence gets the panel (§5); the contrast gate measures against the surface the code actually sits on |
| 2 | **`_focus: line N` and `_build` lines are off by one** after any multi-line token: a two-line comment counts as one line. `_focus: line 3` lit source line 4. | Engine render, this session | The plugin's line model splits highlight.js's output at every newline and re-opens the spans that cross it |
| 3 | A trailing empty `<span class="ln">` on every focused block | Same render | Same line model; the final newline is not a line |
| 4 | Mermaid source is tokenized, then `mermaid.hydrate.js:585` reads `textContent`, and Mermaid's own CSS flattens the token colors on a diagram slide | `host.js:141-145`, `mermaid.styles.css` | **Kept, deliberately.** The colors show when the Mermaid plugin is off, where the source is what the reader sees; tokenizing costs well under a millisecond. Re-stated in slice 4 after a first reading wrongly said the colors always showed. |
| 5 | The full 192-language build loads in every process, ~105 ms | Measured above | Core + per-deck languages (§4) |
| 6 | `section code.hljs` never matches; the engine emits no `hljs` class | `highlight-js.css:16`, `highlight-js.docs.md:33-35` | Deleted; the plugin's stylesheet targets what it emits |
| 7 | `registerShellHljs` ships dead in `lattice-runtime-min.js` | Runtime bundle | Moves into the plugin, off the runtime's graph |
| 8 | Two copies of the shell-fence detector: `shellFenceFindings` has no production caller; `lint-core.js:6175` re-implements it | `fence-languages.js:190` | One kernel, called by lint |
| 9 | Export-to-Marp loses the shell grammar, so a command list renders with no color there | `marp-fidelity.js:194-204` | The Marp bundle carries the plugin's grammar registration (§7, open item) |
| 10 | Stale docs: `design/theming.md:213-221` maps five classes to the wrong tokens; `highlight-js.css:1-11` names a deleted file; `focus.js:14-16` cites retired HARD RULE #12; `compare-code.styles.css:51-53` contradicts its own font size; `derive.js` omits two tokens; `plugin.schema.json:383` names a hydrate value the enum rejects | Agent reports, file:line above | Rewritten with the change that makes them true |

## 4. The model

### 4.1 Two plugins, one seam each

```
markdown  ──▶  bakes (async)  ──▶  markdown-it render (sync)  ──▶  HTML transformers  ──▶  DOM passes
                  │                       │
          code-format: format         fence table
          blocks that ask,            ├─ claimed name (mermaid, anima, math…) → that plugin
          per-language adapter        └─ anything else → code plugin's renderer
                                                         highlight → line model → chrome
```

- **`code`** fills a new manifest role, `contributes.codeRenderer`. Exactly one plugin may fill it; a
  second is a build error naming both, as two fence claims are today. The fence table sends every
  unclaimed fence to it. If the plugin is turned off, fences render as escaped `<pre><code>` on the
  panel, unhighlighted: the deck still reads.
- **`code-format`** — *superseded by decision 5 (§9).* As first built it was a plugin with a bake that
  rewrote fence bodies before every render. It is now an authoring tool (`lib/authoring/code-format/`):
  `lattice fmt` and the Studio's Format command rewrite the source once, and the render never formats.
  It never filled an extension point; the earlier text here said it would.

Why two plugins and not one: they fail differently (a formatter throws on invalid code; a highlighter
never does), they cost differently (171 KB gz for Prettier's TypeScript, against 2 KB for a highlight.js
grammar), and they run in different stages (async bake versus sync render). Fusing them would make every
highlighted deck pay for the formatter's loading machinery.

### 4.2 Composition with other plugins

- A plugin that claims a fence name owns that fence completely. The code plugin never sees it, so it
  cannot clobber a drawn diagram with styled text. This is today's guarantee, kept.
- A fence declared `as: "code"` (mermaid) is drawn by its plugin from the source, and the code plugin
  highlights it like any other fence: the colored source is what a reader sees until the figure draws,
  and whenever it cannot.
- The refusal stays: no plugin may claim a highlight.js language name. Without it, a third-party zip
  plugin could take ```` ```ts ```` from every deck that lists it.
- Code-door (zip) fences keep today's path: the code plugin returns a plain `<pre><code>` for them
  (`lib/engine/index.js:332-345` moves into the plugin unchanged).

### 4.3 Loading

| Surface | Today | Proposed |
|---|---|---|
| Node (CLI, PDF, PPTX, HTML export) | full build at engine load, ~105 ms | `lib/core` + the deck's languages, loaded when the first fence renders (~8 ms for one language) |
| Studio | 36-language build in the startup bundle (53 KB gz) + per-language fetch | core + per-language fetch through the existing `ensure-hljs-language` chokepoint, above the sync render, the way KaTeX loads |
| Exported HTML / player | highlighted at render; no highlighter shipped | unchanged |
| Export-to-Marp | recipient's marp-core highlights | unchanged, plus the shell grammar (defect 9) |

Every fetch failure today renders the fence plain with no message. The Studio will show the fence plain
*and* raise the same lint warning the CLI raises for an unknown language.

### 4.4 The line model

highlight.js returns one HTML string. The plugin splits it into lines, closing every open `<span>` at
each newline and re-opening it on the next line, so line N is source line N whatever the tokens span
(defect 2). Everything line-shaped reads that model: numbers, focus, marks, diff, `_build` stepping. The
regex surgery in `focus.js:170-178` goes away. `_focus` and `_build` keep working as directives; they
become two more writers of the same per-line state.

## 5. Look and tokens

**Every fence gets the panel.** A code block is an object on the slide, so it carries `--code-bg`, the
padding and the radius on a plain slide exactly as on a `code` slide. One syntax palette then has one
background to be measured against, and the contrast gates measure what ships. The `code` component keeps
what it adds on top: the full-height composition and the column layout of `compare-code`.

**Role tokens replace library tokens.** Proposed set (12 today become 14; names are roles, HARD RULE #11):

| Role token | Was | highlight.js classes (mapped inside the plugin only) |
|---|---|---|
| `--syntax-keyword` | `--hljs-keyword` | keyword, template-tag, selector-pseudo/attr, variable.language_ |
| `--syntax-entity` | `--hljs-title` | title, title.function_, title.class_, section |
| `--syntax-type` | `--hljs-type` | type, symbol, meta |
| `--syntax-builtin` | `--hljs-built_in` | built_in |
| `--syntax-string` | `--hljs-string` | string, regexp, link, char.escape_ |
| `--syntax-number` | `--hljs-number` | number, selector-id |
| `--syntax-constant` | `--hljs-literal` | literal, subst |
| `--syntax-variable` | `--hljs-variable` | variable, template-variable, selector-class |
| `--syntax-parameter` | `--hljs-params` | params |
| `--syntax-markup` | `--hljs-tag` | tag, name, attr, attribute, doctag, code |
| `--syntax-comment` | `--hljs-comment` | comment, quote |
| `--syntax-punctuation` | `--hljs-punctuation` | punctuation, operator |
| `--syntax-inserted` | (none; borrowed variable) | addition, plus a tinted line background |
| `--syntax-deleted` | (none; borrowed literal) | deletion, plus a tinted line background |

- `derive.js` computes the roles for a theme the Studio derives from a palette, with the existing
  `ensureContrast` floor; every committed theme declares its own (the shipped table above is what
  `code.styles.css` maps).
- `lib/tokens/crosswalk.js` records each `--hljs-*` → `--syntax-*` rename, so `checkRetiredTokenNames`
  catches an old name in a theme. An external theme that sets `--hljs-*` falls back to the engine's
  default syntax colors until it renames: a changelog **Breaking:** line.
- `checkHljsContrast` and `checkHljsSeparation` are renamed and read the role tokens. They gain the two
  diff roles and keep their thresholds.
- Print mode keeps its lightness-only hierarchy (`base.modifiers.css:1113-1128`), rewritten against the
  role tokens.

## 6. Formatter bake-off

Measured in a scratch harness (Node 22, headless Chrome 131, no bundler), on a 39-line TypeScript, a
30-line Python and a SQL sample. Sizes are gzip of the exact files the browser fetched. Harness:
`fmt-bakeoff/` in the session scratchpad.

| Candidate | Languages | gz to fetch | Node cold / warm | Width | Invalid input | Idempotent |
|---|---|---|---|---|---|---|
| **Prettier 3.9 standalone** (babel-ts) | JS, TS, JSX, CSS, SCSS, Less, HTML, Vue, Markdown, YAML, GraphQL, JSON | 171 KB for TS; 418 KB all | 106 / 11 ms | ✔ | throws with line:col | ✔ |
| Prettier, `typescript` parser | same | 302 KB for TS | 190 / 18 ms | ✔ | throws | ✔ |
| Biome via `@wasm-fmt/biome_fmt` | JS, TS, JSX, JSON | 543 KB | 62 / 4 ms | ✔ | **returns mangled text, no error** | ✔ |
| Biome official wasm | JS, TS, JSON, CSS, GraphQL | **11.9 MB** | 303 / 4 ms | ✔ | diagnostics | ✔ (fails in the browser without a bundler: CommonJS) |
| dprint + TypeScript plugin | TS, JS (+ JSON, MD, TOML) | 1.16 MB | 68 / 3 ms | ✔ | throws | **✘** (a second pass changes `?.` chains) |
| clang-format (wasm) | C, C++, Java, C#, ObjC, Proto | 1.10 MB | 81 / 15 ms | ✔ | **never validates** | ✔ |
| js-beautify | JS, CSS, HTML (no TypeScript) | 32 KB | 33 / 2 ms | weak | mangled, no error | **✘** |
| **ruff (`@wasm-fmt/ruff_fmt`)** | Python | 499 KB | 25 / 0.7 ms | ✔ | throws | ✔ |
| **sql-formatter**, one dialect pre-bundled | SQL (20+ dialects) | 20 KB | 120 / 9 ms | **✘** | throws | ✔ |
| `@wasm-fmt/sql_fmt` | SQL | 96 KB | 14 / 1 ms | ✘ | mangled, no error | ✔ |
| `@wasm-fmt/gofmt` | Go | 134 KB | not timed | (gofmt has none) | throws | — |

What decides it:

- **A formatter that returns mangled text without an error is disqualified as a default.** The author
  would get a broken slide and no warning. That rules out biome_fmt, sql_fmt, clang-format and
  js-beautify unless a parse check runs first, which erases their speed advantage.
- **Idempotency is required**, because a deck is re-rendered many times and its output must not drift.
  That rules out dprint and js-beautify.
- **Speed does not matter at slide scale.** A deck formats a handful of blocks; 11 ms against 4 ms is
  invisible. Bytes and correctness decide.
- **No formatter honors the width as a hard limit.** At width 40 every JS, TS and Python formatter still
  left two or three lines past 100 columns, because none breaks string literals. A line past the
  panel's edge is clipped, and the render's overflow check reports it (`⚠ OVERFLOW` and the "Content
  clipped" tag, verified on a plain slide); `lint:deck` does not, because it cannot know the panel's
  width. `wrap` is the author's fix. (An earlier draft said the plugin would measure it; it does not.)

**The registry, as decided** (§9). Each adapter is a self-hosted file loaded by a dynamic `import()`
only when a block in that language asks to be formatted, so an adapter no block uses costs nothing:

| Fence languages | Adapter | gz, loaded only when used |
|---|---|---|
| js, jsx, ts, tsx, json, css, scss, less, html, vue, markdown, yaml, graphql | Prettier standalone + that language's built-in plugin | 171 KB for TS |
| php | `@prettier/plugin-php` (its own standalone build) | 43 KB |
| xml | `@prettier/plugin-xml` | 46 KB |
| java | `prettier-plugin-java` (tree-sitter wasm, located by `import.meta.url`) | 162 KB |
| python, py | ruff (`@wasm-fmt/ruff_fmt`) | 499 KB |
| sql | `sql-formatter`, pre-bundled per dialect (`@code{format, dialect=postgres}`) | 20 KB |
| anything else (Go, shell, TOML, C family…) | none | a block that asks for `format` gets a lint warning, never silent nothing |

The second round measured the Prettier community plugins before choosing, all at width 40:

- **PHP, XML and Java** format correctly, are idempotent and throw on invalid code. Java was verified
  in Node; its browser path (wasm by URL) is verified in slice 6.
- **`prettier-plugin-sql` is 585 KB gz.** It wraps the 20 KB `sql-formatter`, so SQL uses the latter
  directly.
- **`prettier-plugin-sh` and `prettier-plugin-toml` do not run in a browser.** They read their wasm
  with `node:fs`.
- **Python has no maintained Prettier plugin**, so it uses ruff, which is best in class.

Every adapter is pinned to an exact version, and a golden test per adapter fails when a version bump
changes output, so a formatting change is a reviewed diff and never a surprise in an exported deck.

**Python fragments.** ruff refuses an indented fragment, such as a method body pasted alone. The
failure policy covers it: the block renders as written, with a warning naming the line.

## 7. Configuration

**The record.** `@code{…}` is a plugin inline kind (`2026-10-14-plugin-inline-door.md`), so its fields
come from the plugin's manifest and Compose builds an editor for it like any other kind.

| Field | Meaning | Example |
|---|---|---|
| `title=` | a file name or caption bar above the code | `title=load.ts` |
| `numbers` / `numbers=12` | line numbers, optionally starting at 12 | |
| `focus=` | lines to keep at full strength; the rest recede (same as `_focus: line`) | `focus=3-5,9` |
| `mark=` | lines to tint without dimming the rest | `mark=4` |
| `diff` | read a leading `+`/`-` on each line as an insertion or deletion mark, highlight the rest in the fence's language | ```` ```ts ```` with `diff` |
| `format` / `format=off` | format this block (needs `code-format`) | |
| `width=` | the formatter's print width; defaults to what fits the slide's column | `width=48` |
| `dialect=` | SQL dialect for the formatter | `dialect=postgres` |
| `wrap` | soft-wrap long lines instead of letting them overflow | |

**Attachment.** A paragraph that is only a `@code{…}` span attaches to the next fence and renders
nothing. A span that does not start with `@code` is unchanged: on a `code` slide it is still the
caption, and on `compare-code` it is still the column label. So the two existing uses keep working.
`title=` is the way to put a caption *on* the code bar; the free-text span stays the way to put one
above it.

**Deck defaults.** Front matter `code: numbers, format` applies to every block; a block's record
overrides it (`format=off`).

**Line numbers after formatting.** `focus=`, `mark=` and `numbers=` count the lines the slide shows,
which are the formatted lines. `lint:deck` warns when a line reference falls past the end of the
formatted block, which is the one way a reformat can silently move a focus.

**Why not the fence info string** (```` ```ts {3-5} title="x" ````, the VitePress / Docusaurus form):
it is shorter, but it is a second config grammar beside segno. It is invisible to Compose's per-kind
editors, and Marp and GitHub render the extra words in their own ways. The owner chose the inline span (§9).

## 8. Build plan and how it is proven

One branch, one PR, one commit per slice; each slice builds and tests on its own.

1. **Line model + defects 2, 3.** A failing test first: `_focus: line 3` after a two-line comment.
2. **The `code` plugin and the `codeRenderer` role**: highlight.js moves out of `lib/engine`, loads
   lazily (defect 5), and the shell grammar moves with it (defects 7, 8). Contract
   change to `lib/plugins/README.md`, `plugin.schema.json` and `resolve.js`.
3. **Studio loading**: drop the esbuild swap; core + per-language payload. Route-budget numbers
   before and after.
4. **Panel on every fence + role tokens**: crosswalk, derive, both gates, print mode, the 18 themes,
   docs (defects 1, 6, 10).
5. **`@code{…}` record**: title, numbers, focus, mark, diff, wrap; deck defaults; lint for bad line
   references.
6. **`code-format`**: the bake, the registry, the four adapters, golden tests, overflow lint.
7. **Export-to-Marp shell grammar** (defect 9).

Proof:

- **Demo deck** `examples/code-plugin.md` (HARD RULE #9): a plain-slide fence, the `code` and
  `compare-code` components, title/numbers/focus/mark/diff, a formatted TypeScript, Python and SQL block,
  a formatter failure, and a mermaid fence beside a highlighted one.
- **Visual review** across all 18 themes, dark and light, with `tools/pixel-check.js`; reviewer agents
  fan out per theme group (QUALITY BAR).
- **Export sign-off.** Formatting changes the bytes of exported decks, so the demo renders to PDF in
  dark and light and stops for your sign-off before merge (QUALITY BAR, export exception).
- **Performance** (HARD RULE #19): `npm run bench` before and after, with a scenario for a deck with no
  code and one with code; `bench:bless` ratchets the baseline.
- **Verification ladder** (HARD RULE #25): this moves an engine transform and changes the plugin
  contract, so the adversarial trio (red team, inversion, checker) runs on the final diff.

## 9. Decisions (owner, 2026-10-15)

1. **Config is the `@code{…}` span above the fence.** The fence info string is not a second grammar.
2. **Every fence gets the panel**, on a plain slide as on a `code` slide. There is one syntax palette.
3. **`--hljs-*` is renamed to the role tokens `--syntax-*`**, derived for every theme. A theme may override
   any of them. This is a breaking change for external themes, recorded in the changelog and the crosswalk.
4. **Formatting uses Prettier first, with two exceptions where Prettier is absent or bloated:** ruff for
   Python and sql-formatter for SQL. Everything is self-hosted and loaded per language. Go and the other
   languages stay unformatted, with a lint warning. The owner asked for no bloat; per-language loading means
   an unused adapter costs a deck nothing.
5. **Formatting runs at authoring time, not render time** (owner, after the adversarial review). The
   inversion lens showed the render-time design's costs: the Studio preview jumped between raw and formatted
   code as the author typed, `focus=` and `mark=` counted lines the editor never showed (so their lint had to
   be switched off), and a formatter upgrade would re-lay every deck that had ever asked. Formatting now
   rewrites the source: `lattice fmt` and the Studio's **Format code blocks** command format every block a
   formatter reads except `format=off`; a record's `format` (or `code: format`) means "keep this block
   formatted", which the Studio does when the author leaves the editor. The render never formats, so
   code-format stopped being a render plugin and moved to `lib/authoring/code-format/`.
6. **The formatters are `optionalDependencies`, and Dependabot keeps upgrading them.** An install without
   them still renders every deck. A style change in a minor release fails the golden tests in Dependabot's
   routine group, and the fix is to re-bless the goldens; no shipped deck changes, because none is formatted
   at render time.
7. **Copy buttons on a code block, off by default** — see the slice 9 entry in §11. `@code{copy}` turns them on for one
   block and `code: copy` in the front matter for every block. Two small on-brand icon buttons, top right of
   the panel, each with a tooltip: copy as code (plain source) and copy as HTML (the highlighted block with
   the theme's colors resolved inline, so it pastes colored into a document or an email). Only on surfaces
   a person reads in a browser (the Studio, the Playground, the HTML player); never in a PDF, a PPTX or an
   image, whose capture runs in a browser too.

## 10. Open

- ~~How the Marp bundle carries the shell grammar (defect 9).~~ Decided in slice 7: the config's engine, see §11.
- The Studio's editor and chat use lezer, not highlight.js, with a separate token tier
  (`editor-theme.ts:104-134`). That stays: an editor needs incremental parsing, and highlight.js cannot
  do that. The parity test between them moves onto the role tokens.

## 11. Progress

- 2026-10-15: audit, bake-off and owner decisions recorded. Building slice 1.
- 2026-10-15: slices 1-3 shipped (line model, the plugin and lazy grammars, per-deck grammars in the Studio).
- 2026-10-15: slice 4 — the panel on every fence and the `--syntax-*` roles. Three things the plan did not foresee:
  the theme spec named the tokens (the owner chose to amend the unsigned 1.0 draft); half the dark variants paint
  `--code-bg` the same as the slide, so the panel gained an inner edge (`--code-edge`); and the four optional roles
  stay out of `REQUIRED_TOKENS` (the engine defaults them) but are derived and serialized as known names
  (`OPTIONAL_TOKENS`). Defect 4 is re-stated, not withdrawn: Mermaid's own CSS flattens its source colors on a diagram
  slide, so its grammar shows only when the plugin is off; tokenizing costs under a millisecond, so it stays.
- 2026-10-15: slice 5 — the `@code{…}` record. Built as a block rule (`code_record`) the renderer reads from the
  token before the fence, not as an inline kind: inline kinds draw in place and carry a sigil, and a record that
  configures the next fence is neither. So Compose has no per-kind panel for it yet; that editor is slice 8 below.
  Two Segno facts shaped the fields: two named lists in one record are ambiguous, and Segno writes ranges `a..b`,
  so `focus=` and `mark=` are text read by the `_focus: line` parser (`3-5 9`), which also keeps the two grammars
  one. `numbers=12` became `numbers, start=12`: a field cannot be both a flag and a number. Per-block focus reuses
  the spotlight treatment with a `<pre>` as its scope.
- Pending, slice 8: the Compose editor for a fence's record (a popover beside the language picker that writes the
  `@code{…}` line, changing only the words edited).
- 2026-10-15: slice 6 — the `code-format` plugin. The bake contract is synchronous and every formatter is async, so
  the bake runs the formatters in one child process (Mermaid's shape, `render.exec.bake: "subprocess"`); the docs
  site runs the same planner above its render (`ensure-code-format.ts`). Both rewrite the fence bodies in the
  source, so every reader sees the formatted lines. `sql-formatter`'s exports map blocks importing one dialect, so the
  SQL chunk carries all of them (about 80 KB gz, only for a deck that formats SQL); the planned per-dialect build was
  not possible. HTML, Vue and Markdown format their own markup only (`embeddedLanguageFormatting: 'off'`), which keeps
  each download to its own plugin.
- 2026-10-15: slice 7, the Marp export. marp-core 4.5 exposes its highlight.js as `marp.highlightjs`, and every
  registered language keeps its `rawDefinition`. So the bundle's `marp.config.cjs` rebuilds bash on the recipient's
  own instance from that instance's stock bash (`ownShell`, lib/core/marp-bundle-html.js). The grammar builder
  (`shellFrom`) is written into the config as source, and the bundle ships no second copy of highlight.js.
  Pre-highlighted HTML was the alternative; it was rejected because Marp highlights fences itself, so the export
  would have had to replace each fence with raw HTML that the config's allowlist then has to admit. On a real
  marp-cli 4.5.0 render, a three-line command list goes from 0 tokens to 7 (3 commands, 4 flags). VS Code's
  preview reads no engine config, so there a shell fence stays stock bash; the fidelity ledger says so. Two gaps
  the plan missed, and both are fixed: the export ran no plugin bake, so a block that asked to be formatted
  shipped as written (export-marp now runs the code-format bake, and the Studio formats before it exports); and
  Marp printed each `@code{…}` record as a line of inline code (`withoutCodeRecords` removes it in the shared
  kernel, found by the engine's own block rule). The record's options are not drawn by Marp, and that is a
  ledger row.
- 2026-10-15: slice 7, the demo deck (`examples/code-plugin.md`). Rendering it through marp-cli found a third
  export gap: a plain-slide fence in Marp had no panel, because Marp renders a bare `<pre>` and the panel rule keyed
  on the `lat-code` class Lattice's renderer adds. The rule gained a second selector for that shape, wrapped whole in
  `:where()` so the engine's own match keeps its specificity (the engine PDF is pixel-identical). A drawn fence is
  left out by its `data-lattice-hydrate` / `data-lattice-settle` marker, so the code plugin names no other plugin.
  `wrap` also gained a two-column hanging indent, because without numbers a wrapped continuation read as a new line.
- 2026-10-15: review and rework. The adversarial trio (red team, inversion, checker) ran on the branch. The
  owner's calls on its forks are decisions 5–7 above. Formatting moved to authoring time: the bake, its worker,
  the export's format step and the render-path await are gone, and the planner now reads the deck with the
  engine's own parser (markdown-it plus `code_record`), which also closed four of the red team's findings — a
  fence inside an HTML comment or block was formatted, a record under a sentence still formatted its block, a
  closing fence indented four spaces closed, and a `diff` block's markers were fed to the formatter and fused
  into one false line. SQL now defaults to PostgreSQL: the generic dialect rewrote `B'0101'` as `B '0101'`.
  `parseIndexList` caps a range at 10,000 lines: `focus=1-20000000` took 7 s and then crashed the whole lint.
- 2026-10-15: slice 9, copy buttons (decision 7). The render writes only a marker, `<pre data-copy>`; the
  buttons are drawn by `lib/core/code-copy.mjs`, one self-contained function with two hosts. The runtime
  draws them on a document whose builder stamped `data-lattice-live-media` (the Studio preview, the
  Playground, Present), which no capture frame or print document carries. The HTML player, which ships no
  runtime, inlines the function by its source only for a deck that has a marked block, and skips it while a
  video is recorded. Neither a plugin pass nor a hydrate could carry it: a pass must declare a bake, a hydrate
  runs on the CLI's capture page, and either would make "code" a name the runtime may not mention. The
  Studio's preview takes no pointer events, so its page hit-tests a tap and copies through the frame with
  its own clipboard (`code-copy-host.js`), as the video and collage taps do. "Copy as HTML" clones the
  code's text into spans carrying their computed color inline (no attribute or class travels), and falls
  back to a selection copy when the clipboard API is refused. Buttons are built with `createElement` only,
  and both files are on the runtime-markup census (HARD RULE #22).

- 2026-10-15: copy buttons, after the rebase. The Studio's thumbnail grids (the slide overview, the slide
  and Reshape pickers, chat figures, print options) render through `preview-pool.tsx`, and their frames carry
  `data-lattice-live-media` too, so a copy-enabled block drew two tiny buttons in every tile. Every pooled tile
  now passes `thumbnail` to `DeckPreview`, which stamps `<html data-lattice-thumbnail>` (single-slide-render.ts),
  and the runtime draws no buttons there. It is a builder-side signal, not a size guess, and it leaves the
  overflow watcher alone (`specimen` is the flag that silences it). Checked in the real Studio's slide overview
  (`code-copy.spec.ts`) and in `test/unit/runtime/code-copy-surfaces.test.js`, whose thumbnail arm fails
  without the guard. `code-copy-engines.spec.ts` drives the exported webpage in Firefox and WebKit: both copy
  the code with `writeText` and the colored copy with a `text/html` `ClipboardItem`.
