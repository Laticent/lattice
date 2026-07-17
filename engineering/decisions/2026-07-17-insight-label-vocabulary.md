---
status: shipped
summary: >
  The two baked-in callout eyebrows — the universal Key Insight panel's "KEY
  INSIGHT" and the split-compare verdict tag's "Recommendation" — become
  author-renamable through one shared custom-property seam, --insight-label,
  driven by a small curated set of insight-* modifier classes on the slide
  _class (or a deck-wide frontmatter class:). Both surfaces read the SAME token,
  each with its own default via the var() fallback, so the recommendation is
  literally a Key Insight variant rather than a split-compare special. Defaults
  are unchanged (zero-config decks render identically); the vocabulary is a
  highly edited boardroom set, not free text. Same idiom as the stamp-* markers'
  --stamp-label. No new DOM injection — pure class-on-section toggling a custom
  property consumed by existing ::before content.
---

# Insight label vocabulary — renamable callout eyebrows

## Problem

Two callout eyebrows were hardcoded into `content:`:

- **KEY INSIGHT** — universal, on any trailing `> blockquote` of a content
  layout (`lib/base/base.modifiers.css`).
- **Recommendation** — the split-compare verdict corner tag
  (`lib/components/comparison/split-compare/split-compare.styles.css`).

"Key Insight" is genuinely universal and a fine default. "Recommendation",
though, is not intrinsic to split-compare — it is a *variant of* Key Insight
that happens to live on the verdict card. And neither word fits every deck: a
board slide wants THE ASK, an analysis wants SO WHAT, a decision wants VERDICT.
The wording should be an author choice — curated, not free text.

## Decision

One shared seam, the same custom-property-as-content idiom the `stamp-*` state
markers already use (`--stamp-label`, `base.variants.css`):

- The universal panel emits `content: var(--insight-label, 'KEY INSIGHT')`.
- The split-compare verdict tag emits `content: var(--insight-label, 'RECOMMENDATION')`.
- A curated set of `insight-*` modifier classes (`base.variants.css` § INSIGHT
  LABEL) sets `--insight-label`. Custom properties inherit, so a class on the
  `section` reaches both the blockquote's `::before` and the verdict's `::before`.

Because both surfaces read the **same** token — each supplying its own default
through the `var()` fallback — one vocabulary drives both, and the two defaults
are themselves modifiers (`insight-key`, `insight-recommendation`), so either
word can move onto the other surface. This makes the user's framing literal: the
recommendation *is* a Key Insight variant.

### Vocabulary (curated)

Shipped as the lean pack (first shipped set), then expanded with the
board-slide follow-ons (OUR VIEW, IMPLICATION, NEXT STEP, WHY IT MATTERS):

| Modifier | Eyebrow | Modifier | Eyebrow |
|---|---|---|---|
| `insight-key` | KEY INSIGHT (universal default) | `insight-verdict` | VERDICT |
| `insight-recommendation` | RECOMMENDATION (split-compare default) | `insight-so-what` | SO WHAT |
| `insight-takeaway` | TAKEAWAY | `insight-bottom-line` | BOTTOM LINE |
| `insight-the-ask` | THE ASK | `insight-our-view` | OUR VIEW |
| `insight-implication` | IMPLICATION | `insight-next-step` | NEXT STEP |
| `insight-why` | WHY IT MATTERS | | |

Restraint is the point: a small, individually tasteful set, each uppercase to
match the eyebrow's `text-transform` and the label voice. Grow it by adding one
line in `base.variants.css`; do not open it to arbitrary author strings.

## Why not

- **Free-text label (author types any string).** Rejected: the ask was
  explicitly "highly curated heading," and arbitrary strings invite off-voice,
  overlong, mixed-case eyebrows that break the boardroom bar. A curated
  allowlist keeps every choice on-brand.
- **Separate tokens per surface** (`--insight-label` + `--verdict-label`).
  Rejected: it re-entrenches the very split — recommendation as a split-compare
  special — that this change dissolves. One token, two defaults, is simpler and
  matches the concept.

## Zero-config guarantee

Every default is a `var()` fallback, so a deck with no modifier renders
byte-identically. `math.theorem` still suppresses its eyebrow via
`content: none` (it overrides, unaffected); `redline` remains excluded from the
universal rule. This is a CSS-only, content-string change — no export-pipeline
bytes move for unmodified decks.

## Artifacts

- CSS: `lib/base/base.modifiers.css`, `lib/base/base.variants.css`,
  `lib/components/comparison/split-compare/split-compare.styles.css`.
- Demo: `examples/insight-labels.md` (+ committed `.pdf`), rendered and
  verified in both surfaces (default KEY INSIGHT / RECOMMENDATION and the
  `insight-takeaway` / `insight-verdict` overrides).
- Docs: `lib/base/base.docs.md` § Renaming the eyebrow; split-compare manifest
  verdict slot.
