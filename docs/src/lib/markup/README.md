# @laticent/markup

**Balanced-HTML string walking and escaping.** The pieces of markup handling that more than one consumer needs and that read
only the string they are given: no DOM, no Node, no dependencies.

The engine and its plugins read rendered slide HTML as a string, and they must agree on where a section, a
heading or a list item ends. This package is the one place that answer lives. For example, Lattice's code plugin numbers, focuses and marks the lines of a highlighted fence, and the engine's `_focus: line`
and `_build: lines` read the same lines. All of them need line N of the slide to be line N of the source, even
when a highlighter's token (a multi-line comment or string) spans several lines. This package is where that split
lives, so the plugin and the engine agree without the plugin importing the engine.

| Function | What it does |
|---|---|
| `splitCodeLines(html)` | Highlighted code (highlight.js output) as one balanced HTML fragment per source line. A span open at a newline is closed at the end of its line and re-opened on the next; the final newline ends the last line rather than starting an empty one; a sub-language span closed after the last newline is not a line |
| `escapeHtml(s)` · `escapeAttr(s)` | Author text made safe for element text (`&`, `<`, `>`) or a double-quoted attribute (the same and `"`), in one pass |
| `scanTags(src, from?)` | The tokenizer: one left-to-right pass yielding each tag (`{ kind: 'tag', name, isClose, selfClose, start, end }`) and each inert span (comment, `<!…>`, RAWTEXT body), honoring quoted attribute values. Offsets are into the original string |
| `findTopLevelH2(scope)` · `readTopLevelH2Text(scope)` | A section's OWN title heading, never one nested in its content; the second returns its text |
| `findTopLevelTag(scope, tag, accept?)` · `hasTopLevelTag(scope, tag)` · `topLevelElements(src)` | Direct-child elements, by a walk that models the parser's implied closes, foster parenting and the one adoption-agency case a slot reader meets |
| `findFirstTag(scope, tag)` · `maskInert(html)` · `stripScannedTags(html)` | The first tag at any depth; inert spans blanked to spaces (offsets kept); tags stripped through the tokenizer |
| `splitSections(html)` · `unclosedSectionAt(html)` · `withClass(openTag, cls)` | Rendered slide HTML as ordered `gap` and `section` pieces, depth-aware; where an unclosed `<section>` starts; an open tag with its `class` replaced |
| `mapSections(html, rewrite)` · `mapSectionHtml(html, rewrite)` · `readAttr(tag, name)` · `readClassAttr(tag)` | Visit each top-level section and rewrite it; read an attribute (`class` never matches `data-class`) |
| `parseTopLevelLis(inner)` · `extractFirstList(html)` | A list's top-level `<li>` contents, depth-aware; the first `<ul>`/`<ol>` |
| `tolerateRawtextClose(md)` · `RAWTEXT_CLOSE` | A markdown-it block rule, installed ahead of `html_block`, that ends a `<script>`/`<pre>`/`<style>`/`<textarea>` block on `</style >` (whitespace before `>`), as a browser does, so the block cannot swallow the next slide separator (#2052). Imports nothing; it is handed `md` |
| `findMatchingClose(html, tag, from)` | The offset of the close tag that balances an open one |
| `removeTags(s)` · `stripTags(s)` · `plainText(s)` | Tags off (to a fixed point); and `&nbsp;` folded and trimmed; and entities decoded. Not a security boundary |

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
