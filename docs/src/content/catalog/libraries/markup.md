---
kind: library
name: Markup
order: 16
promise: Read HTML as a string, and end each piece where a browser would.
intro: Code that reads rendered HTML as text has to agree with the browser on where a section, a heading or a highlighted line ends. A string search gets it wrong the moment the characters appear in a comment, an attribute or a nested element. Markup is a small tag walker that answers those questions the way the browser's parser does, with no DOM and no dependencies.
group: Drawing and parsing
inLattice: Splits rendered decks into slides, reads each slide's own title, and numbers the lines of highlighted code.
useWhen: Your server or build step reads HTML as a string, has no DOM to hand, and must not be fooled by a comment or an attribute.
mark: /markup-mark.svg
facts:
  - { k: Package, v: '@laticent/markup' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: 'The browser, a worker and Node' }
  - { k: Dependencies, v: None }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/markup/README.md
    note: Every function, in one table.
  - label: The tokenizer
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/markup/tags.ts
    note: How one pass yields tags and skips comments, RAWTEXT and quoted values.
  - label: The section walker
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/markup/sections.ts
    note: Why it walks the tokenizer and not indexOf('<section'), with the bugs that taught it.
  - label: Why it is its own package
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-11-01-plugin-contract-hollywood.md
    note: A shared package is named for its job and holds only what more than one plugin needs (§5).
---

## The problem

A slide engine renders Markdown to HTML, then keeps working on that HTML as a string: it adds a class to each slide, reads each slide's title for a table of contents, numbers the lines of a code block. With no DOM on the server, the tempting tool is a regular expression. Take a deck where one slide carries a comment that quotes an old slide:

```html
<!-- Draft kept for later: <section class="draft"><h2>Old title</h2></section> -->
<section class="title">
  <aside class="note"><h2>Speaker aside</h2></aside>
  <h2>Revenue held in Q2</h2>
</section>
```

A search for `<section` finds a slide inside the comment, and its first `<h2>` is the aside's, not the slide's. The browser sees one slide titled "Revenue held in Q2". Each shortcut breaks a different way:

- **A search for the tag text** finds it inside comments, inside `<style>` and `<script>` bodies, and inside quoted attribute values.
- **Ending a tag at the first `>`** cuts `<span title="a > b">` in half and leaks `b">` into the text.
- **The first match of a closing tag** ends an outer section at a nested section's close.
- **Splitting highlighted code on newlines** cuts a multi-line comment or string in two: the first line never closes its span, and the next lines lose their color.

## The idea

Walk the tags once, the way the parser does, and answer every question from that walk.

- **One tokenizer.** `scanTags` makes one left-to-right pass, yielding each tag with its offsets and each inert span (a comment, a `<!…>`, a RAWTEXT body) as inert, and it honors quoted attribute values. Every other reader is built on it.
- **Depth, not first match.** Sections, list items and closing tags are matched by depth, so a nested element never ends its parent.
- **A section's own children.** `findTopLevelH2` and `topLevelElements` return only direct children, modeling the parser's implied closes and foster parenting, so a heading inside an aside is not the slide's title.
- **Balanced code lines.** `splitCodeLines` closes every span still open at a newline and re-opens it on the next line, so each line is a balanced fragment and line N on the slide is line N of the source.
- **Offsets into your string.** Readers return positions in the original text, so a caller can splice a change in without re-serializing the document.

## How to use it

```sh
npm install @laticent/markup
```

> Markup publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/markup`.

```ts
import { splitCodeLines, splitSections, readTopLevelH2Text, plainText } from '@laticent/markup';

// Highlighted code, one balanced fragment per source line.
splitCodeLines('<span class="hljs-string">"a\nb"</span>\nnext');
// ['<span class="hljs-string">"a</span>', '<span class="hljs-string">b"</span>', 'next']

// Rendered slides, each with its own title.
for (const piece of splitSections(html)) {
  if (piece.type === 'section') console.log(piece.cls, readTopLevelH2Text(piece.inner));
}

plainText('<p>Q3&nbsp;<b>grew</b></p>'); // 'Q3 grew'
```

| Call | What it gives you |
| --- | --- |
| `scanTags(html)` | Every tag and inert span, in order, with offsets |
| `splitSections(html)` · `mapSections(html, rewrite)` | Top-level sections as pieces; or each one rewritten in place |
| `findTopLevelH2(scope)` · `readTopLevelH2Text(scope)` | A section's own heading, never a nested one |
| `topLevelElements(html)` · `parseTopLevelLis(inner)` | Direct-child elements; a list's own items |
| `splitCodeLines(html)` | Highlighted code as one balanced fragment per line |
| `escapeHtml(s)` · `escapeAttr(s)` | Text made safe for element text or a quoted attribute |
| `plainText(s)` · `stripTags(s)` | The text with tags removed, for display |

## Where else it fits

- **Static site and documentation builds** that post-process rendered HTML in Node: add a class per section, build a table of contents, number code lines.
- **Code highlighting with line features**: line numbers, highlighted lines or line-by-line reveals on top of highlight.js output.
- **Edge functions and workers**, where there is no DOM and a full HTML parser is too heavy to load.
- **Email and feed pipelines** that need the plain text of trusted HTML, or a heading out of it.

## How Lattice uses it

The engine reads every rendered deck through Markup. It splits the HTML into slides to stamp each slide's form and to lay the progress track, and reads each topic slide's own title to build the track of topics a `topic` slide shows, with the current one lit. Card layouts such as cycle and team profile read their list items with it. The code plugin numbers, focuses and marks the lines of a highlighted fence with `splitCodeLines`, and a slide record's `focus=line` and `build=lines` read the same lines, so the plugin and the engine agree without the plugin importing the engine. A markdown-it rule from Markup also stops a `<style>` block from swallowing the next slide separator.

## What it doesn't do

- **It is not a sanitizer.** It reads HTML you already trust. Its tag stripping is for display text, not a security boundary; untrusted HTML needs a real sanitizer.
- **It is not a full HTML parser.** It models the parser rules a slide reader meets (implied closes, foster parenting, one adoption-agency case), not the whole specification, and it builds no tree.
- **It reads only highlight.js-shaped code.** `splitCodeLines` expects escaped text plus `<span>` tags; other tags pass through as text.
- **It decodes only on request.** `readTopLevelH2Text` leaves entities encoded; `plainText` decodes them.
