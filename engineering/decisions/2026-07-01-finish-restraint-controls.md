---
status: proposed
summary: A finish can OVERPOWER content — too intense, or covering the area behind the text. This adds three composable, opt-in author controls to restrain it, and elevates a concept to make them clean: the BACKDROP LAYER. Today "backdrop" and "finish" are used interchangeably; this tightens the vocabulary — the BACKDROP is the independent layer painted behind content, and a FINISH is a treatment (atrium/halo/…) composited onto it. The controls live on the LAYER, not on any preset. Architecturally: emit a dedicated `.backdrop` wrapper element per section (behind content) and move the finish compositor onto it (`--fin-*` slots unchanged — the presets keep setting them on the section, the wrapper inherits). The wrapper is what makes the controls possible — (1) STRENGTH is a plain `opacity` on `.backdrop` (dims wash+texture+mark+edge uniformly, cannot touch text; no `calc()` in `color-mix()`, no per-preset rewrite); (2) CLEARANCE and (3) SPOTLIGHT are the SAME single `var(--bg)` overlay child (`.backdrop-mask`) shaped differently — clearance clears the content box, spotlight reveals one window — and because the overlay sits above the wrapper's mark/edge pseudos it covers the WHOLE finish (the earlier field-only "ghost-mark leak" is gone). All three opt-in and compose. Author surface: a NEW nested front-matter map `backdrop:` (`strength` 0–1, `clearance: on`, `spotlight` position+size) — `finish:` is UNCHANGED (still the scalar preset selector), so nothing existing breaks. `backdrop:` is the FIRST nested front-matter key; read by a targeted one-level nested-block parser (NO YAML dependency — the pipeline is deliberately flat) and offered by the editor's autocomplete; plus a Deck-setup drawer row each (slider / toggle / joystick+slider, reusing the shipped `Joystick`/`ui/slider`). Load-bearing constraints preserved: palette-blind (`var(--accent)`/`var(--bg)` only), NO `mask-image` (the mask is a bg-color radial), the RICH(screen)/OPAQUE(export) dual-variant (feather on screen, HARD edge on export — a feathered edge grays in PDF), no hex/margin. Prototype-validated in BOTH faces (`.scratch/finish-proto/`): `opacity` dims cleanly in the vector PDF, the hard-edged overlay bakes without banding, the mask hides the mark in export too. Moving mark/edge off the section pseudos also FREES `section::after` (today contended by the pagination marker — the likely-broken vignette edges on halo/ledger/nimbus/gallery), a bonus bug-fix. Structural change spanning all THREE render paths (markdown-it plugin, runtime, emulator) and ALTERING EXPORTED BYTES → requires export sign-off before merge. Supersedes the `section.finish` compositor host in `2026-06-30-finish-the-surface-layer.md` (the layer model and `--fin-*` slots are unchanged; only their HOST element moves).
---

# The backdrop layer — restraining a finish (strength · clearance · spotlight)

**Status:** proposed 2026-07-01. Design-before-code for a structural change;
prototype-validated. Implementation staged into slices (§9), each its own PR.

## 1. The problem

A finish is a stack of palette-blind gradient layers painted *behind* slide
content (`2026-06-30-finish-the-surface-layer.md`): a wash, a texture, a placed
mark (ghost glyph), an edge (vignette). At full strength — or when the layers
cover the area right behind the body text — the finish **competes with the
words**. There is no author control today to pull it back: intensity is baked
per-layer into each preset's `color-mix(var(--accent) N%, …)` stops, and nothing
restricts *where* the finish shows.

Two orthogonal failure modes, and one composable answer each:

- **Too intense** → a **strength** dial (dim the whole finish).
- **Covers the content** → restrict *where* it shows: a **clearance** zone
  (recede behind the text box) or a **spotlight** (show the finish in one
  deliberate window).

All three are **opt-in options** and **compose** — an author can dim *and* mask.

**The concept that makes them clean — the BACKDROP LAYER.** Today "backdrop" and
"finish" are used interchangeably (`resolve-finish.js` even defines `finish:` as
selecting "the backdrop"). This tightens the vocabulary:

- **Backdrop** = the independent layer painted *behind* content (a real element).
- **Finish** = a treatment (atrium/halo/…) composited *onto* the backdrop.

The three controls belong to the **layer**, not to any preset: one `strength`
dial / one `spotlight` modulates whatever finish is on the backdrop, uniformly.
The presets define the *look*; the backdrop controls *restrain* it. (The backdrop
currently hosts only the finish; generalizing it to other backdrop content — a
cover image, a plain tint — is a future possibility this design leaves open, not
in scope.)

## 2. The load-bearing constraint (why this isn't trivial)

The finish has two faces (`base.finish.css` header): **RICH** (screen — alpha
fades allowed) and **OPAQUE** (export — alpha AREA-fades are banned because
poppler/Ghostscript interpolate them toward transparent-black → a muddy gray
cloud; a guarded "opaque flip" repoints every slot to an accent-into-`var(--bg)`
mirror under `@media print` + `:where(.lattice-exporting)`). Also load-bearing:
palette-blind (`#3`), **no `mask-image`** (drops in Apple PDFKit), no hex, no
margin (`#20`). Any new control must honor BOTH faces.

## 3. The architectural decision — a `.backdrop` wrapper element

Today the finish is spread across four mechanisms on the section:
`section.finish { background-image }` (wash+texture), `::before` (mark),
`::after` (edge), `box-shadow` (frame). There is **no single surface** a control
can reach, `::before`/`::after` are already consumed (and `::after` is contended
by the pagination marker), and a plain `opacity` on the section would dim the
*content* too (content is a section child).

**Decision:** emit a dedicated backdrop wrapper per section — `<div
class="backdrop" aria-hidden="true"></div>` as the FIRST child, materialized
whenever a `finish:` OR a `backdrop:` control is present — and move the compositor
onto it:

```
section.finish                        ← still carries the --fin-* preset vars (inherited down)
  > .backdrop   (position:absolute; inset:0; z-index:0; opacity:var(--backdrop-strength,1))
       background-image: texture, wash          (the finish treatment)
       ::before   → the mark
       ::after    → the edge
     > .backdrop-mask  (z above ::before/::after)  background: var(--backdrop-mask, none)
  > …content…     (z-index:1, painted above the backdrop)
```

The finish presets are **unchanged** — they keep setting `--fin-*` on the
section; the wrapper inherits them. Only the compositor's *host selectors* move
(`section.finish` → `section.finish > .backdrop`), plus two additions on the
layer: `opacity` and the `.backdrop-mask` overlay child.

This one change unlocks all three controls cleanly:

| Control | Mechanism | Notes |
|---|---|---|
| **Strength** | `opacity: var(--backdrop-strength, 1)` on `.backdrop` | uniform across wash+texture+mark+edge; cannot touch text; **no `calc()` in `color-mix()`, no per-preset rewrite** |
| **Clearance** | `.backdrop-mask` = `var(--bg)` radial that clears the content box | opt-in; finish stays at the margins |
| **Spotlight** | `.backdrop-mask` = `var(--bg)` radial that reveals one window | joystick = center, slider = radius; covers the mark too |

## 4. The mask is a background-color overlay, not `mask-image`

`.backdrop-mask` paints `var(--bg)` OVER the finish to hide it, transparent where
the finish should show. This is the "background color as a mask" idea, done with
a pure gradient (so the `mask-image` ban holds). It needs its own dual-variant:

- **Screen (RICH):** the reveal edge may **feather** (`… transparent → var(--bg)`
  over a band).
- **Export (OPAQUE):** the edge must be **HARD** (a single stop) — a feather is
  an alpha area-fade → gray in PDF. Prototype confirmed a hard radial stop bakes
  crisp with no banding.

Because the overlay sits ABOVE the wrapper's `::before` mark and `::after` edge,
it covers the WHOLE finish — resolving the field-only "ghost-mark leak" that a
section-background mask suffered (see §7, F4).

## 5. Author surface — a nested `backdrop:` map + Deck-setup UI

The controls live under a NEW top-level key `backdrop:` (a one-level map).
`finish:` is **UNCHANGED** — it stays the scalar preset selector, so no existing
deck breaks and its parsing is untouched:

```yaml
finish: atrium          # UNCHANGED — the treatment (scalar)
backdrop:               # NEW — controls on the backdrop layer
  strength: 0.6         # 0–1 — dim the whole finish (default 1)
  clearance: on         # keep the finish clear of the content (default off, opt-in)
  spotlight: 84 30 40   # x% y% radius% — a reveal window (power-user)
```

| Front-matter | Values | Deck-setup drawer control |
|---|---|---|
| `finish:` *(existing)* | a registered preset (or `none`) | the existing **Finish picker** |
| `backdrop.strength` | `0`–`1` (default `1`) | a **slider** |
| `backdrop.clearance` | `on` \| `off` (default `off`, opt-in) | a **toggle** |
| `backdrop.spotlight` | `x% y% radius%` (power-user; behind the first two) | a **joystick + slider** |

**Parsing — a targeted nested-block reader, NOT a YAML dependency.** The pipeline
deliberately parses FLAT front matter (`lib/engine/directives.js` `parseFrontMatter`:
*"Marp's front matter is a flat key: value map; we parse that shape directly rather
than"* pull a YAML lib). Rather than reverse that (a `js-yaml` dependency that must
also bundle to the browser), add a small reader that resolves ONE level of indented
sub-keys under a known parent (`backdrop:`) — preserving the no-dependency,
deterministic, browser-safe invariant. Shared across all three render paths +
`deck-config` + lint. **`backdrop:` is the FIRST nested front-matter key in
Lattice** — a deliberate precedent (`mode:`/`logo:` may nest the same way later).
`finish:` stays flat, so the finish reader is not touched.

The controls reuse the shipped `docs/src/components/studio/Joystick.tsx` and
`docs/src/components/ui/slider.tsx`, and the standard `deck-config.js`
`FIELD_DEFAULTS` + `EMIT_ORDER` + drawer-row wiring (adapted to the nested block).
Values propagate as `--backdrop-strength` / `--backdrop-mask` custom properties
(or a `backdrop-clear` class) on the section across all three render paths — the
same deck-class propagation `finish:`/`mode:` already use. With no finish and no
`backdrop:` (and per-slide `finish-none`), the axes zero out and no wrapper is
emitted (F11).

**Autocomplete (Drawing Board editor).** The editor already completes flat
front-matter keys; this extends it to NESTED completion — once the cursor is
indented under `backdrop:`, it offers the axes (`strength`, `clearance`,
`spotlight`) and their value hints, from the same deterministic vocab the linter
uses. Context-aware nested completion is a real addition, tracked in the slices.

## 6. Prototype evidence (`.scratch/finish-proto/`)

Two throwaway prototypes rendered in BOTH faces (screen PNG + print-to-PDF):

- **`proto.html`** (section-host): proved `calc()` in `color-mix()` *does*
  survive the Chromium PDF (strength dimmed in export), the clearance zone bakes
  clean, AND the ghost mark LEAKS outside a section-background mask (field-only
  limit made visible).
- **`proto2.html`** (wrapper-host): proved `opacity` on the wrapper dims the
  whole finish cleanly in the PDF (no gray), the single overlay HIDES the mark
  outside the window in export too (leak fixed), and the clearance zone works on
  the wrapper. This is the recommended architecture.

## 7. Red-team findings folded in (independent checker)

An independent checker red-teamed the design against source. The backdrop
wrapper resolves or neutralizes the blockers:

- **F1/F2/F3 (no chokepoint; a `--strength` via `calc()` needs a 9-preset ×
  2-face rewrite and a single invalid value blanks the field):** the wrapper's
  `opacity` sidesteps all of it — one property, no `calc()`, no preset rewrite,
  no invalid-color-blanks-the-layer failure.
- **F4/F5 (a bg mask can't cover the mark/edge; `::before`/`::after` taken;
  `::after` contended by pagination):** the wrapper OWNS its own pseudos, so the
  overlay covers mark+edge, AND the section `::after` is freed — a bonus fix for
  the likely-broken vignette edges on halo/ledger/nimbus/gallery.
- **F6 (mask needs a hard-edged opaque mirror):** accepted — §4.
- **F8 (`calc`-in-`color-mix` unverified on WebKit):** made MOOT — `opacity`
  replaces the calc lever.
- **F9/F10 (a manual spotlight doesn't track content; the inversion is the real
  fix):** honored by shipping the **clearance** zone as the recommended fix and
  the spotlight as an explicit power-user option — the author chose to keep all
  three as options, clearance opt-in.
- **F11/F12/F14 (zero the slots with no finish/backdrop; joystick disambiguation
  with the existing wash/mark joysticks; a gate for face-parity of the new
  slots):** carried into the implementation slices (§9).

## 8. Risks / trade-offs

- **Structural DOM change across all three render paths** (markdown-it plugin,
  runtime, emulator) — higher blast radius than CSS-only. Mitigated by the
  existing deck-class-propagation pattern and a shared kernel (`#1`).
- **Alters exported bytes** → **export sign-off is required** before merge
  (render a representative deck in dark + light, both export engines: CLI
  vector-PDF and Studio html-to-image raster).
- **`base.finish.css` migration** — selector move + the two additions; the preset
  bodies are untouched. Needs a visual regression pass over all 9 presets.
- **Vocabulary tightening** — "backdrop" (layer) vs "finish" (treatment) must be
  applied consistently where the two are used interchangeably today
  (`resolve-finish.js` prose, the Finish picker's "backdrop" copy).
- **New gates** — a `check-ownership` face-parity check for `--backdrop-mask` /
  `--backdrop-mask-opaque` so the mirror can't rot (F14).

## 9. Implementation slices (each its own PR, HARD #17)

1. ✅ **Backdrop wrapper migration (engine).** Emit `.backdrop` in all three paths
   (materialize on a finish/backdrop); move the compositor onto it; keep presets
   setting `--fin-*` on the section. Visual regression over all presets. *Frees
   `section::after` — verify/repair the vignette edges (F5).* **Export sign-off.**
   *(shipped #674)*
2. ✅ **Nested-block reader + strength.** The one-level nested reader for `backdrop:`,
   shared across the render paths + `deck-config` + lint; then `opacity:
   var(--backdrop-strength,1)` + the `backdrop.strength` axis + Deck-setup slider +
   the editor's nested autocomplete. *(shipped #674)*
3. ✅ **Clearance.** `.backdrop-mask` zone gradient (rich+opaque) + `backdrop.clearance`
   axis + drawer toggle + autocomplete. Opt-in. *(shipped: `backdrop-clear` class →
   `section.finish.backdrop-clear` sets `--backdrop-mask` to a `var(--bg)` central
   ellipse, feathered on screen / hard-edged in the opaque flip; parsed by
   `backdropClasses`, propagated as a deck class across all three paths, with the
   Deck-setup toggle + autocomplete + a `backdrop-clearance-value` lint check.
   Validated in both faces.)*
4. **Spotlight.** `.backdrop-mask` window gradient + `backdrop.spotlight` axis
   (joystick+slider), face-parity gate, joystick disambiguation (F12).
5. **Docs + demo deck** (`examples/`), CHANGELOG, gate wiring, vocabulary pass.

## 10. Open questions

- **`backdrop.spotlight` grammar** — a space-separated triple `x% y% radius%` (e.g.
  `backdrop.spotlight: 84 30 40`) vs a named window (`top-right`). Resolve in slice 4.
- **Strength scope** — deck-wide only, or also a per-slide hook?
- **Clearance shape** — derive from the actual content box geometry (measured) or a
  fixed safe-margin approximation? Start with the approximation; measure later if
  needed.
- **Backdrop generalization** — the layer currently hosts only the finish; whether
  a cover image / plain tint later shares the same `backdrop:` controls is left
  open (not this work).
