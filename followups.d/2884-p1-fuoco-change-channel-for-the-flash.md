---
origin: 2884
priority: P1
recorded: 2026-10-24
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md
source: https://github.com/Laticent/lattice/pull/2884
---

# Fuoco: a change channel, so the Compose change flash stops diffing by hand

The change flash (#2884) finds what an outside change changed inside `ComposeView.tsx`'s `resyncFrom`, with its own diff (`docs/src/lib/compose/change-flash.ts`). Fuoco already computes the same facts and throws them away: `hub.update(text, { span, by })` runs `spanHolds` / `diffSpan` over the old and new text and records who made the change, then publishes only the focus. No view can hear that the text changed, where, or by whom. Compose therefore reconciles content by hand (a last-emitted string, a parked resync, a rebuilt emit baseline: about 22 refs in `ComposeView.tsx`), and the flash is one more local mechanism beside them. HARD RULE #15 says reuse before building; this was built without checking Fuoco.

This note is the design model to settle before code. It is not built.

**Axes.**

1. **What the channel publishes.** A `change` event per text update: `{ rev, origin, span: { from, toA, toB } | null, prevRev }`. The span is the hub's own checked one (`spanHolds`), so it is never trusted from a caller. Null when the hub could not tell (a replaced deck).
2. **Where it lives.** A new `hub.subscribeChanges(listener, { ignoreOrigin })` beside `subscribe`, not a field on `Focus`: focus is "where the reader is", and a change is not a position. It keeps the hub's rules: nothing re-enters (queued during a delivery), a view never hears its own origin, and a late delivery carries its `rev`.
3. **Coarseness.** One contiguous span, as `findDiffStart` / `findDiffEnd` give today. An AI edit that touches two paragraphs paints everything between them, or nothing past the block cap. Options: keep one span; or have `update` return a list of spans from the outliner's per-unit re-parse (it already re-parses only the units an edit touched). Recommended: the list, because the outliner knows the touched units for free.
4. **Origins.** The shell feeds the hub from render as `by: 'shell'`, so an AI apply, an Inspector stamp, a rename and an undo are one origin. The flash only needs "not Compose", so this is enough now. Separate origins would let the flash treat an undo differently (axis 7 of the flash design) and would be needed for presence or attribution.
5. **What stays in Compose.** The parked resync while the caret is in the editor, the emit baseline and the echo guard: they exist because ProseMirror owns its own document. The channel replaces only the diff and the "which changes get a flash" test, and deletes `diffFlash`'s doc-to-doc pairing in favor of mapping the span onto the new ProseMirror doc.
6. **Other subscribers.** Once changes are a channel, the rail and map could flash a changed slide's pill, and the Markdown source pane could show the same cue. That is the case for building it in the hub and not in `change-flash.ts`. Not in scope for the first slice.
7. **The decision it leans on.** `engineering/decisions/2026-10-15-fuoco-focus-sync.md` §11 says the shell keeps the deck text in React state and that this still costs typing latency (about 60 ms). Whether text itself should move into Fuoco is `followups.d/2822-p1`; this item should not decide it.

**Recommendation.** Add `subscribeChanges` with the span list (axis 3) and the hub's existing origin, port `resyncFrom`'s flash to a subscription, keep `change-flash.ts`'s plugin and CSS unchanged, and delete its diff. Prove it with the failing-arm style `hub.test.ts` uses: a random edit stream where every non-Compose change reaches the Compose subscriber exactly once, with a span that holds, and a deliberately broken hub that must go red. Then re-run `e2e/compose-change-flash.spec.ts` unchanged: its assertions are about what the author sees, so it should pass without edits.

done when — the owner has decided axes 3 and 4 (span list or one span; separate origins or not); the channel ships with its failing arm and the flash reads from it; `diffFlash` and its pairing are gone from `change-flash.ts`; and `e2e/compose-change-flash.spec.ts` passes unchanged on desktop, WebKit and Firefox.
