---
origin: 2861
priority: P3
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md
source: https://github.com/Laticent/lattice/pull/2861
---

# Compose: show what an outside change changed, with an on-brand highlight that fades

**The owner's ask (2026-10-23).** An AI edit applies on its own and is undone with Ctrl/Cmd+Z or the undo toast. What Compose should add is a way to SEE what changed: fade in a highlight on the line with an accent rule, fade in a stronger highlight on the exact words that changed, then fade both out slowly. The look should match the current-slide cue (Compose's `cs-slide-active` band, the Playground's current-slide band). This note is the design model to settle before any code; it is not built.

**Axes to decide.**

1. **What counts as "changed".** Diff the slide's old and new ProseMirror docs: `prosemirror-changeset` (or `tr.mapping` plus a text diff) gives inserted ranges. Deletions have no range left to paint, so they need a marker (a thin accent caret where the words were) or nothing.
2. **Two layers.** A block layer (the whole paragraph or line: tint plus an accent rule on the leading edge, like the active-slide band) and a span layer (the exact inserted words: a stronger tint). Both are ProseMirror decorations: `Decoration.node` for the block, `Decoration.inline` for the words. Decorations never touch the deck's bytes, so the highlight cannot leak into the source or the undo history.
3. **Motion.** CSS only: an `@keyframes` on a class, driven by tokens (`--motion-*` durations, `--accent` and its soft tint). Suggested curve: about 150 ms fade in, hold about 1.2 s, then about 1.6 s ease-out fade. The block layer starts first and the span layer about 80 ms later, so the eye lands on the line, then the words. A plugin removes the decorations when the animation ends (`animationend`, or a timer keyed to the token).
4. **Reduced motion.** Under `prefers-reduced-motion: reduce`, no fade: the tint appears, holds, then is removed in one step.
5. **Off-screen changes.** If the changed range is outside the viewport: scroll it into view (jumpy when the author is typing elsewhere), or show a small "N changes above/below" chip that scrolls on tap. Recommended: the chip, and never scroll while the author has focus.
6. **Which changes get it.** Every outside change (AI apply, Inspector edit, sync), or AI only. Recommended: every change that did not come from the author's own keystrokes in Compose, because the parked-resync path (`pendingResyncRef`) is the one place all of them meet.
7. **Interaction with undo.** Ctrl/Cmd+Z after an AI apply should flash the range it restored, with the same layers, so undo is as legible as the change.

**Recommendation.** One `changeFlashPlugin` in `ComposeView.tsx` fed by the resync path: compute inserted ranges, add block and span decorations with a `cs-flash` class, animate in CSS from tokens, remove on `animationend`. Add the off-screen chip second. Prove it with a deck that shows each layer in dark and light, plus an e2e test that the decorations go away and the deck bytes are untouched.

done when — the owner has picked the curve and the off-screen behavior from a short prototype (a screen recording at desktop and phone widths), and the plugin ships with its demo deck and the e2e test above.
