# highlight-js

Lattice's integration with [highlight.js](https://highlightjs.org/) —
the syntax highlighting library used for code blocks (`\`\`\`<lang>`
fences).

**External dep:** `highlight.js` (transitively via
`@mermaid-js/mermaid-cli` in `package.json`).

**Files in this folder:**

| File | What it implements |
|---|---|
| `highlight-js.css` | Token theme. Wires hljs's `.hljs-keyword`, `.hljs-string`, `.hljs-comment`, etc. classes to Lattice's `--hljs-*` tokens defined in `lib/base/base.tokens.css`. Palette-blind — themes provide the token values. |
| `shell.hljs.js` | Lattice's augmented `bash` grammar — hljs's own, plus modern CLI tools as built-ins and `--flags` as params. See "Custom language definitions" below. |

---

## Render pipeline

Highlighting is a **render-time text transform, never a runtime one.** There is
no hljs script in a deck, on any surface: by the time a slide exists as HTML the
`<span class="hljs-…">` tokens are already in it, and the only thing that happens
in the browser is CSS coloring them.

A `\`\`\`<lang>` fence is highlighted by a markdown-it `highlight` callback at
parse time (`lib/engine/index.js`), producing:

```html
<pre><code class="language-bash">…<span class="hljs-keyword">for</span>…</code></pre>
```

Note the `<code>` carries `language-<lang>` and **not** an `hljs` class. (The
`section code.hljs` rule in `highlight-js.css` is therefore inert on the engine
path; `section :is(pre, marp-pre) code` in `base.elements.css` does the work.)

**One highlighter, every path.** `lattice-emulator.js` does not import
highlight.js — it calls `createEngine()` like everything else, so the CLI, the
PDF/PPTX exports, the HTML player bake and the browser preview all run the same
callback with the same custom grammars registered.

**Which grammars a build carries** is the engine's `languages` capability
(`lib/engine/index.js`) — `has` / `list` / `needed` / `missing` / `register`. The
Node paths carry all 192; the browser bundle ships `common` and FETCHES the rest
per deck. That split, and why it is answerable rather than implicit, is
`engineering/decisions/2026-08-25-on-demand-fence-grammars.md`.

---

## Custom language definitions Lattice ships

Two, both registered in `createEngine()` so every surface gets them:

- **Mermaid** — `lib/integrations/mermaid/mermaid.hljs.js`, via
  `registerMermaidHljs`. The definition lives next to the rest of the Mermaid
  integration (subject over means — see that doc for the rationale).
- **Shell** — `shell.hljs.js` in this folder, via `registerShellHljs`. hljs's own
  bash grammar plus modern CLI tools as `built_in` and `--flags` as `params`,
  because stock bash knows POSIX built-ins and nothing else — so the shape a
  shell block actually takes on a slide (a list of `npm` / `docker` / `kubectl`
  commands) rendered monochrome. It replaces `bash`, which carries `sh` and
  `zsh`.

### Fence tags → grammar

| Tag | Grammar | Note |
|---|---|---|
| `bash` · `sh` · `zsh` | Lattice's augmented shell | Script grammar + CLI commands + flags. |
| `shell` · `console` · `shellsession` | hljs's session grammar | Upstream these mark the `$` prompt in pasted output; they are **not** script grammars. A script tagged ```shell colors almost nothing — that is what `shellFenceFindings` (`lib/core/fence-languages.js`) detects and tells the author to retag. Deliberately not annexed here: one mechanism per symptom. |

**Adding a new custom language.** Create the definition next to the rest of its
subject's integration files (`lib/integrations/<subject>/<subject>.hljs.js`), add
a `register…Hljs` beside the existing two in
`lib/integrations/markdown-it/plugins.js`, call it from `createEngine()` in
`lib/engine/index.js`, and add a row above. One seam covers every surface — there
is no per-path registration to keep in sync. Note that `plugins.js` is on the
browser RUNTIME's bundle graph, so a grammar is **injected** into its register
function rather than required at the top of that file; a top-level require ships
the grammar to a bundle that never highlights.

**Substituting one language's grammar for another's** (highlighting `bash` with,
say, `powershell` because it paints more) was tried and rejected: it trades a
visible defect for an invisible one — powershell reads `-dist` inside
`${OUT_DIR:-dist}` as a flag and drops quoted strings. Evidence and the full
comparison: `engineering/decisions/2026-08-30-shell-grammar.md`.

---

## Token contract

`highlight-js.css` references these CSS custom properties (defined in
`lib/base/base.tokens.css`):

All **twelve** are defined — as fallbacks in `base.tokens.css` and per-palette in
each `themes/*.css`. A dark variant inherits them through its `@import` of the
light palette rather than redeclaring them.

| Token | Hljs classes consuming it |
|---|---|
| `--hljs-keyword` | `.hljs-keyword`, `.hljs-template-tag`, `.hljs-selector-pseudo`, `.hljs-selector-attr`, `.hljs-selector-tag`, `.hljs-variable.language_`, `.hljs-formula` |
| `--hljs-built_in` | `.hljs-built_in`, `.hljs-builtin-name` |
| `--hljs-variable` | `.hljs-variable`, `.hljs-template-variable`, `.hljs-addition`, `.hljs-selector-class`, `.hljs-bullet` |
| `--hljs-string` | `.hljs-string`, `.hljs-meta-string`, `.hljs-regexp`, `.hljs-link` |
| `--hljs-comment` | `.hljs-comment`, `.hljs-quote` |
| `--hljs-number` | `.hljs-number`, `.hljs-selector-id` |
| `--hljs-literal` | `.hljs-literal`, `.hljs-subst`, `.hljs-deletion` |
| `--hljs-title` | `.hljs-title`, `.hljs-function`, `.hljs-section`, `.hljs-class` |
| `--hljs-type` | `.hljs-type`, `.hljs-symbol`, `.hljs-meta`, `.hljs-meta-keyword` |
| `--hljs-params` | `.hljs-params` — also what the shell grammar's `--flags` land on |
| `--hljs-tag` | `.hljs-tag`, `.hljs-name`, `.hljs-attr`, `.hljs-doctag`, `.hljs-code`, `.hljs-attribute` |
| `--hljs-punctuation` | `.hljs-punctuation`, `.hljs-operator` |

Palette themes set the token values to fit their voice (cool indigo
for indaco's keywords, warm sienna for cuoio's, etc.). Code blocks
recolor automatically when the active palette changes.

---

## See also

- `lib/components/code/code.docs.md` — the `code` layout that hosts a
  single highlighted block.
- `lib/components/compare-code/compare-code.docs.md` — the
  side-by-side code comparison layout.
- `lib/integrations/mermaid/mermaid.docs.md` — describes the custom
  Mermaid hljs language definition.
