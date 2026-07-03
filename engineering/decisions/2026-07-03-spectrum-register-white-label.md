---
status: in-progress
summary: A deck `spectrum:` register (on / off / solid) to white-label the rainbow brand bar — redefine the --spectrum / --spectrum-vertical tokens so all three paint sites follow; off removes it, solid repaints it in --accent
---

# The `spectrum:` register — white-label the brand bar

**Follows:** `2026-07-03-status-marker-style-variants.md` §9 (which deferred this)

## Problem

The **spectrum** — the rainbow gradient bar every `<section>` carries on its top
border (`base.elements.css`), and that a `divider` slide carries as a left rail
(`divider.styles.css`) — is the Lattice brand signature. A consultancy rendering a
deck under a **client's** mandated brand cannot ship the Lattice rainbow: they need
it gone, or replaced with the client's single brand color. The status-marker red-team
(§9) reframed the "make the spectrum configurable" option as exactly this — a
**white-label** need, distinct from status markers — and deferred it to its own PR.
This is that PR.

## Decision — a deck `spectrum:` register, three values

A front-matter register, sibling of `finish:` / `mode:` / `stamp:` / `tone:`
(`lib/core/resolve-spectrum.js`), propagated onto every section by
`deckClassPropagate` (both render paths) with a per-slide `spectrum-*` override.

| `spectrum:` | Token | Effect |
|---|---|---|
| `on` | *(none)* | The rainbow spectrum. **The default** (omit the key). |
| `off` | `spectrum-off` | No brand bar — clean top edge (and no divider rail). |
| `solid` | `spectrum-solid` | A single **accent** bar (white-label: set the theme's `--accent` to the client brand). |

## Mechanism — target the three brand-bar sites, NOT the token

The brand bar is painted in **three** places: the top `border-image` (`base.elements.css`),
the `.dark`-canvas top background line (`base.modifiers.css`), and the divider left rail
(`divider.styles.css`). A first cut *redefined the `--spectrum` token* to recolor all three
in one rule — but `--spectrum` is **also read by non-brand decorations** (`section hr` — an
author's `---` rule, the `list-steps` connector spine, table header rails, code-block
rails). Nulling the token for `spectrum: off` would silently blank an author's horizontal
rules and the step-sequence spine — a real regression. So the register **targets the three
brand-bar sites explicitly** and never touches the shared token:

```css
section.spectrum-off { border-top: none; }
section.dark.spectrum-off { background: var(--bg); }
section.divider:not(.light).spectrum-off { background: var(--surface-inverse); }

section.spectrum-solid { border-top: <w> solid var(--accent); border-image: none; }
section.dark.spectrum-solid { background: linear-gradient(var(--accent),var(--accent)) top / 100% 1px no-repeat, var(--bg); }
section.divider:not(.light).spectrum-solid { background: linear-gradient(var(--accent),var(--accent)) left / … , var(--surface-inverse); }
```

A deck that genuinely wants **every** spectrum-derived decoration recolored (hr, rails,
spine) sets `--spectrum` directly at the theme/`:root` level — that is the token's job.
The `spectrum:` register is scoped to the brand bar, which is the least-surprising split
(`spectrum: off` must not erase your horizontal rules).

**Interaction with `accent` / `tone: edge`.** Both already repaint the top border with
`border-image: none` + a solid color (per-slide, opt-in). They keep working over a deck
`spectrum: solid`; where specificity ties, the per-slide token is authored later and
wins. `tone: edge` (specificity 0,2,1) always beats the register (0,1,1).

## Scope

- Register + propagation (both paths) + per-slide override; `unknown-spectrum` lint.
- CSS as above; docs + demo + tests.
- **Not** a per-slide Studio drawer control — `spectrum:` is deck-brand config, not
  per-slide craft; it lives in front matter (revisit if authors ask).

## Do-not-regress

- The rainbow spectrum stays the DEFAULT — the register is opt-in; omitting it is `on`.
- `spectrum: off` removes ALL three sites (top border, `.dark` line, divider rail).
- Every color stays a palette token — `solid` is `var(--accent)`, no hex (HARD RULE #3).
