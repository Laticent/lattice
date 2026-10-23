---
origin: 2861
priority: P2
recorded: 2026-10-22
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md
source: https://github.com/Laticent/lattice/pull/2861
---

# Compose note panel: write on teardown, and consider notes as editor content

Two items from the PR #2861 Munger inversion.

1. **Teardown.** A note that is half typed when the editor is torn down (a deck switch, which re-creates the view) is not written, because the field may never blur. Writing it from the effect cleanup is unsafe as built: the write emits through the shell's `onChange`, which by then may belong to the next deck. A fix needs the write to target the old deck's id.
2. **Model.** The note's words live in a `<textarea>` outside ProseMirror, so focus, undo, input methods, paste, folding and resync each needed a hand-written bridge (about fifteen guards in `ComposeView.tsx`). Modeling the words as an isolating, text-only ProseMirror node, serialized through `writeNote`'s rules with a `filterTransaction` that refuses invalid text, would give undo, IME and selection for free. Weigh it before the next change to the note panel.

done when — a deck switch with a half-typed note either writes it to the old deck or tells the author, with an e2e test; and the model question is decided in the decision record, with the guards it removes counted.
