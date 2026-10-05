---
origin: 2478
priority: P5
recorded: 2026-10-05
source: claude/pdf-writer-tnum-and-followups (the P4 fix: split slots read through topLevelElements)
---

# split-* slots: raw-HTML shapes where both render paths still disagree with the DOM

The split kernel now reads its slots through the shared tokenizer (`lib/core/top-level-h2.mjs`
`topLevelElements`), which fixed 29 shapes in the checker's jsdom differential and regressed none.
Eleven shapes still differ from the DOM path, and they differed identically before the change
(old kernel == new kernel != DOM). All need hand-written raw HTML; markdown-it emits none of them,
and the 2,363 committed decks render byte-identical engine HTML before and after.

- A stray `</p>` makes an EMPTY `<p>` in a parser, which the DOM path then reads as the lede.
- Table foster-parenting: `<p>C.<table>` closes the paragraph in a parser, and content inside an
  open table is moved in front of it. The walk does not model foster-parenting.
- The adoption agency algorithm (`<a><ul></a>`), already named out of scope in the tokenizer header.
- The lede's h3-h6 boundary: the string path stops at the first `<h3>` (`proof`'s `### signal`
  label); the DOM path (`findFirstNonCodeP`) has no boundary, so `<h3>sig</h3><p>C.</p>` puts
  `C.` in the left panel on the DOM path and the right panel on the string path.
- An unclosed `<li>` option list.

```text
  P5 · split-* slots: five raw-HTML parser shapes still differ between the paths
       why now   — HARD RULE #1 parity; rare, raw HTML only, no committed deck hits one.
       where     — lib/core/top-level-h2.mjs walkStack (empty <p>, foster-parenting) and
                   lib/core/split-panels.js extractFirstP (the h3 boundary: decide which path is right).
       done when — each shape is an arm in test/unit/transformers/split-panels-chrome.test.js that
                   compares both paths, and passes.
       evidence  — the differential: .scratch/chk/diff.js in that session; rebuild it from the arms.
       verify    — tier 1, because the tokenizer is shared by masthead, topic-track and split.
```
