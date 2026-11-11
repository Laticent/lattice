---
origin: 2772
priority: P1
recorded: 2026-11-10
area: engine
severity: high
swimlane: engineering/decisions/2026-10-17-meta-record.md §9
source: https://github.com/Laticent/lattice/pull/3115
deferred: blocked — the sweep lands with the cut, which waits on the owner's hard-or-soft cut (D1 on #3136's decision card, D3 in the design doc); the six raw readers and the three generators must move first
---

# Step 5: the sweep — every deck on records, with the cut

The tool is built (`lattice migrate meta`, lib/cli/migrate-meta.mjs, over the kernel in lib/cli/meta-migrate.mjs). A
measured run over `examples/`, `exemplars/`, the baseline decks and the four hand-curated galleries rewrote 404 files,
every one byte-identical in HTML and CSS and in lint findings. It was not committed (design §9 step 5 status), because:

- six readers outside the engine still read `_class:` with their own regex and would go blind on a swept corpus:
  `tools/build-docs-portal.js` `classUsage` (the completion ranking), `tools/preview.js` `decksUsingComponent`,
  `docs/src/components/studio/architect-agent.ts:124`, `docs/src/components/studio/present/rehearsal.js:41`,
  `docs/src/playground/playground-controller.ts:256,269`, `lib/packages/rename.js:47`. Each moves onto
  `readMetaField` / `scanMetaSource`, with a gate that fails on a new raw `_class\s*:` regex;
- the generated decks change at their generators: `tools/build-component-docs.js` (66 `*.gallery.md`),
  `tools/build-bucket-galleries.js`, `tools/build-showcase-galleries.js` (`examples/data-viz-gallery.md`);
- `design/skill.md` and `README.md` promise Lattice source opens in Marp and VS Code: the cut's change rewrites that;
- nothing keeps the corpus in records until `legacy-directive-comment` is on.

Not swept on purpose: `kit/Sample-Deck.md` (the Marp kit's sample) and the test fixtures that pin the comment form.

The sweep runs BEFORE the image plugin's `lint:deck --fix` sweep (session_01DPMMjG6h6Y1DziDhZNy6Af); message that session
when it lands on `main`.

On #3133's inversion note ("merging a slide's records must take the UNION of their class words"): the codemod does not
merge two class-setting records at all. Separate records are last-wins, so merging them into a union would change what
renders, and the codemod's promise is the same render. Such a slide keeps both records, and `meta-class-overridden`
names the collision for the author to settle.

```text
  P1 · [no ticket] Step 5: the sweep, with the cut
       why now   — the cut (step 6) stops the engine reading the comments the corpus is written in.
       where     — the six readers above, the three generators, then `lattice migrate meta` over the corpus; galleries apart (#8)
       done when — every shipped deck is in records, the identity test and lint findings unchanged, no raw `_class:` reader left
       evidence  — the identity test; lint findings before and after; tools/pixel-check.js on the gallery PDFs
       verify    — tier 1 checker
```
