---
status: in-progress
summary: One cohesive grammar for every Studio/Playground/site panel & drawer —
  a shared PanelSheet/PanelHeader/PanelBody/PanelSection layer over shadcn Sheet, a
  single X close (chevron retired), pill-tabs organized by reach, a 3-step width
  scale, and a touch-scroll fix. Supersedes the deck-Inspector-not-tabbed call
  (2026-07-03) and the chevron-close model (2026-07-06). Rolls out surface-by-surface.
---

# Panels & drawers — one cohesive system

**Date:** 2026-07-17
**Status:** Accepted — building surface-by-surface on `claude/panels-drawers-audit-q6u8k6`.
**Supersedes:** the "Deck inspector: NOT tabbed" decision in
`2026-07-03-slide-settings-pill-tabs.md`, and the chevron-based collapse model in
`2026-07-06-studio-activity-bar.md` (the activity-bar model otherwise stands).

## Context

~20 overlay surfaces (side sheets, docked columns, full-screen overlays, HUDs,
command palettes, popovers) accreted across the Studio, Playground, and docs site,
each in its own PR. The grammar drifted apart: **five** header styles (the same
`SheetTitle` restyled `text-[11px]`→`text-[17px]`, some hand-rolled `<h3>`s that
aren't a header at all), **four** tab/segment systems, **six** ad-hoc widths,
inconsistent body padding + scroll setup, a **touch-scroll bug** (panel bodies pan
sideways on touch), and a close affordance that was an X-vs-chevron coin-flip by
surface type. The ask: one cohesive system across mobile (390) / tablet (820) /
desktop (1440) — consistent header, bodies organized by pill-tabs ordered by
likely reach, unified close, correct flex, no jank, shadcn where it defensibly fits.

Direction was confirmed with the owner over a visual spec + real-app proof: a
**full IA rethink** (not cosmetics), **pill-tab the deck Inspector** too, **unify
close to one X**, and a visual-spec-first sign-off gate.

## The system

**Two structural archetypes, one grammar.** *Drawer* = a transient `Sheet`
(Share, Feedback, Workspace, Library, History, Galleries, DeckSetup, mobile nav,
mobile Settings/Architect). *Dock* = a persistent desktop side column (Architect,
Inspector) that now carries the **same X close** in its header; the activity-bar
icon remains the way back. Full-screen overlays (Present, SlideOverview) and
portaled HUDs are a separate class — out of the migration's first pass, but they
adopt the same X glyph/placement.

**The shared layer — `docs/src/components/ui/panel.tsx`** (composes shadcn
`sheet.tsx`; the pieces are plain divs so they also drop into a docked `<aside>`):

- `PanelHeader` — accent icon chip · one 15px title · optional mono eyebrow ·
  trailing actions · single X. Title routes through `SheetTitle` inside a Sheet
  (preserves the dialog accessible-name tests).
- `PanelBody` — the one scroll region:
  `min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y]`.
  This kills the sideways touch-drift for every panel at once; intentional
  horizontal scrollers (the slide filmstrip) re-opt-in with `[touch-action:pan-x]`.
- `PanelSection` — the one mono-uppercase subhead (replaces ad-hoc `<h3>`s).
- `PanelSheet` — width scale `sm` 340 / `md` 440 / `lg` 720 via a `width` prop,
  mobile-capped; forwards `side` / `overlay` / `modal`.

**One tab grammar — `PillTabs`** everywhere a panel has 2+ peer groups, ordered by
reach. This is where the IA rethink lives: **group by one clear idea per tab.**

## Deck Inspector — the first IA (shipped in this doc's first commit)

Was five stacked groups (Look was a 14-control grab-bag). Now pill-tabs by reach:

| Tab | One idea | Controls |
|---|---|---|
| **Look** | Identity + surface | Language, Theme, Color mode, Size, Mode, Finish, Card lift |
| **Brand** | Where the accent shows | Brand bar, Bar placement, Card rail (+placement), Structural trim, Heading rule, Eyebrow |
| **Marks** | Repeating running chrome | Header, Footer, Page numbers, Section rail |
| **Speech** | How it's read aloud | Lexicon, Acronyms |
| **Authoring** | Editor aids (preview-only) | Inline validation, Debug overlay |

The Brand tab collects the whole `--spectrum`-token family that used to bloat Look.

## IA regrouping — shipped (from the grouping audit)

Each surface below failed "one idea per tab" and was regrouped:
- **Workspace → General / AI / Data.** The General grab-bag lost its data-durability
  cluster: "Where decks live" + "Backup & restore" moved into a renamed **Data** tab
  (with the storage-governance rows + delete-everything), so it reads
  where-it-lives → back-it-up → manage/clear → delete. General keeps prefs + install.
- **Slide settings → a Brand tab**, mirroring the deck Inspector — the spectrum/accent
  family (brand bar, placements, card rails, trim, heading rule, eyebrow) left the
  overloaded Look tab. (Notes already carries clearly-labeled Note/Caption/Description
  sub-sections, so it was left as-is.)
- **Architect → Coach / Chat / Lenses** pill-tabs. Lenses (the reader-view membership
  + approval workflow) left the overloaded Coach card stack for its own peer tab; the
  hand-rolled Coach/Chat toggle became PillTabs. "Reshape for a reader" + the preview
  LensPicker now land on the Lenses tab.

Left coherent by the audit: Share (artifact vs source), Library (Docs is a noted minor
outlier, deferred), GalleriesSheet, DeckSetupSheet, ComponentPicker, Version history,
Slide-settings Status/Decoration/Chrome/Comments, MetricDetail.

## Also shipped
- The **touch-scroll fix** now rides every drawer/panel scroll body (Inspector,
  Architect, History, Share, Workspace, Library, Slide settings, Playground sheets).
- The Inspector scope-echo close is **desktop-only**, so the mobile Settings sheet
  shows one X, not two.
- Drawer **headers unified** to the 15px-title + accent-icon + bottom-border grammar
  (the two 17px sheets and the Playground micro-label headers were normalized).

## Deferred
- **Library** Docs-vs-assets distinction (Docs breaks the select/share/bulk contract) —
  a smaller follow-up, tracked here.
- Full `PanelSheet`/`PanelHeader` component migration of every sheet (Feedback is the
  pilot); the rest were normalized in place this pass and can adopt the primitive later.

## Do-not-regress

- `PillTabs` stays the ONE pill-tab implementation (no per-surface reinvention).
- Every migration changes transport/anatomy but **preserves accessible role +
  name**; where a role legitimately changes (button→tab), its one selector-of-record
  (`e2e/studio-fixture.ts` CHROME, or the test) updates in the same commit.
- The touch-fix lives on `PanelBody`; intentional horizontal strips opt back in.
- Real-surface verification (HARD RULE #23) at 1440/820/390, light + dark, per
  migrated surface; maker-checker (HARD RULE #25) over the StudioShell blast radius.
