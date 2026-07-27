---
status: shipped
summary: >
  Every panel the Studio's mobile drawer opens had its own framing — four entry edges,
  five heights, three widths, three close-target sizes, and one panel whose title was a
  different word from the row that opened it. Measured on the real build after the
  drawer itself became coherent enough to make the incoherence around it visible. Fixed
  by finishing the `PanelSheet`/`PanelHeader` migration deferred in
  2026-07-17-panel-drawer-cohesion.md and teaching the primitive one new rule: on a
  phone, `side` is ignored and every panel is a bottom sheet. Tablet and desktop keep
  their left/right rail grammar. The 44px touch floor — the reason the mobile toolbar
  was redesigned at all — now holds on every dialog in the app, not just inside the
  drawer.
last-updated: 2026-07-27
companion:
  - 2026-07-17-panel-drawer-cohesion.md
  - 2026-07-26-studio-mobile-eight-cell-bar.md
---

# Mobile panel framing — one edge, one radius, one close

## How this was found

The Two Doors drawer (`2026-07-26-studio-mobile-eight-cell-bar.md`) shipped, and the
next report was about what happens *after* you tap one of its rows:

> "we have so much delta between each panel clicking on these produce. it's jarring."

That is a report about consistency, not about any one panel, so the first move was to
measure rather than to redesign: open all eight surfaces on the real production build at
390×844 and read their geometry with `getBoundingClientRect` / `getComputedStyle`.

## What the measurement said

| Door | Destination | Enters from | Frame | Radius | Header | Close |
|---|---|---|---|---|---|---|
| *(the drawer)* | Studio | Bottom edge | 390×495 | 16px top | — | **44×44** |
| Themes | Themes | Bottom edge | 390×717 | 16px top | — | 44×44 |
| Show me | Show me | Bottom edge | 390×427 | 16px top | — | 44×44 |
| Send feedback | Send feedback | Full bleed | 390×844 | 0 | 92px | 30×30 |
| Library | Library | Full bleed | 390×844 | 0 | 59px | **16×16** |
| Version history | Version history | **Right edge** | 343×844 | 0 | 107px | **16×16** |
| Search / commands | *(unnamed on screen)* | **Centre float** | 358×350 | 8px all | — | **16×16** |
| Reader views | **LENSES** | **Left edge** | 343×844 | 0 | 49px | **16×16** |

Four entry edges. Five heights. Three widths. Three close sizes. The three surfaces
*inside* the drawer agreed with each other perfectly; every surface it *launched* agreed
with nothing.

Scored against the drawer's own grammar on five axes — same edge, same frame, same header
grammar, a close ≥44px, and calling itself what the row promised — the in-drawer surfaces
scored 10/10 and the five destinations scored 5, 4, 3, 1 and 0.

Three findings were worse than mere inconsistency:

1. **Two rows in the same card opened in opposite directions.** "Reader views" entered
   from the left edge, "Version history" from the right. They sit one row apart with
   nothing to distinguish them.
2. **A door's label and its destination disagreed.** Tapping "Reader views" landed on a
   panel titled `LENSES`, set 11px uppercase — the exact treatment the drawer's own rule 4
   bans, in the panel one tap from the drawer that declares it.
3. **The 44px touch floor held inside the drawer and nowhere else.** That floor is the
   stated reason the whole mobile toolbar was redesigned. Every destination broke it.

## Why it happened — a primitive nobody had to adopt

`ui/panel.tsx` already existed and was already the right abstraction. Its own header
comment said so, and said why it would not be enough:

> STATUS: this is the primitive + its FIRST consumer (FeedbackSheet). The other surfaces
> … were normalized in place this pass and adopt these components incrementally — so the
> cohesion is enforced by this component only where it's actually wired, not yet
> repo-wide.

"Normalized in place" held the **header** grammar — every panel did lead with a 15px title
and an accent icon. It could not hold the **framing**, because each panel still owned its
own `SheetContent` and chose its own `side`, width, and radius there. Cohesion by
convention decays the moment nobody is required to follow it; the four-edge sprawl is what
that decay looked like eleven days later.

So the fix is not a new shell. It is finishing the migration that doc deferred, plus one
new rule inside the primitive.

## The rule

**On a phone, `side` is ignored and every panel is a bottom sheet.**

`PanelSheet` reads the breakpoint (`useBreakpoint` + `useLandscapePhone`, moved to
`src/lib/` so `ui/` can use it without importing from `studio/`) and, on a phone, forces
`side="bottom"`, `max-h-[85dvh]`, `rounded-t-2xl`, and drops the `sm:max-w-*` cap. Tablet
and desktop are untouched.

The width cap matters as much as the edge: `sm:max-w-[340px]` left the left/right sheets at
343px on a 390px screen, so a sliver of the app showed down one side and the panel read as
something hovering over a live surface rather than a place you had gone.

**Why bottom, and not "pick one side and use it everywhere."** A phone has one edge a thumb
reaches comfortably, the drawer that launches these panels is already on it, and iOS and
Android both treat the bottom sheet as the modal-surface default. At tablet width the
left/right split is *not* incoherent — left is the assistant rail (Coach, Chat, Reader
views), right is document actions (Library, Version history, Share, Feedback) — and there
is room for two rails. A phone has room for neither.

**The command palette is not an exception.** It was the only surface in the app touching no
edge: a 358×350 card with an 8px all-round radius, arriving from a sheet pinned to the
bottom with a 16px top-only radius. Exempting it was tempting — ⌘K floating in the middle is
a real cross-platform idiom — but "this one is special" is the exact reasoning that produced
the sprawl. It is bottom-anchored on a phone and unchanged everywhere else. It keeps no
visible header: its input is its label, and it says "Search or run a command…" in the first
row. That is a deliberate, stated exception to the header grammar, not an oversight.

## Every overlay, not just the drawer's five

The first cut of this change migrated only the five panels the drawer opens, and that was
wrong in a way worth recording: **it left the phone with two grammars instead of one.**

The drawer is not the only way to open an overlay on a phone. The Eight-Cell Bar opens
Coach, Chat, Settings and Share; the header opens Workspace settings. Measured after that
first cut:

| Opens | Reached from | Edge | Radius |
|---|---|---|---|
| Coach | toolbar | **LEFT** | 0 |
| Chat | toolbar | **LEFT** | 0 |
| Settings | toolbar | **FULL** | 0 |
| Share | toolbar | **FULL** | 0 |
| Workspace settings | header | **FULL** | 0 |
| *(the drawer's five)* | drawer | BOTTOM | 16px |

Tap Coach on the bar and it enters from the left; tap Reader views in the drawer and it
rises from the bottom. Same app, same phone, one tap apart. Fixing half a surface does not
halve the problem — it relocates it, and makes the unfixed half read as broken by contrast.
That is the same dynamic the drawer itself created for these panels one PR earlier.

So the migration covers **every** Studio overlay: Coach, Chat, the mobile Settings sheet,
Share, Workspace, and the add-slide gallery join the drawer's five. Ten phone-reachable
overlays, one edge, one width, one radius, one close size. Two bonuses fell out: Coach and
Chat shed the 11px uppercase titles that were the same defect as "LENSES", and the
add-slide gallery stopped being an `h-[100dvh]` full-screen page wearing a 16px radius.

Three bespoke widths snap onto the shared scale — Coach/Chat `sm:max-w-[320px]` → `sm` (340),
Version history `sm:max-w-[360px]` → `sm` (340). That is the point of having a scale, and it
is the whole visible cost at tablet and desktop, both measured unchanged otherwise.

What is left on a hand-rolled `SheetContent` is the `StudioDrawer` itself — which is not a
panel but the surface that opens them, and legitimately has its own rules — plus two
non-Studio site sheets (`MetricDetail`, `NavActions`) outside this scope.

## The 44px floor, fixed at the base

Four of five destinations closed with a `16 × 16` target and the fifth with `30 × 30`. The
16px one is the vendored shadcn close in `dialog.tsx` and `sheet.tsx` — `absolute top-4
right-4` around a bare 16px glyph, with no padding — so it was never a Studio bug. It is
every dialog in the app.

Fixed there, marked in place as a deviation from the vendored base the way `sonner.tsx`
marks its two: on a **coarse pointer** the button becomes a 44×44 grid and its inset drops
16px→2px, which leaves the glyph's centre exactly where it was (24px from each edge) while
the target reaches the floor. Fine pointers keep the base verbatim — a mouse does not need
the padding, and the header is denser without it. `PanelCloseButton` follows the same rule
(44 on a phone, 30 otherwise).

Choosing `pointer: coarse` over a width breakpoint is deliberate: the thing that needs a
bigger target is a finger, not a narrow window.

## Naming

"Reader views" arriving as "LENSES" was the worst single finding, and fixing only the panel
title would have moved the mismatch rather than closed it — the activity-bar launcher said
"Toggle Lenses" too. Everything a user reads now says **Reader views**: the drawer row, the
launcher (label, caption, and hint), the docked column header, the panel title, and the two
PresentOverlay messages that pointed at "the Lenses panel". `Lenses` survives as the
internal name — `lensesBody`, `lens-picker.tsx`, `lib/lente` — which is fine; it is simply
not a word the product says out loud.

Per this branch's do-not-regress rule, the selector-of-record moved in the same commit:
`CHROME.lenses` is now `'Toggle Reader views'`, with the rename explained at the entry.

## Result, measured on the rebuilt site

| Panel | Edge | Frame | Radius | Title | Close |
|---|---|---|---|---|---|
| Search / commands | BOTTOM | 390×350 | 16px top | *(input is the label)* | 44×44 |
| Library | BOTTOM | 390×346 | 16px top | Library | 44×44 |
| Reader views | BOTTOM | 390×347 | 16px top | Reader views | 44×44 |
| Version history | BOTTOM | 390×224 | 16px top | Version history | 44×44 |
| Send feedback | BOTTOM | 390×573 | 16px top | Send feedback | 44×44 |

One edge, one width, one radius, one close size, and every title matches its row — and the
same holds for the five reached from the toolbar rather than the drawer (Coach 717, Chat 312,
Settings 717, Share 717, Workspace 717, all BOTTOM/390/16px/44×44).

Heights still differ — 224 to 573 — and that is correct: the sheets are `h-auto` under a
single `max-h-[85dvh]` cap, so each sizes to its own contents exactly as the drawer's two
doors do (427 and 717). Five heights from *one rule* is coherence; five arbitrary fixed
heights was not.

Tablet and desktop verified unchanged in the same pass: at 820px Library is still a 720px
right sheet, Reader views a 340px left sheet, Send feedback 440px right, the palette still
centre-floating; at 1440px Library and Reader views still dock and the other two are still
right sheets. One deliberate change rides along — Version history moved from a bespoke
`sm:max-w-[360px]` onto the shared `width="sm"` (340px), a 20px narrowing at tablet and
desktop, which is the point of having a width scale.

## Fixed while measuring

- **Library's filter strip clipped "Docs" mid-word** against the "0 total" counter at 390px.
  Five pills need ~340px; the count stole just enough. The count now hides on a phone (it
  already hid on a narrow docked pane) and the filters are the control that survives.
- **Library's header search truncated to "Search th"** — icon, title, search, import and
  close cannot share 390px. The search wraps to its own full-width row below the title.
- **Reader views said the same sentence twice**, 40px apart: the header description I added
  duplicated the body lede's first sentence. The lede keeps only the half the header has no
  room for and a user cannot infer — who decides.
- **The command palette's close sat on its search input.** `DialogContent` positions the
  close in the top-right corner, which on this dialog is the first row. At 16px that was
  merely odd; at 44px it became a dead zone over the end of the field where a tap dismissed
  the palette instead of placing a caret. The input row now reserves the corner — at every
  width, since the overlap was never mobile-only.
- **`PanelHeader` gained `srDescription`** — a screen-reader-only description for a panel
  with more to say than its title but no room to say it. Without it the sr-only fallback
  just echoes the title, so AT hears the same word twice and learns nothing; the Library
  ("Saved themes, components, and finishes — search, filter, apply, or import a .zip") is
  the case that surfaced it.

## Verification (HARD RULE #23)

- **Gates:** `npm run lint` clean (zero warnings), `astro sync && tsc --noEmit`,
  `npm run build:check`, root `npm test` 4381/4381, docs `vitest run src/components`
  972/972 across 101 files.
- **Real surface:** a production build (`npm run build:e2e` + `astro preview`) driven by a
  real Chromium at 390×844 with `hasTouch`/`isMobile`, at 820×1180, and at 1440×900. Every
  figure in both tables above is read from that build, not estimated. Screenshots of all
  eight panels at 390 were reviewed, not just measured — which is how the Library search
  truncation, the duplicated lede, and the palette's close-over-input were caught.
- **Regression cover:** five parameterized unit tests assert each panel answers to the name
  its drawer row promised. The *framing* half is deliberately not in that tier — jsdom has
  no layout, so asserting geometry there would assert nothing. It lives in the Playwright
  measurement above.
- **UNVERIFIED, not claimed:** real touch and iOS Safari. In particular `pointer: coarse` is
  exercised through Chromium's emulation, not a device, and the `dvh` cap's behaviour as
  Safari's URL bar collapses remains open — both tracked in #1216 with the two other
  claims that pass owed.
