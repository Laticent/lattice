# LFM shared test cases

These cases say what a conformant LFM implementation does with a given deck. They are written
against the spec ([`LFM-1.0.md`](../../LFM-1.0.md)), not against Lattice's code, so a second
implementation can run this folder with its own adapter and compare. Each case cites the LFM 1.0
section it checks.

**License:** CC-BY-4.0, like the spec. **Owner:** @saden1.

## A case

Each case is two files with the same name:

- `<name>.md` is the deck, written in LFM.
- `<name>.json` is what an implementation must produce from it, at each conformance level the
  case covers (LFM §1).

```json
{
  "title": "One sentence: what the case shows",
  "spec": "LFM-1.0",
  "section": "3.2",
  "L0": { "visible": ["…"], "hidden": ["…"], "rules": 2, "codeBlocks": ["mermaid"] },
  "L1": { "slideCount": 3, "deck": { "mode": "sketch" }, "slides": [{ "component": "checklist" }] },
  "L2": { "findings": [{ "rule": "unknown-finish", "severity": "warning", "slide": 0 }] }
}
```

A case lists only the levels and fields it checks. A field it leaves out is not checked.
`spec` names the version that introduced the case: a 1.0 implementation passes the `LFM-1.0`
cases, and a 1.1 implementation passes them all. `until`, when present, names the version that
changed what the case pins: an implementation of that version or later does not run it. LFM 1.0 is
the first version, so no case carries `until` yet, and the reference implementation runs them all.

### A table

When many small decks check one rule, a case is a table instead: `<name>.json` alone, with
`rows` in place of the deck. Each row carries its own `name`, its deck as `source`, and its
own `L0`, `L1` and `L2`.

```json
{ "title": "…", "spec": "LFM-1.0", "section": "4.2",
  "rows": [{ "name": "lift: off", "source": "---\nlift: off\n---\n\n## A\n", "L2": { "findings": [] } }] }
```

### L0: what a CommonMark host shows

Render the deck with a plain CommonMark parser after dropping YAML front matter, the way a GFM
host does.

| Field | Meaning |
|---|---|
| `visible` | Each string appears in the rendered text (whitespace collapsed to single spaces). |
| `hidden` | No string appears in the rendered text. |
| `rules` | The number of `<hr>` elements. |
| `codeBlocks` | The info string of each fenced code block, in order. |

### L1: the structure a renderer resolves

| Field | Meaning |
|---|---|
| `slideCount` | The number of slides. |
| `absent` | Strings that MUST NOT appear anywhere in the rendered output (a lens name, §6.1). |
| `deck.mode` | The rendering mode (§4.2): `boardroom`, `sketch` or `sketch-clean`. |
| `deck.finish` | The finish (§4.2), or `none`. |
| `deck.logo` | The `logo:` path, or `null`. |
| `slides[i].component` | The component the slide's record names in `layout` (§2.3). `null` with no record. |
| `slides[i].modifiers` | The modifier tokens the record's `class` names, in order. |
| `slides[i].cards` | The card grammar's reads (§3.1): `{ "title", "body": [] }` per top-level item. |
| `slides[i].states` | The answer each top-level list item's state marker carries (§3.2), or `null` when it has none. The answers are the words in §3.2's table: `yes`, `partly`, `no`, `unknown`, `open`, `does not apply`. |
| `slides[i].fences` | The fences the slide draws as a figure at render time rather than leaving as code for the browser (§3.3), named without hyphens. Today that is `functionplot` and its `latticeplot` alias; a `mermaid`, `math` or `anima` fence is not listed. |
| `slides[i].notes` | The slide's four notes (§2.4): `{ note, say, alt, handout }`, each a string or `null`. `note` and `handout` join several comments with a blank line, `say` and `alt` with a space. |
| `slides[i].lens` | The slide's lens membership, from its record's `lens` field (§6.1): `{ "include": [], "exclude": [] }`, each sorted. |
| `slides[i].inline` | The slide's inline notation (§5.1) and plain inline code, in document order. Each item is one of `{ "kind": "pill", "label", "shape", "color" }` (with `"icon": true` when the pill leads with an icon; `color` is `null` with no slot), `{ "kind": "mark", "answer" }`, `{ "kind": "spark", "type" }`, `{ "kind": "icon", "name" }`, or `{ "kind": "code", "text" }` for a span that stayed code. Code inside a fenced block is not listed. |

`slides` is matched by position: entry `i` checks slide `i + 1`, and a deck may have more slides
than the case lists.

### L2: the findings a tool emits

`findings` is the exact set of findings, each as `rule`, `severity` and `slide` (Diagnostic
Protocol §1). Order does not matter. An empty list means the deck must lint clean.

## Running them

The reference adapter is [`tools/lfm-conformance.js`](../../../tools/lfm-conformance.js):

```sh
node tools/lfm-conformance.js           # every case
node tools/lfm-conformance.js fences    # one case
```

The unit tier runs the same cases in `test/unit/spec/lfm-conformance.test.js`, and breaks each
case's expectations on purpose to prove the runner catches a wrong answer.
