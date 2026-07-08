---
status: in-progress
summary: Consolidate the Studio chrome onto ONE left activity bar — the single launcher for every panel, with each panel docking beside it on the left (VSCode activity-bar → sidebar). Assistants (Architect) top, the two settings scopes (Slide/Deck) mid, globals foot; grouped exclusivity keeps coach + settings independent; one collapse rule (click = show, click again = gone); resizable side panels. Retires the five-affordance collapse sprawl and the Architect's homeless top-bar toggle.
---

# Studio chrome: a left activity bar + co-located panels

**Date:** 2026-07-06
**Status:** Accepted — build in progress (`claude/studio-settings-panel-redesign-rdfu8u`)
**Supersedes the chrome/toggle surface of:** the settings-panel "Spine" redesign
(#771/#773), the scope-rail width toggle (#773/#782).

---

## Context

The Studio chrome accreted a real anti-pattern: opening or closing the settings
Inspector alone has **five** affordances — the scope-rail Slide/Deck buttons, the
rail collapse chevron, the 72⇄48 rail width toggle, and two in-panel echo
chevrons — plus a *separate* top-bar toggle for the Architect. There is no single
mental model for "show/hide a panel," and every panel type behaves differently.

Separately, the Architect (AI coach) lives as a lone top-bar toggle with no home
that scales: the moment a second assistant-class view exists (a comments view, a
second AI mode, a version timeline), it becomes another top-bar button and the
clutter compounds.

We are **pre-GA**. There are no shipped users to protect, so migration-timing and
change-fatigue are not constraints here; the bar to clear is *"is this the right
design, built to a no-broken-windows standard,"* not *"is it safe to change now."*

## Decision

Introduce a **left activity bar** as the single launcher for the Studio's panels,
with panels **co-located** with their launchers, one collapse rule, and resizable
side panels.

### Layout (desktop)

```
[ activity bar 52px ] [ Architect ] [ Settings ] [ editor ] [ preview ]
   Assistants (top)      resizable      resizable
   Settings  (mid)       toggle=gone    toggle=gone
   Globals   (foot)
```

**ONE bar.** Every panel launches from the single left activity bar, and every
panel docks **on the left, next to the bar** — VSCode's activity-bar → sidebar
model. There is no second (right) rail; every launcher and its panel are
co-located on the left, so nothing reaches across the screen. The preview stays
always-visible on the right; settings changes still show live there (it is not
adjacent, but "preview is sacred" is about presence, not adjacency).

- **Left activity bar** — the single VSCode-familiar spine:
  - **Assistants group (top):** Architect today; future peers join here.
  - **Settings group (middle):** Slide and Deck — the two settings scopes, as two
    bar icons (the old right-rail scope switch, folded onto the one bar).
  - **Globals group (foot):** Library, Workspace settings, account — these open
    dialogs, not a docked panel, so they sit outside the panel-exclusivity model.
- **Architect panel** — docks left next to the bar, **resizable** (drag handle,
  min width, persisted), **toggle-off = gone** (its bar icon is the way back).
- **Settings inspector** — docks left too, immediately right of the Architect when
  both are open, **resizable**, **toggle-off = gone**. It is **one** column whose
  scope swaps Slide⟷Deck; the two bar icons open / switch / close it.
- **Editor / Preview** — unchanged; they are always present and collapse to a
  **labeled rail** (a panel earns a rail stub only if it has no icon to summon it).
- **One collapse rule per panel:** click a panel's launcher to toggle it; a closed
  optional panel is *absent* (0 width), not a rail stub. Clicking the active
  settings-scope icon closes the panel; clicking the other switches scope in place.

### Panel-exclusivity model (grouped toggles)

- **Within a group** → one panel at a time (mutually exclusive).
- **Across groups** → independent (the Architect can be open *with* a settings
  scope — the coach↔tune loop is preserved).
- Settings is **one** inspector whose scope swaps Slide⟷Deck on a single,
  continuously-mounted panel with one persistent `role="status"` live region.

### State model

Two independent, nullable, per-group slots (NOT one global `activePanel`, which
would re-make Architect and Settings mutually exclusive):

- `activeAssistant: 'architect' | null`
- `activeSettings: 'slide' | 'deck' | null` (merges the old `inspectorOpen` +
  `inspectorScope`, making the illegal "open with no scope" state unrepresentable)

Globals stay plain dialog booleans.

## Why (over the cheaper alternatives)

Two alternatives were weighed and rejected **for a pre-GA, no-compromise product**:

1. **Fix the collapse sprawl in place, no bar.** Captures ~80% of the collapse-model
   hygiene at low risk — but leaves the Architect homeless and does not scale to
   more assistants. Rejected: it is the incremental floor, not the ceiling.
2. **Pure VSCode with ONE mutually-exclusive sidebar (one view at a time).**
   Rejected: forcing coach + settings to share a single slot breaks the coach↔tune
   loop. We keep the *left-docking* of VSCode but allow **two** independent left
   panels (one assistant + one settings scope), so concurrency survives.

An earlier iteration of this design kept **Settings on the right** by the preview
(tune→judge adjacency) with a slim right scope rail. On seeing the prototype the
call was made to **consolidate to a single bar** — two flanking rails read as "we
didn't actually consolidate," and a right rail reintroduces the left-launcher →
right-panel reach we set out to remove. Settings now docks left with everything
else; the preview's always-on presence keeps changes visible.

The chosen design keeps the coach↔settings concurrency and the single-side inspector
the reviews defended, adds the single collapse model, and gives assistants a home
that scales — with every control next to what it opens.

## Adversarial review → acceptance criteria (no-broken-windows)

Two full rounds of red-team + inversion + independent-checker ran on this design.
Their findings are not reasons to defer; they are the **spec for building it right**.
Each is a merge-gating acceptance criterion:

- **The layout never breaks at any width.** A permanent 52px bar + BOTH left panels
  overflows the 1100px desktop worst case (`52 + 232 (Architect) + 296 (Settings) +
  editor-min 240 + 1 + preview-min 280 = 1101 > 1100`, and reopens the #721 zero-void
  band). With both panels now on the *same* (left) side the squeeze is sharper, so the
  narrow-desktop fold must be generalized: below the both-open threshold the panels
  auto-narrow to their mins and then the lower-priority panel demotes to an
  overlay/sheet before anything clips. Gated by a Playwright assertion at 1100px with
  both panels open: no horizontal overflow, preview ≥ its min.
- **No coach-reply data loss.** `ArchitectChat` holds `messages`/`busy`/`input`
  in component-local state, so closing it (or switching the Coach/Chat tab) mid-request
  drops the in-flight reply — a live bug today, and one the bar would exercise more.
  Keep the chat mounted (visibility-toggle) or lift its state; add an in-flight cue
  before a close discards work.
- **First run is self-evident.** The bar carries persistent group labels/dividers
  (not hover-only tooltips, which don't fire on touch) and a one-time coach-mark tour;
  the first-edit pulse retargets onto the bar; welcome copy is resynced. A newcomer
  never faces unlabeled mystery glyphs.
- **The grouped exclusivity reads as designed, not random.** Groups are visually
  separated so "these swap, that one is independent" is legible before it's triggered.
- **Everything moves in one change.** Chrome renames reconcile the `CHROME`
  selector-contract map (`docs/e2e/studio-fixture.ts`), the Vetrina demo selectors
  + coexistence beats, the unit tests, and the `@visual` baselines — the #780 lesson.
- **Verified on the real Studio** at 1440 / 820 / 390, light + dark (HARD RULE #23),
  through maker-checker (HARD RULE #25) given the blast radius.

## What we keep from today (do not rebuild)

- The single Inspector column + scope enum + one persistent live region.
- Independent Architect/Settings open state (now per-group slots).
- Preview always visible ("preview is sacred").
- The `splitTracks` single source of truth for grid tracks; the deck inspector's
  internal pill-tabs (do NOT tab it "one group at a time").
- Focus mode's "hide the panels" posture (extended: decide the bar's role in focus).

## Tablet / mobile

Unchanged model: the panels remain sheets; the activity-bar icons ride the existing
pane bar. The bar is a desktop construct.
