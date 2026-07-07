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

## The form pass — "function good, form dog shit"

The strip-back kept every function but left the toolbar ugly: `align-items:
flex-end` gave ragged baselines, the stacked uppercase mono picker labels
("COMPONENT" / "STEP") ate a whole row of height and shouted, and the mobile
layout stacked two full-width chrome rows before the deck. A pure form pass:

- **One tidy row.** `.pg-bar` centers everything on a single 32px baseline with
  one consistent gap. The stacked picker labels go **sr-only at every width** —
  each control carries its own placeholder + `aria-label`, so nothing is lost to
  a screen reader and the row keeps one clean height.
- **Two tidy rows on a phone.** Row 1 is the mode toggle (left) + the action
  triggers (right); row 2 is the two pickers sharing the full width (`order`
  pulls the pickers below the actions). Actions collapse to icon-only ≤560px.
- **The pane label earns its place only on the desktop Edit split** (two panes +
  the collapse button). In Explore there's one preview and nothing to collapse
  to; on a phone only one pane ever shows and the mode toggle already says which
  — so `RENDERED SLIDES` / `MARKDOWN` is hidden there, reclaiming its band.

## Focus mode — the user-controllable space reclaim

One toggle (`⤢ Focus`, in the actions cluster) hides the whole toolbar via
`:root[data-pg-focus]` so the deck (Explore) or the editor (Edit) owns the full
height; a slim floating pill (`⤡`) brings the toolbar back. The walk bar stays
in Explore, so stepping — the function — is never lost. The state persists
(`lattice-docs-pg-focus`) at every width and is **seeded pre-paint** on `<html>`
in `playground.astro`, so a returning focus-mode visitor never sees the SSR
toolbar flash then vanish. This is the "allow users to reclaim space without
compromising the functionality" ask — one control, one clear mental model,
reversible.

## Files

`docs/src/components/playground/PlaygroundApp.tsx` (mode toggle, unified
`setViewMode`, step dropdown, `onLoadGallery` → Explore, dead-code removal,
`focusMode` state + toggle + restore pill), `WalkBar.tsx` (stripped),
`docs/src/styles/playground.css` (`.pg-mode`, centered single-row `.pg-bar`,
sr-only picker labels, 2-row mobile via `order`, Explore/mobile pane-label
hide, focus-mode + restore pill), `docs/src/lib/playground-controller.ts`
(`FOCUS_KEY`), `docs/src/pages/playground.astro` (focus pre-paint seed),
`docs/src/playground/playground-tour.js` (retargeted: `.pg-mode`, `#pg-step`;
variant/edit-slide steps removed).

## Verification

Docs unit suite green; component test reworked to the mode-toggle view↔pane
invariant + fuzz. Real built site (astro preview) screenshotted at **390, 820,
and 1440** in Explore, Edit, and Focus — the clean single-row bar, the 2-row
mobile stack, the desktop Edit split (labels retained), and focus mode (toolbar
hidden, walk bar + restore pill) all confirmed on the real surface. The 24
playground e2e specs (explore + state + paint) pass on desktop **and** mobile.
iOS Safari UNVERIFIED (headless sandbox; tracked with #783).
