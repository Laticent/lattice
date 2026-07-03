---
status: shipped
summary: The Studio topbar packs up to ~15 controls into one 54px row; on a portrait phone (~390px) it's visibly cramped. This designs the bar's information architecture — (1) group theme + light/dark into one "Appearance" control, and (2) fold the genuinely-secondary controls (Appearance, Library, Workspace, Search) into a single "⋯ More" dropdown on compact widths (≤1099px) while desktop keeps the full bar. After a Munger-inversion red team + an independent checker, the original per-tier split was dropped for ONE compact rule that keeps Present/Share and the Architect/Inspector toggles primary at every width — which also deletes the #635 pulse-mirror problem, the landscape-phone "middle case," and the aria-pressed→menu-item accessibility trap. Reuses ThemeMenuItems + Radix DropdownMenu + the ⌘K CommandPalette (#15). Sequencing: land #635 first, then build this on top.
---

# Studio topbar information architecture — appearance grouping + responsive overflow

*2026-06-30 · status: shipped · revised after red-team + checker*

> **Amended 2026-07-03** (`2026-07-03-studio-brand-mark-toolbar.md`): on the
> **mobile tier only** (<700px), the four deck actions (Present · Share ·
> Architect · Inspector) move from the header to the Edit/Preview pane bar —
> still one tap, so the "never buried" rule is preserved — and the header's
> width goes to the deck title, which now flexes instead of capping at 150px.
> Scope 1(a) (mode stays a standalone 1-tap icon on compact) and the ⋯
> membership are unchanged; the "L" text tile is replaced by the real brand
> mark everywhere. The fold-into-⋯ alternative was red-teamed again and
> rejected again.

> **Implemented** (`StudioShell.tsx`) — built on top of merged #635 per the sequencing
> below. Owner confirmed scope **1(a) + 2(a)**: full Appearance grouping + the one-rule
> `⋯` overflow, with the light/dark toggle kept a standalone 1-tap icon on compact.
> Desktop (≥1100) renders the Appearance **segment** (theme + mode in one bordered group),
> the ⌘K pill, and the full bar; compact (≤1099) keeps Present · Share · Architect ·
> Inspector · mode primary and folds theme · Library · Workspace · Search into a single
> controlled `⋯` menu that resets on every breakpoint flip (H4). Verified at **390 / 844 /
> 820 / 1440, light + dark** — the compact bar is legible (the M-b check passes), so `⋯`
> earns its keep. Unit coverage: the new `StudioShell — topbar information architecture`
> suite (desktop full bar, compact fold, `⋯` membership, Search→palette, open→resize→close).
>
> **Device-test correction (theme = inline, NOT a side submenu).** The first cut used a
> Radix `DropdownMenuSub` for the theme picker inside `⋯`. On a real phone that flyout
> opens to the *side* and, with no room on a ≤844px screen, renders **off the left edge
> (clipped)**; in landscape it also truncated the long theme list with **no "more below"
> affordance**. Fix: drop the submenu and render `ThemeMenuItems` **inline** in the one
> `⋯` `DropdownMenuContent`, actions first — so the menu stays anchored on-screen.
> Because the OS hides native scrollbars on touch and Radix `DropdownMenu` has **no**
> scroll buttons, a clipped row alone was too subtle (device feedback) — so the scroll
> region is wrapped in a `ScrollFade` that shows a **bottom fade + ⌄ chevron while more
> sits below the fold**, clearing once you reach the end. Lesson logged for #18: nested
> menus are a desktop-hover pattern, and "the row clips" is not a scroll affordance on
> touch — verify the *expanded + scrolled* state on a real narrow viewport.

## Problem

The Studio topbar is one 54px row carrying, for an onboarded user, up to ~15
controls. On a **portrait phone (~390px)** it's visibly cramped (user report +
screenshot); on a **landscape phone / small tablet (700–1099px)** it's busy;
desktop (≥1100px) has room. Asks: group **theme + color mode**; fold **other**
controls into a **dropdown** on mobile; decide whether to extend that to
tablet/desktop, across **portrait and landscape** phones.

## Breakpoints (fixed constraints)

`use-breakpoint.ts`: **mobile <700**, **tablet 700–1099**, **desktop ≥1100**;
`compact = bp !== 'desktop'` (≤1099). So **portrait phone → mobile**, **landscape
phone (~844) → tablet**. The redesign keys off these existing tiers — no new
breakpoint.

**Today's starting point (corrected per checker):** theme and light/dark are
**two separate adjacent icon buttons** (`StudioShell.tsx` ~1014–1022), not one
control — so "Appearance grouping" is a real (small) build, not a rename.
Workspace-settings + avatar are *already* hidden `<640px`; the ⌘K pill is gated
`lg:flex` (**≥1024px**).

## Principles

1. **Primary actions stay one tap; secondary collapse.** Deliverable verbs
   (Present, Share) and the working-panel toggles (Architect, Inspector) never get
   buried.
2. **Reveal, don't bury.** An overflow is safe only for genuinely-secondary
   controls; hiding a *frequent* one behind a menu is a regression.
3. **Group by meaning.** Theme + mode are one concept ("appearance").
4. **Reuse, don't fork (#15).** `ThemeMenuItems`, Radix `DropdownMenu`, the ⌘K
   `CommandPalette`.
5. **Don't regress desktop.** It has room; no overflow there.

## The design (revised — one compact rule)

### A. Appearance grouping (all widths)
- **Desktop / tablet:** a single bordered **segment** — the theme dropdown trigger
  + the light/dark toggle in one rounded group, with the **mode toggle kept a
  direct one-tap button** (don't slow the most-frequent appearance action).
- **Mobile (<700):** collapses into the **⋯ menu** (below). To avoid taxing the
  frequent mode toggle with a second level, the **light/dark toggle remains a
  standalone 1-tap icon on mobile**, and only the *theme picker* folds into ⋯
  (red-team H1 — the cheaper variant, chosen over a popover that made mode 2 taps).

### B. ONE responsive overflow ("⋯ More") for all of ≤1099
A single trailing **`⋯` button → Radix `DropdownMenu`**, shown whenever
`compact`; **desktop keeps the full bar**. The membership is the **same on mobile
and tablet** (the per-tier split is dropped — see §Rejected):

| Tier | Left | Right primary | In "⋯ More" |
|---|---|---|---|
| **Desktop ≥1100** | launcher · deck | ⌘K · Appearance(segment) · Present · Share · Focus · Architect · Inspector · Library · Workspace · avatar | — |
| **Compact ≤1099** (portrait + landscape phone + tablet) | launcher · deck | Present · Share · Architect · Inspector · mode · ⋯ | Appearance/theme · Library · Workspace · Search/commands |

- **Present + Share + Architect + Inspector stay primary at every compact width.**
  Keeping the two panel toggles out of the menu is deliberate: it preserves their
  one-tap reach, keeps `aria-pressed`/active-color visible, and means the #635
  Inspector pulse is always directly on the bar (no mirror needed — §C deleted).
- **⋯ holds only genuinely-secondary controls:** the theme picker, Library,
  Workspace settings, and a **"Search / commands"** row that opens the existing
  CommandPalette (touch users' path to ⌘K).

### C. The ⌘K dual-search seam (red-team C1 — fixed)
The ⌘K pill is `lg:flex` (≥1024) but `compact` is ≤1099, so 1024–1099 would show
**both** the pill and a "Search" row in ⋯. Fix: **gate the ⌘K pill to the desktop
tier (≥1100)** so it aligns with "no overflow." Then: desktop = full bar + ⌘K
pill; compact = trimmed bar + ⋯ (whose "Search / commands" row is the only search
affordance). The ⌘K *keyboard shortcut* stays always-bound (harmless on a tablet
with a keyboard).

## Rejected / changed after review
- **Per-tier primary/overflow split (mobile ≠ tablet)** — *dropped.* It added a
  third membership set and a "landscape-phone middle case" (red-team M8) for a tiny
  win (panels are sheets at tablet anyway). One compact rule gets ~90% of the value
  (checker §3).
- **§C pulse-mirror onto ⋯** — *deleted.* With the Inspector toggle primary on all
  compact tiers, the #635 pulse is directly visible; no mirror, and M3 evaporates.
- **Putting Architect/Inspector in ⋯** — *rejected.* A Radix `menuitem` can't carry
  `aria-pressed`; it would force `DropdownMenuCheckboxItem`/`aria-checked` and a
  changed a11y contract (red-team H3 / checker §4). Keeping them primary avoids it.
- **Reusing `PaletteControls`** — *not reused, deliberately.* It already groups
  theme+mode, but it's bound to the site-chrome bus (`window.__dbChrome`, shared
  keys); the Studio runs its own palette state (`lattice-studio-palette`) + `data-
  mode` observer. We mirror its *pattern*, not the component — noted so a reviewer
  doesn't later flag a #15 violation.
- **⋯ opens the CommandPalette wholesale** — *rejected;* a command list can't host
  swatches/toggles. We surface a "Search / commands" *row* inside ⋯ instead.

## Munger inversion — how would this make the Studio *worse*? (post-review)
- **Does ⋯ even earn its keep?** (red-team M-b, the sharpest one.) Appearance
  grouping alone removes one icon; ⋯ now relocates only theme/Library/Workspace +
  Search. *Answer:* on a 390px portrait phone the right cluster still has Present ·
  Share · Architect · Inspector · mode · ⋯ — Appearance-grouping-alone would leave
  theme + Library on the bar too, which is the actual crowding. ⋯ earns its keep by
  taking those off, but **the visual review must prove the compact bar is
  legible**; if it isn't even with ⋯, fold Library/Workspace are already the only
  movers and there's little left to cut — that's the signal to reconsider scope.
- **Bare `⋯` is opaque, and tooltips don't fire on touch** (red-team M-c): give it a
  text-or-`aria-label` + an on-tap menu whose items are all labeled; don't rely on
  hover.
- **Open ⋯ across a resize** (red-team H4): **close ⋯ on any breakpoint change**
  (the breakpoint effect already runs on matchMedia change — reset `cmd`/menu
  state there).
- **Menu → Sheet focus handoff** (red-team M-d): opening a Sheet from a ⋯ item must
  sequence focus (Radix `onCloseAutoFocus`/defer) so focus doesn't strand.
- **Welcome-banner copy** (red-team C3): the first-run banner says "your AI Coach
  and deck settings live in the toolbar above" with the Sparkles/Sliders glyphs —
  those toggles **stay primary** under this design, so the copy stays true. (Was a
  real break under the old split; the simplification fixes it.)
- **Discoverability for newcomers:** Architect/Inspector stay on the bar, so the
  product's headline AI entry point isn't demoted into a menu.

## Sequencing (HARD RULES #17, #8) — land #635 first
#635 (open, green, tested) already adds a *second* conditional axis to the topbar
(`onboarded` trim). Building this width-axis IA **on top of merged #635** lets the
two axes (onboarded × breakpoint) be reconciled in one settled place. **Do not
fold** into #635 (it's near-merge; don't reopen its test surface). Plan: merge
#635 → rebase this branch onto the new `main` → implement as its own PR.

## Test + verification plan
- Unit: Appearance segment renders theme + mode with aria-labels preserved;
  desktop renders the full bar (jsdom = desktop tier, so existing label queries
  pass); a compact-tier test (force matchMedia) opens ⋯ and asserts theme/Library/
  Workspace live inside; ⋯ closes on breakpoint change.
- Visual (Quality Bar — required): **390 portrait, 844 landscape, 820 tablet, 1440
  desktop**, light + dark, screenshot evidence — explicitly confirm the compact bar
  is legible (the M-b check).

## Open questions for the owner
1. **Scope confidence:** ship **Appearance grouping + the one-rule ⋯** (recommended),
   or start with **Appearance grouping only** and add ⋯ only if the screenshot still
   looks cramped? (The red-team's strongest point: prove ⋯ is needed.)
2. **Appearance on mobile:** keep light/dark a standalone 1-tap icon + theme in ⋯
   (recommended), or one Appearance popover (simpler, mode 2 taps)?
3. **Sequencing:** confirmed — land #635 first, then this as its own PR.
