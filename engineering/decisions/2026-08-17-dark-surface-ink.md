---
status: shipped
summary: A title slide rendered with three bold words at 1.61:1 against a 3:1 floor — near-black ink on the dark navy bookend — reported from a real deck rather than an audit. Two independent causes, both the same shape - a value correct for one surface painted on another, with nothing able to notice. (1) The title/closing/divider bookends fill `--surface-inverse` without declaring `color-scheme: dark`, so every `light-dark()` token resolved to its light side and anything the base layer had not named explicitly inherited light-canvas ink; four hand-written per-element rebinds existed and bold text was never on that opt-in list. Fixed by declaring the scheme with the surface AND re-asserting it after the canvas registers, which outrank the component at equal specificity — the first cut missed that and still shipped 1.61:1 under `color-mode: light`. The split rails cannot be fixed this way at all: they are descendants, and light-dark() resolves where the property is declared, so they keep explicit on-dark inks. (2) On the CLI path `base.tokens.css`'s `--code-inline-fg: var(--accent)` was concatenated after the palette and beat the 8 themes that deepen that ink for a card, shipping 4.36:1; on the packing path the theme already won. Fixed by deriving the token — it is ink, and it had been falling back onto an area token held to the graphical floor, the `--cat-N-ink` shape — repaired against the chip's own wash rather than the bare card. Measured - accent-finishes goes 14 sub-AA runs to 0 across six palettes.
builds-on: 2026-06-08-inline-code-contrast.md, 2026-08-10-no-safe-default-token-contract.md, 2026-06-05-token-structure-audit.md
---

# Ink on a dark surface: declare the scheme with the surface, and don't let a default outrank a theme

A title slide rendered in light mode with three bold words all but invisible —
`spectrum`, `rule`, `eyebrow` at **1.61:1** against a 3:1 floor, near-black navy
ink painted on the dark navy bookend. Reported from a real deck
(`examples/accent-finishes.md`), not from an audit.

Two independent causes sat underneath it. Both had the same shape: a value that
was *correct for one surface* being painted on another, with nothing in the
system able to notice.

## Cause 1 — the bookends painted dark while declaring light

`section.title`, `section.closing` and `section.divider` fill
`var(--surface-inverse)`. None of them declared `color-scheme: dark`. Every
`light-dark()` token on those slides therefore resolved to its **light-canvas**
side, so anything the base layer had not explicitly named inherited
light-canvas ink onto a dark field.

This was known, and had been answered one element at a time. Before this change
there were four separate hand-written rebinds — the eyebrow, bookend tables, the
inline-code chip, and the status-stamp pseudo-element — each with its own
measurement in its own comment, each added after somebody noticed a bad slide:

| element | measured before its rebind |
|---|---|
| off-grammar eyebrow | 1.65:1 |
| bookend table body cells | 1.02:1 |
| bookend table column heads | 2.06:1 |
| divider lede | 1.02:1 |
| closing accent heading | 2.06:1 |
| **bold body text** | **1.61:1** ← the reported one, never on the list |

The list is **opt-in**, which is the defect. Every element nobody had thought of
yet was still broken, and the only detector was a human looking at a slide.

**Decision: the scheme travels with the surface.** `color-scheme: dark` is
declared in the same rule that paints `--surface-inverse`, in each bookend
component. `section.divider.light` replaces that canvas with `--bg`, so it puts
`color-scheme: light` back alongside it.

**That alone was not enough, and the reason is the same trap as Cause 2.**
`section.title` and `section.color-light` are both specificity (0,1,1), and the
bundle emits `base.modifiers.css` AFTER the component sheets — so every canvas
register (`light`, `color-light`, `color-system`, `color-inherited`) silently
outranked the component's own declaration. A deck carrying `color-mode: light`,
or a slide written `<!-- _class: title light -->`, still rendered bold body text
at **1.61:1** and a link at **1.20:1**. The first cut of this fix fell into the
identical equal-specificity/source-order trap it had just diagnosed one token
over, and shipped believing the class was closed.

So the scheme is **re-asserted after the registers**, in `base.modifiers.css`
below the whole `color-*` block. `.print` is excluded and must be: it remaps the
surface to the ink-on-white band, so the panel genuinely stops being dark.

**The rails are a different case, and cannot be fixed this way.**
`--surface-inverse` is painted in five places; the other two are
`split-panel .panel-left` / `.metric .panel-right` and
`split-compare .compare-left`. Those are DESCENDANTS, and `light-dark()` in a
custom property resolves at computed-value time *where the property is declared* —
the ink tokens are declared on `section`. Measured: giving a rail
`color-scheme: dark` changes its computed `colorScheme` and leaves the body ink at
**1.02:1**, unmoved. Rails therefore keep explicit `--on-dark-*` inks. This
asymmetry is the substance of the fix, not a caveat on it.

The four existing rebinds are **left in place and are still load-bearing** — not
belt-and-braces. Measured on `title color-light`, the code chip reads 9.80:1 only
because `section.title code { --code-inline-fg: var(--on-dark-primary) }` exists;
delete it and it falls to ~1.9:1. An earlier draft of this record called them
belt-and-braces and pre-authorised their removal, which would have been a
regression with the trigger written down.

### Why not keep the enumeration

Considered and rejected: complete the per-element list instead of flipping. It
cannot be completed — the set is "every inline treatment any component might
ever put on a bookend," and it grows with the component catalog. The rebinds
also each cost a measurement round to discover. Declaring the scheme once fixes
the class ON SECTIONS by construction — not everywhere, as the rails above show,
and not for free, as the register re-assertion shows. That is the same reasoning
`2026-06-08-inline-code-contrast.md` used when it chose a `currentColor` wash
over enumerating every panel fill.

## Cause 2 — an engine default silently outranked every theme

`base.tokens.css` declared `--code-inline-fg: var(--accent)`, and on the
**CLI/export path** that default beat the theme's own value.
`lattice-emulator.js` composes a render as `paletteCSS + '\n' + layoutCSS` — raw
palette first, engine bundle second, both declarations at the same specificity
where source order decides. `tools/check-ownership.js` already recorded exactly
this: *"the export bundle concatenates the theme BEFORE the base, so a default
there would win."*

**The mechanism is path-specific, and an earlier draft of this record blamed the
wrong one.** It said `packTheme` relocates `:root` onto `section` and the two
collided there. The packing path does the opposite: `composeCss` inlines the base
AT the theme's `@import 'lattice'` line, so base lands first and theme last — and
there the theme's value won and always reached the page. That path is the browser
runtime, the Playground and the Studio. Only the CLI lost it.

Of the 14 themes declaring the token, **8** give it a value distinct from
`--accent`, deepened so the chip clears AA on a **card** rather than only on the
canvas (`indaco` → `#006599`, `L:5.46/5.02`). Those 8 were discarded on every CLI
render; the other 6 declare `var(--accent)` outright, so for them the default was
a no-op. An earlier draft said "fourteen … not one reaching the page," which
overstated both halves. Confirmed in Chromium by resolving the property on a real
chip: it computed to `var(--accent)` and measured **4.36:1** on a card against a
4.5 floor.

Deleting the default was necessary but not sufficient, and the ownership gate
said why: `--code-inline-fg` is **ink** (4.5:1) while `--accent` is an **area**
token (3:1 graphical, no text contract). Ink falling back onto an area token is
the `--cat-N-ink` defect exactly — a value repaired to the graphical floor and
then painted as label text.

**Decision: derive it.** `code-inline-fg` joins `REQUIRED_TOKENS` in the `ink`
group and is derived in `lib/theme/derive.js`, repaired against **both**
canvases:

```js
t['code-inline-fg'] = ld(
  ensureContrast(ensureContrast(e.accent, e.bg, AA, 'darken'), e.bgAlt, AA, 'darken'),
  ensureContrast(ensureContrast(darkAccent, darkBgDeeper, AA, 'lighten'), darkBgAlt, AA, 'lighten'),
);
```

**The repair target is the chip's own wash, not the card.** This is the part the
first cut got wrong. `--code-inline-bg` fills the chip with
`color-mix(in srgb, currentColor 10%, transparent)`, so what sits behind the
glyphs is `0.1·ink + 0.9·card` — and the reported 4.36:1 was measured against
`rgb(218,232,242)`, that composite, not against `--bg-alt` (`#F2F5FA`). Repairing
against the bare card is one step short and short by exactly enough to matter: it
left indaco's derived chip at **4.38:1** on the real surface while reporting 5.01
against the card. Five of fourteen palettes derived a sub-AA chip that way,
including the very case the token was added to fix.

`inkOnWash` solves it instead of computing it — repair, recompute the wash the
repaired ink would lay down, repair again — because the target depends on the ink.
It settles in two or three passes. Note the sRGB compositing: `mix()` is OKLab,
which is right for choosing colors and wrong for predicting a browser's alpha
blend.

`section code` keeps its `var(--code-inline-fg, var(--accent))` fallback, which
is now unreachable for a derived or shipped theme and harmless for a
hand-authored one mid-edit.

## Result

Measured with `tools/check-slide-contrast.js` on the rendered DOM:

| deck | before | after |
|---|---|---|
| `examples/accent-finishes.md` (indaco) | 14 below AA | **0** |
| the same, `a11y-base` | 3 below AA | **0** |
| the same, `indaco-dark` | 0 | **0** |
| the same, `mustard` / `onyx` / `cuoio` | — | **0** |
| `test/integration/baseline-decks/gallery.md`, 1,518 runs | 14 below AA | 11 |

`indaco-dark` was already clean, so it demonstrates no regression rather than a
fix; it is listed because a dark variant inheriting its parent's ink was an
assumption worth pinning. An earlier draft claimed all three went "14 → 0", which
was true only of indaco.

The gallery's remaining 11 are not this class and are not all defects:

- **8 are prober artifacts**, made of four running-header runs on `split-*`
  layouts, two 440px decorative watermark letters, and two runs of text over a
  background photograph the prober cannot sample.
- **3 are a genuine, unrelated bug** — `journey` step labels at 1.87:1: the
  92%-white `--journey-stage-fg` (`--on-dark-primary`) over
  `--journey-stage-bg`, a pale mix of `--bg-alt` toward `--surface-inverse`.
  On-dark ink on a not-dark fill. Logged as #1702 rather than pulled into this
  diff (HARD RULE #18, found-not-caused, off-path).

**A correction about the header runs, because the first draft got it wrong in a
way worth naming.** It repeated the prober's own comment — that the header is
"fully occluded by the left rail, ink that never reaches the page" — without
looking. Rendered, the header is plainly visible in white on the dark rail. The
runs are still false positives, but for a different reason: the header box spans
the full slide while the rail is a **sibling, not an ancestor**, so the prober
climbs to `section` and samples white-on-white. The tool's comment is stale, and
adopting a tool's self-description as evidence is the same error as trusting a
single rasterizer.

## The part that prevents recurrence

Both causes were *silent*. Neither a test nor a gate could see them; both needed
a person to look at a slide and be bothered. `tools/check-slide-contrast.js`
already measures the rendered DOM and already found all of this in one run — it
was simply on-demand.

The follow-through is to run it as a gate over the galleries so a new sub-AA run
fails the build. That needs a decision on the WCAG-exempt decorative tier and on
the occluded-run artifacts above, which are not fixable by any contrast change
and would otherwise pin the budget above zero permanently.
