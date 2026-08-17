---
status: shipped
summary: A title slide rendered with three bold words at 1.61:1 against a 3:1 floor — near-black ink on the dark navy bookend — reported from a real deck rather than an audit. Two independent causes, both the same shape - a value correct for one surface painted on another, with nothing able to notice. (1) The title/closing/divider bookends fill `--surface-inverse` without declaring `color-scheme: dark`, so every `light-dark()` token resolved to its light side and anything the base layer had not named explicitly inherited light-canvas ink; four hand-written per-element rebinds existed, each added after somebody spotted a bad slide, and bold text was never on that opt-in list. Fixed by declaring the scheme in the same rule that paints the surface. (2) `base.tokens.css` declared `--code-inline-fg: var(--accent)`, and because `packTheme` relocates a theme's `:root` onto `section` the two collided at equal specificity where source order decides — so the engine default silently beat all 14 themes that had deepened this ink to clear AA on a card, and the chip shipped 4.36:1 against a 4.5 floor. Fixed by deriving the token — it is ink, and it had been falling back onto an area token held to the graphical floor, the `--cat-N-ink` shape. Measured - accent-finishes goes 14 sub-AA runs to 0 in indaco, a11y-base and indaco-dark alike.
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

**Decision: the scheme travels with the surface.** `color-scheme: dark` is now
declared in the same rule that paints `--surface-inverse`, in each bookend
component. `section.divider.light` replaces that canvas with `--bg`, so it puts
`color-scheme: light` back alongside it.

The four existing rebinds are deliberately **left in place**. They are now
belt-and-braces rather than the only thing holding, and each still names an ink
explicitly, which is legal and clearer at the point of use. Removing them is a
separate change with its own verification.

### Why not keep the enumeration

Considered and rejected: complete the per-element list instead of flipping. It
cannot be completed — the set is "every inline treatment any component might
ever put on a bookend," and it grows with the component catalog. The rebinds
also each cost a measurement round to discover. Declaring the scheme once fixes
the whole class by construction, which is the same reasoning
`2026-06-08-inline-code-contrast.md` used when it chose a `currentColor` wash
over enumerating every panel fill.

## Cause 2 — an engine default silently outranked every theme

`base.tokens.css` declared `--code-inline-fg: var(--accent)`. `packTheme`
relocates a theme's `:root` onto `section`, so the engine's declaration and the
theme's landed **on the same selector at the same specificity**, where source
order decides — and the engine bundle is emitted last.

So the engine default beat every theme. Fourteen shipped themes carry a
`--code-inline-fg` deepened specifically so the chip clears AA on a **card**
rather than only on the canvas, each with its measured pair recorded in a
trailing comment (`indaco` → `#006599`, `L:5.46/5.02`). **Not one of them was
reaching the page.** Confirmed in Chromium by resolving the custom property on a
real chip: it computed to `light-dark(#006FA8, #82C8E5)` — `var(--accent)` — and
measured **4.36:1** on a card panel against a 4.5 floor.

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

The second repair is the one that matters: the accent alone clears the canvas
and misses the card, which is precisely the 4.36:1 that shipped. `--bg-alt` is
the conservative worst case (darker than `--bg` in light mode, lighter in dark),
so clearing it and the plain canvas clears every surface between them.

`section code` keeps its `var(--code-inline-fg, var(--accent))` fallback, which
is now unreachable for a derived or shipped theme and harmless for a
hand-authored one mid-edit.

## Result

Measured with `tools/check-slide-contrast.js` on the rendered DOM:

| deck | before | after |
|---|---|---|
| `examples/accent-finishes.md` (indaco) | 14 below AA | **0** |
| the same, `a11y-base` | — | **0** |
| the same, `indaco-dark` | — | **0** |
| `test/integration/baseline-decks/gallery.md`, 1,518 runs | 14 below AA | 11 |

The gallery's remaining 11 are not this class and are not all defects:

- **8 are tool artifacts.** Five are the running header on `split-*` layouts,
  which the tool's own header documents as fully occluded by the left rail —
  ink that never reaches the page. Two are a 440px decorative watermark letter.
  Two are text over a background photograph the prober cannot sample.
- **3 are a genuine, unrelated bug** — `journey` step labels at 1.87:1, white on
  a pale blue-gray pill: `--on-accent` ink used against a fill that is not the
  accent. Ink-on-fill, not ink-on-surface — logged as #1702 rather than pulled
  into this diff (HARD RULE #18, found-not-caused, off-path). They are the last
  genuine failures standing between the gallery and a clean gallery-wide gate.

## The part that prevents recurrence

Both causes were *silent*. Neither a test nor a gate could see them; both needed
a person to look at a slide and be bothered. `tools/check-slide-contrast.js`
already measures the rendered DOM and already found all of this in one run — it
was simply on-demand.

The follow-through is to run it as a gate over the galleries so a new sub-AA run
fails the build. That needs a decision on the WCAG-exempt decorative tier and on
the occluded-run artifacts above, which are not fixable by any contrast change
and would otherwise pin the budget above zero permanently.
