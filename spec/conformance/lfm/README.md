# LFM shared test cases

These cases say what a conformant LFM implementation does with a given deck. They are written
against [`spec/LFM-1.0.md`](../../LFM-1.0.md), not against Lattice's code, so a second
implementation can run this folder with its own adapter and compare.

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
| `deck.mode` | The rendering mode (§2.3): `boardroom`, `sketch` or `sketch-clean`. |
| `deck.finish` | The finish (§2.3), or `none`. |
| `deck.logo` | The `logo:` path, or `null`. |
| `slides[i].component` | The component the slide's `_class` names (§2.1), or `null` with no directive. |
| `slides[i].modifiers` | The modifier tokens after the component name, in order. |
| `slides[i].cards` | The card grammar's reads (§3.1): `{ "title", "body": [] }` per top-level item. |
| `slides[i].states` | The answer each top-level list item's state marker carries (§3.2), or `null` when it has none. The answers are the words in §3.2's table: `yes`, `partly`, `no`, `unknown`, `open`, `does not apply`. |
| `slides[i].fences` | The sub-languages the slide renders (§3.3), named without hyphens (`functionplot`). |
| `slides[i].notes` | The slide's speaker notes, one string per note comment, in order (§3.5). |

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
