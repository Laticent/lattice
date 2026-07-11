---
status: proposed
summary: >
  A first-class deck-wide `color-mode:` front-matter key — light | dark | system | inherited —
  that EVERY surface respects (the engine render, the CLI emulator, the runtime, the Playground
  and Studio previews + their settings drawers, and the exported HTML player). Supersedes the
  overloaded `class: dark`/`class: light` color axis (kept as a deprecated alias). `light`/`dark`
  PIN the deck's mode as document fidelity; `system` follows the receiver's OS
  (`prefers-color-scheme`); `inherited` adopts the host container's mode (the site/Studio toggle
  when embedded, the OS when standalone). Resolves through ONE new register (resolve-color-mode.js)
  into the existing section-class → `color-scheme` → `light-dark()` machinery, so most surfaces
  inherit it for free; the handful outside that kernel (emulator player scheme, resolveDeckTheme,
  the two settings drawers, the linter) get explicit edits. Builds on the player color-mode
  fidelity of #897 (2026-07-07-html-lattice-player.md addendum).
version: 1
supersedes: none
extends: 2026-07-07-html-lattice-player.md
last-status-update: 2026-07-11
---

# A first-class `color-mode:` front-matter key — light / dark / system / inherited

**Date:** 2026-07-11 · **Status:** design-decision (proposed) · **Owner:** Sharmarke

> Builds directly on **#897** (the [`2026-07-07-html-lattice-player.md`](2026-07-07-html-lattice-player.md)
> color-mode-fidelity addendum), which made the *exported player* open in the mode it was authored
> for. This note generalizes that from "the player" to "the whole engine": one deck-wide key that
> every rendering + authoring surface honors, plus the `system`/`inherited` values the player work
> didn't reach.

---

## The problem

Color mode is authored today through an **overloaded, indirect** channel: the `class: dark` /
`class: light` deck-wide token axis (+ `-dark` theme names + a hand-written
`style: ":root{color-scheme:dark}"` escape hatch). Three deficiencies:

1. **No first-class key.** `class:` is a general token bag (it also carries `finish`, arbitrary
   component classes). Color mode riding inside it is undiscoverable and un-typo-checkable —
   `class: darrk` is silently ignored.
2. **No `system` and no `inherited`.** The axis has exactly two values. An author can't say "defer
   to the receiver's OS" or "adopt whatever the host surface is showing."
3. **Surfaces disagree.** The Studio preview honors a deck's `class: dark` pin; the Playground
   preview ignores it and follows only the site's own toggle; the exported player (pre-#897)
   ignored both and followed the OS. No single authored value that all surfaces obey.

## The model — four values, one intent each

`color-mode: light | dark | system | inherited`, authored deck-wide in front matter. Each value is
an **intent**; every surface implements that intent in its own idiom.

| Value | Intent | Embedded surface (site / Studio / Playground / app — has a host toggle) | Standalone exported `.html` player (no host) | Static export (PDF / PPTX / PNG — no runtime) |
|---|---|---|---|---|
| **light** | pin light | opens light; viewer toggle still overrides their session | opens light | rendered light |
| **dark** | pin dark | opens dark; viewer toggle still overrides | opens dark | rendered dark |
| **system** | follow the OS | follows `prefers-color-scheme`, ignoring the host toggle | follows the OS (the #897 mechanism) | light (no OS to read at export) |
| **inherited** | follow the host container | adopts the host's current mode (the site/Studio/app light-dark toggle) | *no host* → follows the OS (≡ system here) | light (no host at export) |

The clean distinction: **`system` always follows the OS; `inherited` follows whatever contains the
deck** — the host chrome when embedded, and (having nothing above it) the OS when standalone. They
diverge only *inside* a host, which is exactly where `inherited` earns its keep: a deck dropped into
the docs site takes the site's mode instead of imposing its own.

**Unset (`color-mode:` absent) = the theme's own default** — a plain light theme opens light, a
`-dark` theme opens dark. This preserves the "respect the sender, no surprise-dark" rule from #897.
`inherited` is an *explicit opt-in* to follow the host, never the silent default. (In a preview a
deck with no pin still tracks the site toggle as it does today — that's the preview surface's own
natural default, a dev affordance, not a deck-authored value.)

**Precedence, everywhere:** deck `color-mode:` sets the **default / initial** mode → a viewer's live
toggle overrides for their **session** → a per-slide `<!-- _class: dark|light -->` overrides that
**slide**.

## The mechanism (validated in Chromium, 2026-07-11)

Color mode already resolves through a proven chain: a `section.dark` / `section.light` class sets the
section's `color-scheme`, and the palette's `light-dark(L, D)` surface tokens pick a side from it.
`color-mode:` routes into that same chain, so the engine/runtime/emulator render bytes (→ PDF, PPTX,
PNG, HTML player) inherit it with no per-surface color code.

Per value, the CSS emitted:

- **light / dark** → the existing `section.light` / `section.dark` tokens (`color-scheme: light|dark`),
  stamped per-section. Robust: a direct declaration on the section beats inheritance — the fix #897
  relied on when it found an older engine repaints `:root` but doesn't re-propagate to deep sections.
- **system** → a new `section.color-system { color-scheme: light dark }` token — the section follows
  the OS, and the palette's `light-dark()` picks the side. (Same effect the CLI already got from a
  hand-written `color-scheme: light dark`.)
- **inherited** → `section.color-inherited { color-scheme: inherit }`, stamped per-section like the
  others. The section inherits its `color-scheme` from the **deck root**, and each surface already
  controls that root: the preview injects `:root{color-scheme:<site mode>}`, the player sets it via
  its `data-lp-scheme` JS, and a static export leaves the theme default (light). So one section rule
  covers all three intents without any root-level override. Spike (`inherited-spike2.html`,
  verified in Chromium): a `section.color-inherited` resolved `--bg` to the dark literal when the
  root was dark, the light literal when the root was light, and the light literal when no root scheme
  was injected (the static-export case) — `light-dark()` follows the inherited scheme in every case.

**The exported player is the one surface that does NOT use CSS `inherit` for `inherited`.** Per #897,
the player drives its mode off a concrete `data-lp-scheme` attribute stamped from `matchMedia`, never
CSS inheritance (the older in-app WebKit applied `matchMedia` but not `@media`/inherited repaints
reliably). In the standalone player there is no host to inherit from, so **`inherited` is baked as
`system`** — both follow the OS there. `inherited` and `system` therefore produce identical player
bytes; they differ only on the embedded surfaces, exactly as the model says.

## Migration — `color-mode:` supersedes the `class:` color axis

- `color-mode:` is the canonical, documented key.
- **`class: dark` / `class: light` keep working as a deprecated alias** (existing decks —
  `examples/color-mode.md`, any user deck — must not break). The linter emits an *info/deprecation*
  nudge pointing at `color-mode:`, not an error.
- **Per-slide `<!-- _class: dark|light -->` is unchanged** — it stays the per-slide override token
  (there is no per-slide `color-mode:`; front matter is deck-wide by definition).
- The shared token vocabulary stays single-sourced in `lib/core/color-mode.js`; the new
  `resolve-color-mode.js` register maps the four *key values* to those tokens / the root rule.

## Surfaces & the single source of truth

Normalize `color-mode:` in ONE place — a new `lib/core/resolve-color-mode.js` register — consumed by
the ONE propagation kernel `deckClassPropagate` (`lib/integrations/markdown-it/plugins.js`) and its
two mirrors (`lib/runtime/index.js`, the emulator's inlined reads), so every render surface inherits
it. Surfaces that sit *outside* that kernel get explicit, enumerated edits:

1. **Core** — `resolve-color-mode.js` (register) + `color-mode.js` (extend vocab) + `base.modifiers.css`
   (`section.color-system`; the inherited root rule).
2. **The three propagation kernels** — read `color-mode:`, map via the register, keep the deck-vs-slide
   override guard; honor the `class: dark/light` alias. HARD RULE #1: all three stay byte-aligned.
3. **CLI emulator** — the player `deckScheme` (#897) and the Mermaid `globalDark` read `color-mode:`
   (system → `light dark`; inherited → baked as system for the player); the `inherited` root rule is
   injected for the non-player renders.
4. **`docs/src/lib/deck-theme.ts` `resolveDeckTheme`** — read `color-mode:` as the pin source (today it
   reads only `class:` tokens + `-dark` theme), so the Studio preview + Share mode + the Playground
   preview all agree.
5. **Playground preview** — wire `drawing-board-render.js` through `resolveDeckTheme` so it honors the
   deck pin (today it follows only the site `data-mode`).
6. **The two settings drawers** — Studio `StudioShell` `setDeckColorMode` writes the `color-mode:` key
   (4-way light/dark/system/inherited) instead of `class:` tokens; the Playground `DeckSetupSheet`
   gains the same Appearance control (it has none today).
7. **Linter** — `findUnknownColorMode` (clone of `findUnknownMode`) + `colorModeNames` vocab; the
   deprecation nudge for `class: dark/light`.

## Phasing

- **P1 — core + kernels + emulator** (the render substance): the key resolves across engine, runtime,
  emulator; PDF/PPTX/PNG/player bytes honor it. Tests on the register + all three kernels.
- **P2 — docs-site surfaces**: `resolveDeckTheme`, the Playground-honors-pin fix, both settings drawers.
- **P3 — linter + docs + demo**: the lint check + deprecation nudge, `examples/color-mode.md` updated to
  the new key with a `system`/`inherited` slide, docs + `CHANGELOG`.

One feature → one PR (HARD RULE #17), committed in these slices. High blast radius (three mirrored
kernels + two UIs) → an independent checker on the diff before merge (HARD RULE #25, maker-checker).

## Non-goals

- No per-slide `color-mode:` (front matter is deck-wide; per-slide stays `_class: dark|light`).
- Not retiring `class:` — only its *color* axis migrates; `class:` keeps carrying finish/component
  tokens. The `dark`/`light` tokens themselves stay valid (the alias + per-slide use them).
- No change to the theme files' `light-dark()` authoring or the `-dark` theme variants.
