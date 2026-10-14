---
origin: 2690
priority: P3
recorded: 2026-10-14
area: website
severity: medium
swimlane: engineering/decisions/2026-07-18-compose-prosemirror.md
source: https://github.com/Laticent/lattice/pull/2690
---

# Compose writes a list inside a quote as a loose list, with blank `>` lines between its items

```text
  P3 · [no ticket] Keep a tight list tight when Compose serializes it inside a blockquote
       why now   — The owner, testing the PR #2690 preview Studio on 2026-10-14, typed a quote with a two-item list under a bar row in Compose. Compose showed it correctly, but the Source tab read `- Germany `1.234,5`` then a blank line, then `  > Hi` / `  > - we` / `  >` / `  > - us`: a blank line before the quote and a blank `>` line between the items. Source and Compose disagree on the list's shape, and a loose list changes what the engine reads (every item becomes a `<p>`), and the chart authoring model makes a `>` description under a chart row the normal form, so this will be common.
       where     — docs/src/lib/compose/deck-markdown.ts (`latticeNodes.bullet_list` calls prosemirror-markdown's `renderList`, which separates items with a blank line unless the list node is `tight`; the list inside the blockquote probably loses `tight` on import or on edit), and its round-trip tests in deck-markdown.test.ts.
       done when — a tight list typed or pasted inside a quote under a list item round-trips through Compose with no blank lines added, and a test pins `- A\n  > Hi\n  > - we\n  > - us\n- B` byte-identical through parse → serialize.
       evidence  — the round-trip test, and a Studio screenshot of the Source tab after editing the quote in Compose.
       verify    — tier 0: a serializer fix with its own round-trip test.
```
