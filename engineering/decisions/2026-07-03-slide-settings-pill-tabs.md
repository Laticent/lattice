---
status: shipped
summary: De-crowd the Studio's "This slide" drawer with dynamic pill-tabs (Look / Status / Decoration / Chrome / Notes; only tabs with content render); extract a shared PillTabs; retitle to "Slide settings" with a FileSliders icon (configure a slide, not edit — a page with setting sliders, distinct from the deck Inspector's horizontal sliders) on one shared ghost icon button at every breakpoint; every control self-documents with plain-language help. Deck inspector deliberately left grouped (tabbing it is a regression); author/reader notes deferred.
---

# Slide settings — dynamic pill-tabs

**Ask (2026-07-03):** the "This slide" drawer (and the deck inspector) feel crowded and
risk overwhelm. Organize with pill-tabs like the Workspace sheet — a General tab + others
by likely reach. Give the trigger a more appropriate icon as a proper icon button. Give
speaker notes its own tab (with author/reader notes — deferred, see below).

**Red-teamed** with inversion + an independent chair. Two of the asks turned out to be
traps; the plan below reflects the survivors.

## What shipped

- **Shared `PillTabs`** (`docs/src/components/ui/pill-tabs.tsx`): the Workspace sheet's
  hand-rolled rounded-pill tablist, extracted so the three settings surfaces share one
  grammar (REUSE — HARD RULE #15). WorkspaceSheet refactored onto it.
- **The drawer → dynamic pill-tabs** (`SlideContext.tsx`): **Look** (default; dark, type
  scale, finish, brand bar, density, accent) · **Status** (stamp + tone + shapes) ·
  **Decoration** (tint + mark) · **Chrome** (clean-slide + hides) · **Notes** (speaker
  note). Reset stays pinned at the top; the emitted `_class` line stays pinned at the
  bottom. **Dynamic:** a tab renders only when it has content for the active slide — a
  non-round-trippable (`_class` array / multi-comment) slide collapses to the Notes tab
  alone, so tabs are never empty and never hide the one control that applies.
- **Trigger:** retitled **"Slide settings"** with a `SlidersVertical` icon, as an icon
  button (`Button variant="ghost" size="icon-sm"`) matching the editor header's other
  icon buttons; kept in the editor-pane header (contextual to the slide being edited).
  **Icon = configure, not edit.** The first cut used `SquarePen` (an *edit* glyph), which
  mislabeled a config panel. We considered `SlidersVertical` (pure sliders, scope encoded
  by orientation vs the deck Inspector's `SlidersHorizontal`) but landed on **`FileSliders`**
  — a page with setting sliders — because it encodes both the SUBJECT (a slide = a page) and
  the ACTION (settings) in one glyph, and is visually distinct from the Inspector's plain
  horizontal sliders, so it fully retires the "coin-flip beside the Inspector" worry that the
  vertical-sliders option reintroduced. The icon SYSTEM: gear (`Settings2`) = app settings,
  `SlidersHorizontal` = deck config, `FileSliders` = slide config. Legibility verified at 2×+;
  at true 1× the in-page sliders soften but still read.
  **One shared button, no accent tint.** Both triggers (desktop edit-pane header + mobile
  pane bar) are the shared `Button variant="ghost" size="icon-sm"` — the mobile one had been a
  bespoke `text-muted-foreground` `<button>` (the faintest thing in its row) and the desktop one
  carried a `text-[var(--accent)]` override (tinted blue, odd next to the plain-foreground
  Collapse button). Dropping both makes it a plain ghost icon button everywhere, a true peer of
  the Collapse / Architect / Inspector icon buttons; accent stays reserved for the labeled action
  chips (Insert / Fix all).
- **Self-documenting — no magic, no mystery.** These controls are new vocabulary to
  authors, so every one explains itself: each tab opens with a one-line `TabIntro`
  framing the group, and each control carries a plain-language description (a `desc`
  on `Row`/`Field`, a `GroupHead` for the chip groups) that defines the jargon on
  first use (finish = backdrop texture, brand bar = the colored top strip, rail =
  the section-progress dots). **The deck Inspector got the same treatment** (per-group
  intro + per-field help via `InspGroup`/`Field` `desc`), so the two settings surfaces
  read as one system — the one place the "leave the Inspector alone" rule bends,
  because help text doesn't restructure the glance-panel, it annotates it.

## Why the inversion changed the plan

- **Deck inspector: NOT tabbed.** It is a persistent reference column already grouped with
  icon headers (Palette/Wand2/History/Volume2); tabs would show one group at a time, add
  clicks, and destroy the at-a-glance overview — while the crowding (the 8-field Look
  group) would stay 8 fields. Tabbing a glance-panel is a regression. Left grouped.
- **Author/reader notes: DEFERRED.** The engine's `notesFromHtml` treats every surviving
  comment as the speaker note; `_author`/`_reader` aren't directives, so a "private" note
  would leak into every export. It needs engine directive-vocab + a kinded export channel
  FIRST. See `2026-07-03-author-reader-notes-deferred.md`. This PR ships the Notes tab with
  the single speaker note only.
- **Icon:** kept contextual + labeled-by-tooltip; did not move to the topbar next to the
  deck Inspector (`SlidersVertical` beside `SlidersHorizontal` reads as a coin-flip).

## Do-not-regress

- Tabs render only when non-empty; the non-editable slide always has the Notes tab.
- `PillTabs` stays the one pill-tab implementation (Workspace + slide drawer share it).
- No author/reader note field ships before the engine gate (the deferred doc's hard gate).
