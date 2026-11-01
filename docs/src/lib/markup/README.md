# @laticent/markup

**Balanced-HTML string walking and escaping.** The pieces of markup handling that more than one consumer needs and that read
only the string they are given: no DOM, no Node, no dependencies.

Lattice's code plugin numbers, focuses and marks the lines of a highlighted fence, and the engine's `_focus: line`
and `_build: lines` read the same lines. All of them need line N of the slide to be line N of the source, even
when a highlighter's token (a multi-line comment or string) spans several lines. This package is where that split
lives, so the plugin and the engine agree without the plugin importing the engine.

| Function | What it does |
|---|---|
| `splitCodeLines(html)` | Highlighted code (highlight.js output) as one balanced HTML fragment per source line. A span open at a newline is closed at the end of its line and re-opened on the next; the final newline ends the last line rather than starting an empty one; a sub-language span closed after the last newline is not a line |
| `escapeHtml(s)` · `escapeAttr(s)` | Author text made safe for element text (`&`, `<`, `>`) or a double-quoted attribute (the same and `"`), in one pass |

```js
import { splitCodeLines } from '@laticent/markup';

splitCodeLines('<span class="hljs-string">"a\nb"</span>\nnext');
// ['<span class="hljs-string">"a</span>', '<span class="hljs-string">b"</span>', 'next']
```

Design: `engineering/decisions/2026-11-01-plugin-contract-hollywood.md` §5 (a shared package is named for its job
and holds only what has use beyond one plugin).

## Build

`npm run markup-lib:build` writes `dist/` (ESM + CJS + `.d.ts`); `npm run markup-lib:check` fails if it is stale.
Tests: `cd docs && npx vitest run src/lib/markup`.

## Status

Private for now: the package is not published to npm until its publish is approved, so it has no page on the
docs site yet. Lattice resolves it as a workspace package.

## License

AGPL-3.0-only.
