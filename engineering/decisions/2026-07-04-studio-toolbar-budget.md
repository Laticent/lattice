---
status: shipped
summary: The Studio's crowded toolbars overflowed because they had a WIDTH BUDGET no one was keeping. The mobile Deck-actions bar clipped once a Version-history icon was appended. The owner's chosen fix — reclaim width by SHRINKING, not by hiding: the Edit/Preview toggle becomes ICON-ONLY (~78px saved), which keeps all the deck actions INLINE and one-tap (no ⋯ menu). Present mode's bottom bar is rebuilt to fit phones by construction — the counter never wraps and Autoplay collapses to an icon (the non-essential voice/caption status is the only thing hidden below sm). The reader-lens control becomes ONE shared, always-labeled LensPicker (was two divergent widgets + three label sources). History's home settled by a placement-by-budget rule so it stops bouncing.
---

# Studio toolbars — keep a width budget by shrinking, not hiding

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
the control that tipped the mobile bar past 390px.** The principle: *each bar has a width
budget; keep it.*

Measured before the fix: mobile Deck-actions bar `scrollWidth 419 > 390` (Inspector
clipped) — only ~29px over. Present `document.body` overflowed horizontally at phone width
(the bottom bar's `Auto`/`Captions` pills forced it wide and the `N / N` counter wrapped
to two lines).

## The owner's call — shrink, don't hide

The first pass folded the panels behind a `⋯` overflow. The owner rejected it: *"I would
rather make edit and preview icon buttons than hurry things behind a ⋯."* Right instinct —
the overflow was only ~29px, and the Edit/Preview toggle carried two text labels worth
~78px. **Icon-izing that one toggle reclaims more than enough to keep every deck action
inline and one-tap.** Visible-and-reachable beats hidden-but-tidy for a primary touch
surface. The budget is now kept by *shrinking the biggest element*, not by hiding the rest.

## What shipped

- **Mobile Deck-actions bar → icon toggle, everything inline** (`StudioShell.tsx`). The
  `Edit/Preview` segmented toggle is now **icon-only** — a **pencil** (Edit) + an **eye**
  (Preview), the standard editor idiom that reads without text; label on `aria-label`/
  `title` + `aria-pressed`. (A follow-up red-team/inversion/judge round confirmed icon-only
  over text/rename, and swapped the Edit glyph from a `FileText` *document* — which read as
  "file" — to `PencilLine`.) Dropping the two labels reclaims ~78px, so the deck actions
  stay inline and one-tap: `[✏️|👁]` · (Preview pane: Version history · Slide settings ·)
  Present · Share · Architect · Inspector. No `⋯`; the Inspector keeps its first-edit pulse. Measured `scrollWidth ==
  390` (no clip). (The Edit pane omits History/Slide-settings from the bar — its own editor
  header carries them.)
- **Present bottom bar fits by construction** (`PresentOverlay.tsx`). The counter is
  `whitespace-nowrap tabular-nums shrink-0` (never wraps); the pill has a
  `max-w-[calc(100vw-1.5rem)]` backstop; below `sm` **Autoplay collapses to an icon** (the
  `FastForward` glyph; the "Auto" word returns at ≥ sm) and the non-essential voice/caption
  status is hidden — leaving `‹ N/N › · ▶ · Auto-icon`. Prev/next/play are 44px.
  Tablet/desktop unchanged.
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
- **Phone:** an inline icon on the Preview pane's Deck-actions bar (the icon Edit/Preview
  toggle reclaimed the room). Not top-nav.

It is never again top-nav (wrong altitude — deck-level, not app-level) and never a
floating deck-panel entry. Slide settings follows the identical rule.

## Rejected / deferred (kept this shippable)

- **Merge Slide settings INTO Deck settings — DEFERRED** (own PR). A real IA/semantic
  change (two panels → one); folding it in here would balloon blast radius. The two
  coexist unchanged in this PR.
- **A generic "toolbar budget" primitive — REJECTED.** No new framework. Each bar keeps
  its budget by construction (an icon-collapsing element, per-pane contextual items). The
  durable rule ("keep each bar's width budget; shrink before you hide") lives here, not in
  code.
- **A `⋯` overflow on the pane bar — REJECTED (owner's call).** It would hide primary
  actions on a touch surface; icon-izing the toggle keeps them visible instead. This also
  avoids a second `⋯` competing with the top-bar app overflow on the same phone screen.
- **slide-nav appears 3× in Compose; Slide-settings/Inspector overlap — LOGGED** as
  follow-ups (off-path).
- **A ~15px horizontal body overflow at the 820 tablet width — LOGGED, pre-existing.**
  The culprits (measured) are the collapsed split-rail's vertical "Preview" label and the
  slide-navigator, neither touched here; the shared LensPicker cannot force it
  (`min-w-0 shrink truncate`). Off-path for this PR; tracked separately.

## Verification (HARD RULE #23)

Real headless Chromium at 390 / 820 / 1440: mobile Deck-actions bar `scrollWidth == 390`
(no clip) with every action inline (icon Edit/Preview toggle · History · Slide settings ·
Present · Share · Architect · Inspector); Present bottom bar `‹ 1/7 › ▶ Auto` with no wrap
and no in-dialog overflow; the shared LensPicker renders labeled in both the preview header
and Present; 408 studio unit tests pass; lint + build:check clean.
