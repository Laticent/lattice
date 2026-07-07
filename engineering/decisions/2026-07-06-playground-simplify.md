---
status: in-progress
summary: Strip the Playground chrome back to the deck. After a space-reclaim design competition produced a two-toggle collapse scheme the user rejected as over-complicated, the surface is simplified instead: Explore/Edit becomes a compact two-icon toggle (◱ view · ✎ edit), the five toolbar icons collapse to two (Deck setup — with debug folded in — + Galleries), the step chip strip and the variant select merge into one Step dropdown, and Edit-this-slide + the transcript disclosure are removed. Explore and Edit become two views of the SAME deck — Explore renders it, Edit opens its markdown, editing reflects back — so "just flip to Edit" replaces both removed affordances. Edit is a full-height editor (no preview pane on mobile; the desktop split stays). The walk bar pins to the bottom on mobile so the deck dominates.
---

# Playground simplification — strip the chrome back to the deck (2026-07-06)

> Provenance: the space-reclaim design competition (2026-07-06, five tracks)
> produced T2 "Slim-Rail" and, after the user's amendment, a two independent
> collapse toggles (header + rail). Shown the built result, the user judged it
> "awful and unusable" — too much chrome. This decision supersedes that
> approach (the toggle work was reverted before merge) with a strip-back that
> answers the user's five asks directly.

## The five asks → the changes

1. **Reclaim the icon-button space.** The five toolbar icons (Debug · Deck setup
   · Galleries + the two collapse toggles) become **two**: Deck setup and
   Galleries. Debug already lived inside Deck setup (`DebugPrefRow`), so the
   standalone toggle was redundant; the two collapse toggles are deleted.
2. **Explore / Edit as toggle icon buttons.** The two pills (`PillTabs`) become
   a compact two-icon segmented control (`.pg-mode`): **◱ Explore** (view the
   deck) · **✎ Edit** (its markdown). `role="tab"` + `aria-label`; the active
   one takes the accent.
3. **Edit = the editor, drop preview.** Edit is a full-height markdown editor.
   The mobile `Markdown | Preview` tabs are gone (Explore is the preview). The
   desktop editor+preview split is unchanged.
4. **Consolidate the tiers into a dropdown.** The walk chip strip AND the old
   Variant select merge into one **Step** dropdown (`#pg-step`) listing every
   slide (title, default, each variant, stress, compositions, anti-patterns,
   see-also). Prev/Next step; the dropdown jumps.
5. **Kill Edit-this-slide and Read-this-slide's-copy.** Both removed. Their
   value — the slide's markdown to read or edit — is had by flipping to **✎**.

## The unifying change

For "just flip to Edit" to replace those two affordances, **Explore and Edit are
two views of the same deck**: Explore renders it; flipping to Edit opens the
deck's markdown in the editor (`setViewMode` loads `exploreSourceRef` on the
Explore→Edit flip); flipping back saves the edits (`exploreSourceRef =
getSource()`) so Explore renders them. A gallery load always lands in Explore
(the deck is to view), keeping the mode and the pane in sync.

The old "Explore never writes the draft" invariant is retired — that separation
existed to protect a scratch draft the simplified model no longer has. Draft
protection on component/gallery switches (backup + one-tap Undo) is kept.

## Walk bar

Stripped to `‹ Prev · N / M · Next ›` + the plan caption. Chips, Edit-this-slide,
and the transcript are gone. On mobile Explore the walk bar pins to the bottom
(`order`) so the deck fills the band above it.

## Files

`docs/src/components/playground/PlaygroundApp.tsx` (mode toggle, unified
`setViewMode`, step dropdown, `onLoadGallery` → Explore, dead-code removal),
`WalkBar.tsx` (stripped), `docs/src/styles/playground.css` (`.pg-mode`, mobile
bottom-pin, sr-only picker labels), `docs/src/playground/playground-tour.js`
(retargeted: `.pg-mode`, `#pg-step`; variant/edit-slide steps removed).

## Verification

Docs unit suite (770) green; component test reworked to the mode-toggle
view↔pane invariant + fuzz. Screenshots at 390 (Explore + Edit) and 1440.
Playground e2e specs updated to the new selectors. iOS Safari UNVERIFIED
(headless sandbox; tracked with #783).
