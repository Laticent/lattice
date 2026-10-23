---
origin: 2880
priority: P1
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-09-27-plugin-system.md
source: https://github.com/Laticent/lattice/pull/2880
---

# A fence of a plugin nobody has installed renders as plain code, with only the editor warning to say why.

Found by the owner on a phone while testing #2880: a deck that lists a plugin which is not installed in this browser shows the fence as an ordinary code block. A plugin that is installed but unlisted or unapproved now gets a drawn card; an uninstalled one gets nothing in the preview.

```text
  P1 · [no ticket] Decide whether an uninstalled plugin's fence should get a card too.
       why now   — the owner asked for "the same type of placeholder" in every state. The
                   door does not know an uninstalled plugin, so it cannot say what the
                   block would draw or its size; that is why #2880 left it out.
       where     — docs/src/lib/code-packages/door-run.ts (the `declared` set and the
                   claims loop), lib/packages/code-door-fence.mjs `fencePlaceholder`.
                   A card would need a "plugin not installed" reason and a fixed size,
                   because there is no manifest to read a placement from.
       done when — a listed plugin that is not installed shows a card saying so, in the
                   preview and the export, and a deck without the front-matter line is
                   unchanged.
       evidence  — a Studio screenshot at 1440/820/390 and a real dark and light PDF
                   export sent via SendUserFile.
       verify    — tier 1 checker; it changes export bytes, so it stops for the owner's
                   sign-off (QUALITY BAR).
```
