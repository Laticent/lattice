# code-format

Pretty-print a code block before it is colored. Ask for it on a block with the `@code{…}` record,
or for the whole deck with `code: format` in the front matter:

````markdown
`@code{format, width=48}`

```ts
export async function load(id:string){const hit=cache.get(id);if(hit)return hit;return api.get(`/users/${id}`)}
```
````

renders as

```ts
export async function load(id: string) {
  const hit = cache.get(id);
  if (hit) return hit;
  return api.get(`/users/${id}`);
}
```

This is a **plugin** (`engineering/decisions/2026-10-15-code-plugin.md` §6). It requires the `code`
plugin, which reads the record, and it is on by default.

## Fields

| Field | What it does |
|---|---|
| `format` | Format this block. `format=off` keeps one block as written under a deck-wide `code: format`. |
| `width=` | The print width in columns, 20 to 200. Default 60, what a code panel on a 16:9 slide shows. A formatter treats it as a target: none breaks a long string, so a very long literal still runs past it. |
| `dialect=` | SQL only: `postgresql`, `mysql`, `sqlite`, `bigquery`, `tsql`, `snowflake` and the rest of sql-formatter's dialects. Default `sql`. |

## Languages

| Fence | Formatter |
|---|---|
| `js` `jsx` `ts` `tsx` `json` `json5` `css` `scss` `less` `html` `vue` `markdown` `yaml` `graphql` | Prettier |
| `php` · `xml` · `java` | Prettier with its PHP, XML and Java plugins |
| `py` `python` | ruff |
| `sql` | sql-formatter |

Any other language keeps its text, and `lint:deck` says so (`code-format-unsupported`). HTML, Vue and
Markdown blocks format their own markup only, not the CSS and JavaScript they embed.

## What to expect

- **Lines are the formatted lines.** `focus=`, `mark=` and `numbers` count the lines the slide shows,
  which are the formatted ones. `lint:deck` cannot know those before the formatter runs, so it does
  not check a formatted block's line references; check them on the rendered slide.
- **Invalid code keeps its text.** A formatter that cannot parse a block (a fragment, a typo) leaves
  it exactly as written, and the export prints why. Formatting never fails a render.
- **Only top-level fences.** A fence inside a list or a blockquote keeps its author's layout.
- **Downloads only what a block uses.** In the Studio each formatter is fetched the first time a
  block in its language asks: Prettier's TypeScript about 171 KB gzipped, PHP 43 KB, XML 46 KB,
  Java 162 KB, Python (ruff) 499 KB, SQL about 80 KB (every dialect, which the package does not let a
  bundle split). A deck that formats nothing fetches nothing.

## Anti-patterns

- **Formatting code whose layout is the point** (aligned columns, a hand-wrapped call chain). Leave
  that block unformatted with `format=off`.
- **A long one-line string under a narrow width.** The formatter will not break it; shorten the line.
