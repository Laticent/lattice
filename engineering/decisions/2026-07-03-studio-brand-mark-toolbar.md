---
status: shipped
summary: The Studio topbar rendered the brand as a text "L" tile (the only surface not using the real mark), hid the workspace launcher's dropdown chevron on phones (the menu read as a static logo), starved the deck title at a fixed 150px, and duplicated "New deck" across two adjacent menus. This swaps in the real Spectrum Cell mark — inlined so its colors follow the Studio's own data-mode, not the OS scheme — makes the launcher chevron always visible, and dedupes deck CRUD into the switcher. On phones, the four deck actions (Present, Share, Architect, Inspector) move from the header to the previously half-empty Edit/Preview pane bar — still one tap, so the 2026-06-30 "deliverable verbs and panel toggles never get buried" principle is preserved — and the header's reclaimed width goes to the deck title, which now flexes and shows whole. A red-team + independent-checker pass rejected the earlier proposal to fold those actions into ⋯; the two-row split (owner's idea) dissolved that tension entirely.
---

# Studio brand mark + the two-row phone toolbar

*2026-07-03 · status: shipped · red-teamed (inversion) + independent checker*

## Problem (user report, phone screenshot)

Four defects on the ~390px Studio bar:

1. **The brand was a text tile.** The topbar (and focus header) rendered a
   `bg-primary` square with the letter "L" — the only surface in the product
   that doesn't use the real mark (`SiteHeader.astro` renders
   `lattice-mark-min.svg` at 30px everywhere else).
2. **The launcher didn't read as a menu.** Its ChevronDown was `hidden sm:block`,
   so below 640px the workspace launcher looked like a static logo.
3. **The deck title was starved.** Capped at `max-w-[150px]` while a `flex-1`
   spacer absorbed the free width — the one piece of orientation ("what am I
   editing?") truncated at ~12 characters.
4. **Crowding:** 8 tap targets on a 390px bar, and the launcher + deck switcher
   both offered "New deck".

## Red team of the fold-everything proposal

The initial ask was to keep only [logo ▾][deck ▾][mode] and fold everything
else — Present, Share, Architect, Inspector — into ⋯. An inversion pass and a
blind independent checker both rejected the fold half:

- Ranked by what an editing session actually touches, the mode toggle is the
  least-used control on the bar (a set-once preference), while Inspector and
  Architect top the list — the proposal protected the sixth-ranked control by
  burying the top four.
- Architect/Inspector as menu items was already rejected in the 2026-06-30 IA:
  panel-open state (aria-pressed + tint) and the #635 first-edit pulse are
  invisible inside a closed menu.
- Share is the bar's only filled CTA; folding both verbs leaves a toolbar with
  no visible actions at the payoff moment.

An intermediate cut (fold mode + Present only) was built and **measured**: even
with those two slots freed, 390px left the title at ~"Welcome t…" — the header
alone cannot hold four actions and a readable title.

## Decision — the two-row split

The observation that resolved it (owner's): on phones the Edit/Preview **pane
bar is half empty**. So the phone layout becomes:

- **Row 1 (header):** `[mark ▾ launcher] [deck title — flexed, whole ▾] [mode] [⋯]`
- **Row 2 (pane bar):** `[Edit | Preview] … [issues pill / notes] [Present] [Share] [Architect] [Inspector]`

Every action stays one tap — nothing folds — and the header's width goes to the
deck title. The 2026-06-30 principles survive intact: verbs and panel toggles
never buried, mode stays a standalone 1-tap icon on compact, ⋯ membership
unchanged (Library, Workspace, Search, themes). Tablet (700–1099) and desktop
keep the single-row bar (they have no pane bar and no squeeze).

Supporting changes, all widths:

1. **Real mark, inlined** (`LatticeMark.tsx`). Not `<img src>`: the SVG file's
   dark variant rides `@media (prefers-color-scheme: dark)`, which follows the
   **OS** scheme — the Studio flips mode via its own `data-mode`, so an OS-light
   machine in Studio-dark would get navy bonds on a dark header. The inline copy
   keys bond/halo colors off the app's `mode` and mirrors
   `design/logo/generate.py` geometry 1:1. Used in the full topbar and the focus
   header; `aria-hidden`, the trigger keeps the "Workspace launcher" name.
2. **Chevron always visible** on the launcher trigger.
3. **Deck title flexes on phones.** The 150px cap is gone; the pill is the bar's
   one shrinkable item (all siblings `shrink-0`). `sm:` keeps the 260px cap.
4. **"New deck" dedupe:** deck CRUD (new/rename/delete) lives in the deck
   switcher; the launcher keeps app navigation (Decks, Fabricate) + Import.
   Merging the two menus was considered and rejected — different questions,
   and a merged menu is long and mixed-scope.
5. **Pane-bar extras are per-pane** so row 2 fits 390px: the issues pill shows
   with Edit (where you fix them), Speaker notes with Preview (Edit's own
   header already has Notes). The welcome-banner copy no longer says "above"
   (on phones the toggles sit below it).

Trade-offs accepted: on phones in the Fabricate view the deck actions are
absent (the pane bar belongs to compose) — Fabricate has its own chrome and
the deck verbs are not part of theme/component authoring. The row-2 actions
are icon-only (house style for tight widths).

## Desktop: banding, not a second bar

The owner asked whether the mobile principle (global row + deck row) should
extend to desktop. A second red-team + independent-checker pass rejected it:
the mobile row 2 pre-existed out of necessity and was half empty, while a
desktop second bar would be manufactured at the cost of ~44px of `100dvh`
canvas — the scarce desktop resource — to hold five controls on a 1440px
stripe, demoting Share off the Fitts-optimal top-right corner. The
"global vs deck" taxonomy also isn't crisp (the deck switcher, theme, mode,
Focus, and ⌘K all straddle it), and no comparable tool (Slides, Figma,
Keynote, VS Code) ships a global-row/document-verb-row split. What the
instinct DID catch: the desktop right cluster interleaved altitudes with only
one mid-group divider. Fix shipped: two desktop-only dividers band the
existing order — `[⌘K · Appearance] | [Present · Share] | [Focus · Architect
· Inspector] | [Library · Workspace · avatar]` — zero relocation, zero
vertical cost. Revisit a true second bar only if the desktop row grows past
~15 persistent controls or the Tauri shell changes the vertical budget.

## Verification

- Unit: `StudioShell.test.tsx` "topbar information architecture" suite extended
  (mobile two-row membership via the `Deck actions` toolbar role, tablet ⋯
  unchanged + no duplicate mode row, launcher/switcher dedupe);
  `studio.controls.test.tsx` New-deck flow repointed at the switcher.
- Visual: puppeteer captures at 390 / 820 / 1440, light + dark, including the
  mark-on-dark-header case, the open ⋯ menu, and the open launcher at 390px —
  the full "Welcome to Lattice" title renders on the 390px bar.
