# code-format

Pretty-print a deck's code blocks. Formatting is an **authoring step**: it rewrites the deck's
source once, where you see it, and the render shows exactly what the source says
(`engineering/decisions/2026-10-15-code-plugin.md` §6 and §9).

Two ways to run it:

- **The CLI.** `lattice fmt deck.md` formats every top-level block a formatter reads, in place.
  `--check` writes nothing and exits 1 when a block would change, for CI.
- **The Studio.** **Format code blocks** in the command palette does the same to the open deck, as
  one undoable edit. A block whose record says `format`, or every block of a deck with
  `code: format` in its front matter, is also formatted when you leave the editor.

````markdown
`@code{format, width=48}`
```ts
export async function load(id:string){const hit=cache.get(id);if(hit)return hit;return api.get(`/users/${id}`)}
```
````

becomes, in the source:

```ts
export async function load(id: string) {
  const hit = cache.get(id);
  if (hit) return hit;
  return api.get(`/users/${id}`);
}
```

It is not a render plugin: it adds nothing to a render, so it lives with the other authoring tools
(`lib/authoring/`), beside the linter that reads its language table.

## Fields (in the code plugin's `@code{…}` record)

| Field | What it does |
|---|---|
| `format` | Keep this block formatted: the Studio formats it when you leave the editor. `format=off` keeps a block as written, under `lattice fmt`, the Studio command and a deck-wide `code: format`. |
| `width=` | The print width in columns, 20 to 200. Default 60, what a code panel on a 16:9 slide shows. A formatter treats it as a target: none breaks a long string, so a very long literal still runs past it. |
| `dialect=` | SQL only: `postgresql` (the default), `mysql`, `sqlite`, `bigquery`, `tsql`, `snowflake` and the rest of sql-formatter's dialects. Name the one the code is written in: a dialect that does not know a syntax splits it, which changes what the code means. |

## Languages

| Fence | Formatter |
|---|---|
| `js` `jsx` `ts` `tsx` `json` `json5` `css` `scss` `less` `html` `vue` `markdown` `yaml` `graphql` | Prettier |
| `php` · `xml` · `java` | Prettier with its PHP, XML and Java plugins |
| `py` `python` | ruff |
| `sql` | sql-formatter |

Any other language keeps its text; a block whose own record asks is reported, and `lint:deck` says so
too (`code-format-unsupported`). HTML, Vue and Markdown blocks format their own markup only, not the
CSS and JavaScript they embed.

## What to expect

- **The source is what renders.** `focus=`, `mark=` and `numbers` count the lines you see in the
  editor, and `lint:deck` checks them, because formatting has already rewritten those lines.
- **Invalid code keeps its text.** A formatter that cannot parse a block (a fragment, a typo) leaves
  it exactly as written and says why.
- **Left alone:** a fence inside a list or a blockquote (its author's layout), a fence another plugin
  draws (Mermaid, a chart), a `diff` block (its `+`/`-` markers are not code), and anything inside an
  HTML comment or an HTML block, read exactly as the render reads it.
- **Upgrades never move a deck.** A formatter release that changes its style changes nothing in a
  deck until someone formats it again.
- **Optional install.** The formatters are `optionalDependencies`. An install without them still
  renders every deck; `lattice fmt` names the package a block needs.
- **Downloads only what a block uses.** In the Studio each formatter is fetched the first time you
  format a block in its language: Prettier's TypeScript about 171 KB gzipped, PHP 43 KB, XML 46 KB,
  Java 162 KB, Python (ruff) 499 KB, SQL about 80 KB (every dialect, which the package does not let a
  bundle split). A session that never formats fetches nothing.

## Files

| File | Role |
|---|---|
| `plan.mjs` | Which blocks to format, and the splice back (pure; markdown-it plus the code plugin's record rule) |
| `adapters.mjs` | One formatter per language, each a dynamic `import()` |
| `languages.js` | The language → formatter table, shared with the linter |
| `fmt-cli.mjs` | `lattice fmt` |
| `browser.mjs` | The Studio's entry, built by `tools/build-code-format.js` |

## Anti-patterns

- **Formatting code whose layout is the point** (aligned columns, a hand-wrapped call chain). Mark
  that block `format=off`.
- **A long one-line string under a narrow width.** The formatter will not break it; shorten the line.
