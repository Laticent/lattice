---
status: in-progress
summary: A cohesive panel/drawer grammar for the Studio, rolled out surface-by-surface.
  SHIPPED this pass — the IA regrouping (deck Inspector, Slide settings, Workspace,
  Architect all pill-tabbed by one-idea-per-tab), a single X close (chevron retired),
  the touch-scroll fix on every panel body, and unified headers. The shared
  PanelSheet/PanelHeader/PanelBody/PanelSection primitive is the FOUNDATION + its first
  consumer (FeedbackSheet); the other surfaces were normalized in place and adopt it
  incrementally (NOT yet a repo-wide component guarantee). Supersedes the
  deck-Inspector-not-tabbed call (2026-07-03) and the chevron-close model (2026-07-06).
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
| **Accent** | Where the accent shows | Brand bar, Bar placement, Card rail (+placement), Structural trim, Heading rule, Eyebrow |
| **Marks** | Repeating running chrome | Header, Footer, Page numbers, Section rail |
| **Speech** | How it's read aloud | Lexicon, Acronyms |

The Accent tab collects the whole `--spectrum`-token family that used to bloat Look.
The two preview-only editor aids (inline validation, debug overlay) sit in a collapsed
**Developer** footer disclosure below the pills — present, but off the reach-ordered strip
(follow-up A.1; see "Follow-up resolutions" below). This leaves four narrow one-row pills.

## IA regrouping — shipped (from the grouping audit)

Each surface below failed "one idea per tab" and was regrouped:
- **Workspace → General / AI / Data.** The General grab-bag lost its data-durability
  cluster: "Where decks live" + "Backup & restore" moved into a renamed **Data** tab
  (with the storage-governance rows + delete-everything), so it reads
  where-it-lives → back-it-up → manage/clear → delete. General keeps prefs + install.
- **Slide settings → an Accent tab**, mirroring the deck Inspector — the spectrum/accent
  family (brand bar, placements, card rails, trim, heading rule, eyebrow) left the
  overloaded Look tab. (Notes already carries clearly-labeled Note/Caption/Description
  sub-sections, so it was left as-is.)
- **Architect → Coach / Chat** pill-tabs (AI faculties only). Lenses (the reader-view
  membership + approval workflow) first moved to a Coach/Chat/Lenses peer tab, then
  graduated OUT to its own first-class panel (follow-up; see below). The hand-rolled
  Coach/Chat toggle became PillTabs.

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

## Open design tensions (surfaced by the adversarial trio — HARD RULE #25)

Honest follow-ups, not papered over. The owner chose to pill-tab the deck Inspector
(reversing 2026-07-03); these are the costs that reversal carries, worth revisiting:
- **Glance vs. tabs.** The Inspector stopped being a scan-everything reference column;
  a deck-wide audit ("is my brand bar on, footer set, page numbers showing?") now costs
  tab-switches. If it grates, options: keep the column scannable, or merge Look+Brand.
- **White-label split.** The theme **accent** lives on Look while the **brand bar** lives
  on Brand — the white-label flow the Brand tab is named for spans two tabs. Candidate:
  co-locate accent with the brand controls.
- **"Brand" buries typography.** Eyebrow + Heading rule sit under Brand because they read
  the `--spectrum` token, but a user thinks "heading," not "brand." Candidate: rename to
  "Accent" or move the heading marks to Look. → **RESOLVED** (renamed to Accent; see below).
- **Lenses lives in an AI-branded panel.** Reader views (a deterministic, no-model
  workflow) are a tab inside the Sparkles/"AI coach" Architect. Entry points route to it,
  but its conceptual home may be with view/preview controls, not the coach. → **RESOLVED**
  (Lenses is now its own first-class panel; see below).
- **Pill density.** Five deck pills still wrap in a ~260px column even label-only;
  demoting "Authoring" (2 preview-only toggles) to a footer/Workspace would get to four.
  → **RESOLVED** (demoted to a Developer footer; see below).

## Follow-up resolutions (owner-directed, this doc's second commit)

The owner directed three follow-ups that resolve tensions surfaced above:

- **A.1 — Authoring pill → Developer footer.** The deck Inspector's two preview-only aids
  (inline validation, debug overlay) moved out of the pill strip into a collapsed
  `<details>` "Developer" footer, always present below the active tab. Four pills now fit
  one row in a ~260px column. (Resolves *Pill density*.)
- **A.2 — Brand → Accent.** The tab renamed on both the deck Inspector and Slide settings.
  "Accent" is the broader, truer name for everything the accent token touches, including
  the heading marks a user reads as "heading," not "brand." (Resolves *"Brand" buries
  typography*.)
- **Lenses + Library → first-class panels.** Both graduate out of their host surface into
  the **assistant slot** — ONE mutually-exclusive left column shared with the Architect,
  each with its own activity-bar launcher (desktop) and ⋯-menu entry (compact). The
  launchers order by likely reach: **Architect · Library · Lenses**. Library keeps its
  transient Sheet on compact (via a `docked` prop that swaps the Sheet chrome for a plain
  column when docked); Lenses gets a matching compact sheet. Reader-view entry points
  ("Reshape for a reader", the preview LensPicker's add affordance) now open the Lenses
  panel directly. (Resolves *Lenses lives in an AI-branded panel*.) The mutual-exclusivity
  is one nullable enum, `activeAssistant: 'architect' | 'lenses' | 'library' | null`, so
  only one assistant column is ever open and the #721 track invariant holds.

## Do-not-regress

## Do-not-regress

- `PillTabs` stays the ONE pill-tab implementation (no per-surface reinvention).
- Every migration changes transport/anatomy but **preserves accessible role +
  name**; where a role legitimately changes (button→tab), its one selector-of-record
  (`e2e/studio-fixture.ts` CHROME, or the test) updates in the same commit.
- The touch-fix lives on `PanelBody`; intentional horizontal strips opt back in.
- Real-surface verification (HARD RULE #23) at 1440/820/390, light + dark, per
  migrated surface; maker-checker (HARD RULE #25) over the StudioShell blast radius.
