---
status: shipped
summary: Give the Studio's crowded toolbars a BUDGET + a ⋯ overflow (the discipline the desktop top bar already had, never carried over). The mobile Deck-actions bar overflowed 390px once a Version-history icon was appended; it now holds only Edit/Preview + Present + Share + ⋯, with the panels (Architect, Deck settings) and secondary slide/version tools folded into ⋯. Present mode's bottom control bar is rebuilt to fit phones by construction (counter never wraps; Auto/Captions fold into a ⋯ Playback menu below sm). The reader-lens control becomes ONE shared, always-labeled LensPicker used by both the editor preview header and Present (was two divergent widgets + three label sources). History's home is settled by a placement-by-budget rule so it stops bouncing.
---

# Studio toolbars — a budget and an overflow, not endless appending

**Ask (2026-07-04):** the owner flagged three things after Version history landed in
the editor/deck-actions toolbar — (1) a real-estate/crowding problem (the mobile bar
clipped the Inspector icon), (2) Present mode "no longer responsive," and (3) "why is
the lens an icon dropdown in preview but a full labeled dropdown in Present?" They
asked for a red-team + inversion + independent checker.

## Root cause (all three reviewers agreed)

**Neither the mobile Deck-actions bar nor the Present bottom bar had a button budget or
an overflow strategy.** The desktop top bar already solved this (a `compact` `⋯` menu +
`hidden lg:inline` label collapse); that discipline was never carried to the two bars
that broke. So controls were appended until one fell off — **Version history was just
the control that tipped the mobile bar past 390px.** The load-bearing reversal: *toolbars
have a fixed budget; the `⋯` overflow is the default home for everything past it.*

Measured before the fix: mobile Deck-actions bar `scrollWidth 419 > 390` (Inspector
clipped); Present `document.body` overflowed horizontally at ≤ phone width (the bottom
bar's `Auto`/`Captions` pills forced it wide and the `N / N` counter wrapped to two
lines).

## What shipped

- **Mobile Deck-actions bar → a budget** (`StudioShell.tsx`). Inline: `Edit/Preview`
  toggle · Present · Share · **⋯**. Folded into the ⋯ (labeled menu items): **Architect**,
  **Deck settings**, and — on the Preview pane — **Slide settings** + **Version history**
  (the Edit pane's own editor header already carries those two). The ⋯ trigger inherits
  the **active-panel accent dot** (when Architect or Deck settings is open) and the
  first-edit **Inspector pulse**, so both signals survive the fold. Reuses the existing
  DropdownMenu pattern — no new primitive (HARD RULE #15). Welcome-banner copy updated
  (panels are now "under ⋯" on phones, "one tap on the right" at ≥ sm).
- **Present bottom bar fits by construction** (`PresentOverlay.tsx`). The counter is
  `whitespace-nowrap tabular-nums shrink-0` (never wraps); the pill has a
  `max-w-[calc(100vw-1.5rem)]` backstop; below `sm` the secondary read-aloud controls
  (**Auto** + the voice/caption status) fold into a **⋯ Playback** menu, leaving
  `‹ N/N › · ▶ · ⋯`. Prev/next/play are 44px. Tablet/desktop are unchanged (they already
  fit — the fold gates at `< sm`, not ≤ 820).
- **One shared `LensPicker`** (`lens-picker.tsx`, exporting a single `LENSES` source).
  Used by the editor preview header AND Present. **Labeled at every width** (truncates in
  a tight container, never hidden behind a breakpoint — a bare glyph is undiscoverable,
  worst on touch with no tooltip). Collapses the three prior label sources (`LENS_LABEL`,
  a local `LENSES`, an inline literal) into one.

## History's home — the placement-by-budget rule (so it stops bouncing)

History moved deck-panel → top-nav → editor-header across earlier rounds; each move just
relocated the crowding because it was a *naked icon competing for a permanent slot at
every width*. The stable rule: **placement-by-budget, not one global home.**

- **Desktop:** an icon in the editor-pane header, beside Slide settings (there is room).
- **Phone:** a labeled item inside the pane-bar `⋯` (no room for another icon; a
  self-labeling menu row beats a bare glyph anyway).

It is never again top-nav (wrong altitude — deck-level, not app-level) and never a
floating deck-panel entry. Slide settings follows the identical rule.

## Rejected / deferred (kept this shippable)

- **Merge Slide settings INTO Deck settings — DEFERRED** (own PR). A real IA/semantic
  change (two panels → one); folding it in here would balloon blast radius. The two
  coexist unchanged in this PR.
- **A generic "toolbar budget" primitive — DOWNGRADED.** Realized by reusing the existing
  `⋯` pattern per bar, not a new framework. "Every bar declares a budget" is captured
  here as the durable rule, not as code.
- **slide-nav appears 3× in Compose; Slide-settings/Inspector overlap — LOGGED** as
  follow-ups (off-path).
- **A ~15px horizontal body overflow at the 820 tablet width — LOGGED, pre-existing.**
  The culprits (measured) are the collapsed split-rail's vertical "Preview" label and the
  slide-navigator, neither touched here; the shared LensPicker cannot force it
  (`min-w-0 shrink truncate`). Off-path for this PR; tracked separately.

## Known trade-off

On phones there are now two `⋯` menus on screen — the top-bar **app** overflow
(Library/Workspace/theme) and the pane-bar **deck** overflow (panels + slide/version
tools). They sit in different bars with different scopes; acceptable, but worth watching
if a future pass can consolidate the mobile chrome.

## Verification (HARD RULE #23)

Real headless Chromium at 390 / 820 / 1440: mobile Deck-actions bar `scrollWidth == 390`
(no clip); the ⋯ opens with Architect · Deck settings · Slide settings · Version history
and "Deck settings" opens the inspector sheet; Present bottom bar `‹ 1/7 › ▶ ⋯` with no
wrap and no viewport overflow; the shared LensPicker renders labeled in both the preview
header and Present; 408 studio unit tests pass; lint + build:check clean.
