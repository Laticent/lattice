---
status: shipped
summary: The browser runtime (dist/lattice-runtime.js) was Form-BLIND — it never stamped the `form` class the engine adds at render time, so masthead-lift and the progress/watermark Tiles (all keyed on `section.form`) were permanently inert whenever a deck rendered through Marp rather than the owned engine (the marp-vscode preview, and the export-to-Marp bundle's HTML opened in a browser). It also never stamped `data-lattice-slide`, which those Tiles + the overflow probe scope on. Fix: the runtime now reproduces the render-time Form default on the live DOM via a shared kernel (lib/forms/form-default.js) that reuses the engine's `formToggleClass` — so the sovereign-frame skip set and the `form`/`no-form` opt-outs stay single-sourced across all three render paths (HARD RULE #1). Deliberately front-matter-blind: Marp strips YAML and the webview can't fetch the source, so the deck-wide `form: off` opt-out stays a render-time (engine/CLI) key. Adversarially validated (red team + Munger inversion + independent checker) before implementation.
---

# The runtime enables Form by default

**Date:** 2026-07-08
**Status:** shipped
**Branch:** `claude/lattice-runtime-form-support-s39jxz`

## The defect

Form has been the default composition model since 2026-06-26
(`design/forms.md` §10): an absent `form:` key resolves to `standard`, and the
engine stamps the `form` class on every eligible top-level slide at render time
(`applyFormToggleToHtml` → `readFormMode`/`formToggleClass`,
`lib/integrations/markdown-it/plugins.js`). Everything downstream — the
masthead-lift band, the progress rail, the watermark glyph — keys on that
`section.form` class.

The **browser runtime** (`lib/runtime/index.js` → `dist/lattice-runtime.js`),
one of the three render paths, never learned any of this. It consumes an
already-rendered DOM, and when that DOM is produced by **Marp** (which runs none
of our render-time plugins) rather than the owned engine, no section ever carries
`form`. So in the exact scenario the runtime exists to serve —

- the **marp-vscode preview**, and
- the **export-to-Marp bundle's** HTML opened in a browser
  (`lib/core/marp-bundle.js` ships `lattice.css` + the runtime + a theme; the
  bundle is deliberately engine-less),

— the entire Form chrome layer was dead:

| Transform | Gate | Result in a raw Marp deck |
|---|---|---|
| `masthead-lift` (`lib/transformers/masthead-lift.js`) | `section.form` | no `.cell-masthead` / bay / `.cell-stage` / `.cell-footer` |
| progress Tile | `section.form` + `section[data-lattice-slide]` | no section rail |
| watermark Tile | `form` + `watermark` + `[data-lattice-slide]` | no watermark glyph |
| meta Tile | `.cell-masthead .masthead-bay` | `meta:` had no bay to dock into |

Compounding it: the Tiles and the overflow probe scope on
`section[data-lattice-slide]`, an attribute the **emulator** stamps
(`lattice-emulator.js`) but the engine, the runtime, and Marp do not — so even a
hand-added `form` class wouldn't have revived the rail/watermark in a raw deck.

This was also a standing **HARD RULE #1** breach: a published HTML deck that
embeds the runtime rendered a structurally different DOM than the engine export of
the same source.

## Options weighed

1. **Config engine plugin** — wire the plugin kernel into a marp-cli
   `marp.config.cjs` `engine`. Rejected as the primary fix: Lattice's own
   marp-cli render path is retired (`lib/engine/index.js`), the export bundle is
   deliberately engine-less (bundling the kernel contradicts its design), and
   marp-vscode ignores `marp.config.*` entirely (it is CLI-only) — so this
   reaches none of the surfaces that were broken.
2. **Fetch a `form:` reader into the runtime** — mirror
   `applyDeckClassFromFrontMatter`. Rejected: `fetch` is blocked in the
   `vscode-webview://` sandbox (the primary target), so it would no-op exactly
   where it's needed while looking "fixed" in a `file://` demo.
3. **DOM default in the runtime (chosen)** — stamp the default from the DOM,
   fetch-free, reusing the shared kernel.

## Decision

The runtime reproduces the render-time Form default on the live DOM, through a
new shared kernel `lib/forms/form-default.js` (`applyFormDefaultToDom`), run first
in `runAllContentTransforms` (before masthead-lift) so every later pass sees the
class. Per eligible **top-level** slide (`section:not(section section)` — a
literal `<section>` in slide content is never touched):

1. **`data-lattice-slide`** is stamped (in document order, never overwriting an
   existing value) so the Form Tiles + the overflow probe have slides to scope on.
   Safe: `lattice.css` styles `[data-lattice-slide]` only under the fluid-viewer
   root (`:root[data-lattice-view="fluid"]`), which this path never sets.
2. **`form`** is appended via the engine's own `formToggleClass`, so the
   sovereign-frame skip set (title/divider/closing/image/math/split-*/compare-code)
   and the per-slide `form`/`no-form` opt-outs are honored **one way** across all
   three paths — no hand-copied third implementation. The module is browser-safe
   (the docs playground already bundles the plugin kernel).

The progress + watermark Tile dispatch also moved into `runAllContentTransforms`
(after masthead-lift builds the cells) so they re-fire idempotently on every
preview edit, not once at boot.

Per-section + idempotent by construction: `formToggleClass` returns the class
unchanged when a slide already opts in/out or is sovereign — so an export the
engine **already** formed (and which embeds the runtime) is untouched, and one
hand-tagged `_class: form` slide no longer suppresses the default on its siblings.

## Deliberate limitation

The runtime is **front-matter-blind**. Marp strips YAML from the DOM and the
webview can't fetch the source `.md`, so the **deck-wide `form: off` opt-out is
applied only on Lattice's own engine render paths** (the `lattice` CLI/emulator,
the docs playground). It is **not** honored on any *Marp-rendered* surface — the
marp-vscode preview, nor the **export-to-Marp bundle** (`lib/core/marp-bundle.js`
bakes the front-matter'd `.md` and defers rendering to the user's `marp`, which
never runs `applyFormToggleToHtml`). On those surfaces a fully-off deck still
composes Form. This affects only the rare fully-off deck on a secondary surface,
and was accepted explicitly (see the branch discussion): the alternative — reading
front matter — is impossible where it's needed (YAML stripped, fetch blocked).
Per-slide `no-form` and the sovereign frames — both DOM-visible — are honored
everywhere.

## Blast radius & verification

Tier-2 (all three render paths, a public runtime API). Validated with the
adversarial trio **before** implementation — a red team (mapped the full
chrome-layer outage + the fix-traps: fetch no-ops in the webview, once-only Tile
dispatch, the fs-only skip set, double-stamping exports), a Munger inversion (which
reframed the fix away from a config plugin / fetch reader), and an independent
checker (drove real headless Chromium: the old runtime produced **0** masthead
bands on a Form-default deck vs. the engine's full bands).

Post-fix verification on the real surface (headless Chromium, built bundle loaded
as an external script over a raw-Marp DOM): a 7-slide deck yields `section.form`
on the 3 eligible content slides only (title/divider/closing correctly skipped),
3 `.cell-masthead` bands, 3 `.cell-stage` cells, the progress rail on the 3 form
slides, 2 watermark glyphs, and `data-lattice-slide` on all 7. Gates: `npm run
lint`, the full unit suite (3093 + 10 new), and `npm run build:check` all green.

## Files

- `lib/forms/form-default.js` — new shared DOM kernel (`applyFormDefaultToDom`).
- `lib/runtime/index.js` — calls it first in `runAllContentTransforms`; moved the
  progress/watermark Tile dispatch into the same pass.
- `test/unit/forms/form-default.test.js` — the regression guard (skip set,
  opt-outs, nested-section safety, numbering, idempotency).
- `design/forms.md` §10, `README.md` (Embed in a browser), `CHANGELOG.md`.
