# code

Syntax-highlighted code on any slide. Write a fenced block with a language, and the deck shows it
on a code panel, colored in the theme's syntax palette:

````markdown
## Load a user

```ts
export async function load(id: string): Promise<User> {
  return cache.get(id) ?? api.get(`/users/${id}`);
}
```
````

The code plugin renders **every fence that no other plugin claims**. A fence another plugin owns
(` ```mermaid `, ` ```anima `, ` ```math `, ` ```functionplot `) goes to that plugin, so the code
plugin never restyles a drawn figure. The `code` and `compare-code` slide classes lay code out;
this plugin colors it and gives it its panel, on those slides and on every other.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`; design:
`engineering/decisions/2026-10-15-code-plugin.md`). It is on by default.

## Configuring a block: `@code{…}`

Put an inline code span holding a record on the line directly above a fence (blank lines between
are fine). It configures that fence and renders nothing itself:

````markdown
`@code{title=src/load.ts, numbers, focus=4-5}`

```ts
export async function load(id: string): Promise<User> {
  …
}
```
````

| Field | What it does | Example |
|---|---|---|
| `title=` | A file name or caption bar at the top of the panel | `title=src/load.ts`, `title="a, b.ts"` |
| `numbers` | Line numbers. They are drawn, never part of the text, so copying the code copies only the code | `numbers` |
| `start=` | The first line number | `numbers, start=120` |
| `focus=` | Lines at full strength; the rest recede. Same grammar as `_focus: line` | `focus=3-5 9` |
| `mark=` | Lines tinted, nothing dimmed | `mark=4` |
| `diff` | A leading `+`, `-` or space marks each line added, removed or unchanged; the rest is highlighted in the fence's language | ```` ```ts ```` with `diff` |
| `wrap` | Long lines wrap inside the panel, and the continuation hangs two columns in (with numbers, under the line's own text) | `wrap` |
| `copy` | Two buttons at the panel's top right: copy the code as text, or as HTML with the theme's colors inline. Shown only where the deck is read in a browser (the Studio, the Playground, the exported webpage), never in a PDF, PowerPoint, image or video, in Present, or in a thumbnail. Off unless asked; `code: copy` turns it on for every block | `copy`, `copy=off` |
| `format` | Keep the block formatted: the Studio formats it when you leave the editor. `lattice fmt` and the Studio's Format command format every block except `format=off` | `format`, `format=off` |
| `width=` | The formatter's print width, in columns | `width=48` |
| `dialect=` | The SQL dialect the formatter reads | `dialect=postgresql` |
| `indent=` | The formatter's indentation: `2` or `4` spaces, or `tab`. The panel draws a tab as wide as the indent (`tab` is four columns) instead of the browser's eight | `indent=4`, `indent=tab` |
| `quotes=` | The formatter's string quote, where the language has a choice (JavaScript, TypeScript, CSS, YAML, PHP, Python). JSON, Java and SQL keep theirs, because there the quote is meaning | `quotes=single` |

Lines are counted as written, from 1, whatever a comment or string spans. `lint:deck` warns when a
record does not read (`code-record`), when a record line has no fence after it
(`code-record-orphan`), and when `focus=`, `mark=` or a slide's `_focus: line` names a line past
the end of the block (`code-line-range`), inside a blockquote as outside one. It also says when a line is wider than its panel fits, on
a plain slide as on a `code` or `compare-code` slide (`code-line-clipped`, from the widths measured
in the browser); a `wrap` block never clips, so it is never measured, and a tab counts as wide as
the block's `indent=` draws it.

**A deck default.** `code: numbers, wrap` in the front matter applies to every fence; a block's own
record overrides it field by field (`@code{format=off}`).

**Captions are unchanged.** On a `code` or `compare-code` slide, a plain inline code span above a
fence is still the caption or column label. Only a span that is exactly `@code{…}` is a record.

## Languages

Every [highlight.js language](https://highlightjs.readthedocs.io/en/latest/supported-languages.html)
and alias works: `ts`, `py`, `sh`, `sql`, `yaml`, `diff`, and 186 more. A deck loads only the
grammars its fences name, plus the ones those embed (HTML's `<script>` and `<style>`), so a deck
with no code pays nothing for highlighting.

| Tag | Grammar | Note |
|---|---|---|
| `sh` · `bash` · `zsh` | Lattice's shell grammar | Script grammar, plus modern command-line tools (`docker`, `kubectl`, `npm`) as built-ins and `--flags` as parameters. |
| `shell` · `console` · `shellsession` | highlight.js's session grammar | Marks the `$` prompt in pasted terminal output. A script tagged ` ```shell ` colors almost nothing; `lint:deck` says so and suggests ` ```sh `. |
| `diff` | highlight.js's diff grammar | Added and removed lines take the theme's inserted and deleted colors on a tinted band; the `+` and `-` carry the meaning without color. |
| no tag, or one no grammar knows | none | Plain code on the panel. `lint:deck` names an unknown tag. |

## Anti-patterns

- **A fence with no language.** It renders, but uncolored. Name the language.
- **` ```shell ` for a script.** It colors almost nothing; use ` ```sh `.
- **A `diff` fence for a change to real code.** It colors added and removed lines but not the code
  on them. Use the language's fence with `@code{diff}` instead.
- **Code as a screenshot.** An image of code cannot be searched, copied, read aloud or recolored
  by the theme. Paste the code.

---

## For maintainers

### Render pipeline

Highlighting is a **render-time text transform, never a runtime one.** No highlight.js runs in a
deck on any surface: by the time a slide exists as HTML the `<span class="hljs-…">` tokens are in
it, and the browser only colors them with CSS.

The plugin host sends every unclaimed fence to this plugin's `codeRenderer`
(`code.render.js`, `lib/plugins/host.js` `codeFence`), which colors it through markdown-it's own
fence rule and marks the block it colored:

```html
<pre class="lat-code"><code class="language-bash">…<span class="hljs-keyword">for</span>…</code></pre>
```

A fence a zip plugin owns for this render gets the panel but no color: the code door finds its
block by the plain text inside. A fence a loaded plugin draws later (` ```mermaid `) is colored but
gets no panel, because that plugin styles its own source block.

### Which grammars load, and where

`shared/highlighter.js` owns the one highlight.js instance (its `lib/core` singleton). The engine's
`languages` capability (`has` / `list` / `needed` / `missing` / `spans` / `register`) is this
module, reached through the host so the engine names no plugin.

- **Node** (CLI, PDF, PPTX, HTML exports): a grammar loads the first time a fence names it, through
  `shared/load-grammar.js`, with the grammars it embeds (`shared/languages.generated.js`, built by
  `tools/build-code-languages.js`). `http` embeds every language, because its request body
  auto-detects among all of them.
- **Browser bundles** (the Studio and Playground): `shared/load-grammar.browser.js` loads nothing.
  The preview fetches each grammar a deck names, and the ones it embeds, before it renders
  (`docs/src/lib/ensure-hljs-language.ts`, files from `tools/build-hljs-languages.js`).
- **Export-to-Marp**: the recipient's marp-core highlights with its own highlight.js.

### Custom grammars

- **Shell** — `shared/shell.hljs.js`, registered as `bash` (with `sh` and `zsh`) when the
  highlighter loads, and re-asserted whenever `bash` is asked for, because loading the full
  highlight.js build into the same process would replace it. Why it exists, and why borrowing
  another grammar was rejected: `engineering/decisions/2026-08-30-shell-grammar.md`.
- **Mermaid** — `lib/plugins/mermaid/mermaid.highlight.js`, the Mermaid plugin's `highlight`
  contribution, registered by the host under its code fence (`installHighlight`).

A grammar for a plugin's own fence belongs to that plugin (`contributes.highlight`). A grammar
that improves an existing language belongs here, in `shared/`, registered by the highlighter.

### The syntax roles

`code.styles.css` is the one file where highlight.js class names meet a theme. Each class maps to
a role token; a theme declares the roles (`spec/THEME-1.0.md` §4.1), with fallbacks in
`lib/base/base.tokens.css`.

| Role token | highlight.js classes |
|---|---|
| `--syntax-keyword` | `keyword`, `template-tag`, `selector-pseudo`, `selector-attr`, `selector-tag`, `variable.language_`, `formula` |
| `--syntax-builtin` | `built_in`, `builtin-name`; the shell grammar's commands land here |
| `--syntax-variable` | `variable`, `template-variable`, `selector-class`, `bullet` |
| `--syntax-string` | `string`, `meta-string`, `regexp`, `link`, `char.escape_` |
| `--syntax-comment` | `comment`, `quote` |
| `--syntax-number` | `number`, `selector-id` |
| `--syntax-constant` | `literal`, `subst` |
| `--syntax-entity` | `title`, `title.function_`, `title.class_`, `function`, `section`, `class` |
| `--syntax-type` | `type`, `symbol`, `meta`, `meta-keyword` |
| `--syntax-parameter` | `params`; the shell grammar's `--flags` land here |
| `--syntax-markup` | `tag`, `name`, `attr`, `attribute`, `doctag`, `code` |
| `--syntax-punctuation` | `punctuation`, `operator` |
| `--syntax-inserted` | `addition` |
| `--syntax-deleted` | `deletion` |

The panel is `--code-bg` with `--code-text` for unhighlighted text. Every role is held to 4.5:1
on the panel it paints on (`checkSyntaxContrast`), and on the a11y palettes to separability under
the condition (`checkSyntaxSeparation`). In print mode the roles collapse to a lightness
hierarchy of print inks (`lib/base/base.modifiers.css`).
