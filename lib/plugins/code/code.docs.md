# code

Syntax-highlighted code on any slide. Write a fenced block with a language and the deck shows it
colored in the theme's syntax palette:

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
this plugin colors it, on those slides and on every other.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`; design:
`engineering/decisions/2026-10-15-code-plugin.md`). It is on by default.

## Languages

Every [highlight.js language](https://highlightjs.readthedocs.io/en/latest/supported-languages.html)
and alias works: `ts`, `py`, `sh`, `sql`, `yaml`, `diff`, and 186 more. A deck loads only the
grammars its fences name, plus the ones those embed (HTML's `<script>` and `<style>`), so a deck
with no code pays nothing for highlighting.

- **Shell.** ` ```sh `, ` ```bash ` and ` ```zsh ` use Lattice's shell grammar, which also colors
  modern command-line tools (`docker`, `kubectl`, `npm`) and `--flags`. ` ```shell ` and
  ` ```console ` are terminal *sessions*: they mark the `$` prompt. Tag a script ` ```sh `;
  `lint:deck` tells you when a script sits under a session tag.
- **Unknown or missing tag.** The block renders as plain code. `lint:deck` names a tag no grammar
  knows.

## Anti-patterns

- **A fence with no language.** It renders, but uncolored. Name the language.
- **` ```shell ` for a script.** It colors almost nothing; use ` ```sh `.
