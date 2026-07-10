# Cascade architecture

How Lattice's CSS cascade is structured today, why `@layer` is
declared-but-inert, and what it would take to activate.

## The current cascade

`lattice.css` is the bundled output of `tools/build-css.js`. Sources
concatenate in this order (file-header docstring is canonical):

```text
1.  lib/_theme.css                              (Marp @theme directive)
2.  lib/base/base.tokens.css                    (:root tokens)
3.  lib/base/base.elements.css                  (semantic HTML defaults)
4.  lib/integrations/markdown-it/scaffold.css     (section, header, footer, pagination)
5.  @layer declaration (declared, but no source wraps itself in any layer)
6.  lib/components/<bucket>/<name>/<name>.styles.css   (alphabetical)
7.  lib/base/base.modifiers.css                 (cross-cutting modifiers)
8.  lib/integrations/highlight-js/highlight-js.css
9.  lib/components/chart/_chart-family/chart-family.css
10. lib/base/base.treatments.css                (tint-* / mark-* utilities)
11. lib/shared/shared.styles.css
12. lib/base/base.variants.css                  (state markers, tone, chrome)
13. lib/integrations/mermaid/mermaid.css        (Mermaid SVG theme overrides)
```

The **bundle order IS the cascade order**: at equal specificity, later
sources beat earlier ones via natural CSS source-order resolution.
Modifiers come AFTER components so equal-specificity collisions
resolve to modifier defaults; component-specific overrides bump
specificity in their own file. Variants come last so state markers
(archived, redacted, etc.) compose over everything else.

## The `@layer` declaration is currently inert

`tools/build-css.js` emits this near the top of the bundle:

```css
@layer base, root, scaffold, components, semi-universal, universal, diagram-overrides;
```

…but no source file wraps itself in any layer. The declaration exists
to reserve the layer order for future activation. **Today every rule
is unlayered.** A `grep -c "^@layer components {" lattice.css` returns
zero.

This is intentional. The next section explains why.

## Why broad `@layer` activation is blocked

A first instinct is to wrap each source file in its matching layer.
That's blocked by a subtle interaction between the `@layer` cascade
rules and `!important`.

### CSS `@layer` cascade rules (the surprises)

1. **Cross-layer normal declarations:** later-declared layers beat
   earlier-declared layers, REGARDLESS of specificity. A rule in
   `@layer universal` with selector `section.x` (specificity 0,1,1)
   beats a rule in `@layer components` with selector
   `section.x > ul > li` (specificity 0,1,3).

2. **Cross-layer `!important` declarations:** the cascade INVERTS —
   earlier-declared layers beat later-declared layers. A `!important`
   rule in `@layer components` (declared earlier) beats a `!important`
   rule in `@layer universal` (declared later).

3. **Unlayered vs layered:** unlayered declarations beat layered
   declarations at the SAME importance level, regardless of
   specificity. An unlayered `section h1` (specificity 0,0,2) BEATS a
   layered `section.title h1` (specificity 0,1,2) if either is
   layered and the other isn't.

Rule 3 is the trap. Phase 3.5b of the layer-activation investigation
wrapped ONLY component CSS in `@layer components` and left shared
files unlayered. Result: every component rule lost to whatever generic
rule existed in `base.modifiers.css` or `scaffold.css` at lower
specificity. 100% of canary pages diverged. The change was reverted.

### What that means for Lattice today

`scaffold.css` has `!important` rules on `section::after` (pagination
chrome). They're dead weight in the owned engine's own render (nothing
competing loads there) but load-bearing in the one context where they do
compete: `scaffold.css` is the same file the Export-to-Marp bundle ships
(one source of truth, HARD RULE #1), and real marp-core injects its own
default pagination CSS there — the `!important` is what wins against
*that*, not against anything in our own engine. (This is why
`marp-independence.md`'s "no fighting marp's `!important` scaffold" isn't
a contradiction: that line describes the owned-engine render path, which
never sees Marp's scaffold at all.) `base.variants.css` has competing
`!important` rules on `section.silent::after`, `section.archived::after`,
etc. (state-marker overrides that need to defeat the scaffold default).

Today both are unlayered → source order resolves the tie → variants
wins because it comes later in the bundle. ✓

If we wrapped `base.variants.css` in `@layer universal` while leaving
`scaffold.css` unlayered (or vice versa):
- Per rule 3, the unlayered side wins regardless of specificity
- Variants silently loses → `.silent`, `.archived` etc. stop working
- Pixel-diff catches the regression, but only on slides exercising
  those variants

Wrapping BOTH in `@layer` would help cross-layer comparison — but
rule 2 means `@layer scaffold` (declared first) still beats
`@layer universal` (declared later) for `!important`, unchanging the
outcome.

The only safe paths are:

- **Status quo** — everything competing via `!important` stays
  unlayered; the existing source-order resolution works.
- **Full coordinated rewrite** — refactor BOTH sides to eliminate
  the `!important` competition (e.g. push variants to use selectors
  specific enough that they don't need `!important` to beat
  scaffold), then activate `@layer` across the bundle.

The full rewrite is documented as a deferred follow-up in
`engineering/decisions/2026-05-18-important-audit-phase-35-prep.md` but has no
near-term action.

## What Phase 3.5 actually delivered

A multi-step investigation in May 2026 attempted broader activation
and learned:

| Phase | Outcome |
|---|---|
| 3.5a baseline harness | Established that pixel-diff against an in-sandbox build is the only safe verification; diffing against committed PDFs is misleading because of Chromium-version drift. |
| 3.5b component-layer wrap | **Reverted.** Wrapping only components broke 100% of canary pages due to rule 3 above. |
| 3.5c retire 7 cascade-workaround `!important` | **Shipped.** Removed 7 defensive `!important` declarations across `anchor/title`, `comparison/verdict-grid`, `progression/list-criteria` (×2), `progression/list-steps`. Each was overkill that natural selector specificity already wins without. Pixel-diffed: 0 deltas across 35 affected pages. |
| 3.5d this doc | **Shipped.** Captures the investigation so the next contributor doesn't redo Phase 3.5b. |

After Phase 3.5c, `lattice.css` carries 345 `!important` declarations
(down from 352). All 345 remaining are correct: 14 in `base.variants.css`
defending against `scaffold.css`, and 331 library-override
declarations defending against inline styles emitted by Mermaid,
KaTeX, Marpit's emoji catch-all, and own SVG kernels.

## How the audit categorized `!important` declarations

`engineering/decisions/2026-05-18-important-audit-phase-35-prep.md` has the full
breakdown. Summary:

- **331 library-override** (Mermaid SVG, KaTeX, Marpit defaults,
  emoji catch-all, highlight.js). Must stay `!important`, must stay
  unlayered. These are the correct use of `!important` per the CSS
  spec — overriding inline styles emitted by external tools.
- **21 cascade-workaround** at the time of the audit. Of those:
  - **14 in `base.variants.css`** — locked in (the scaffold-vs-variants
    competition described above).
  - **7 in component files** — retired in Phase 3.5c. All were
    defensive overkill that natural specificity resolution handled
    correctly.

## What changing the cascade now would require

Anyone touching the cascade should expect to:

1. **Snapshot in-sandbox pixel baselines first.** Diffing against
   committed PDFs is misleading because different Chromium versions
   produce different rasterizations. The committed `gallery.pdf`
   at 4.7MB and a fresh in-sandbox rebuild at 1.8MB are NOT the
   same baseline; they're produced by different printers.
2. **Pixel-diff per-component after every change.** `tools/pixel-check.js`
   has a snapshot/diff harness; treat any pixel delta > ~250 px per
   page as a real signal (Mermaid contributes up to ~200 px of
   noise per affected page due to mmdc's Puppeteer non-determinism).
3. **Don't wrap individual source files in `@layer` in isolation.**
   Either wrap nothing (status quo) or wrap everything in a
   coordinated pass that resolves the `!important` competitions
   first. The middle ground breaks the cascade.
4. **Treat the 14 `base.variants.css` `!important` rules as
   load-bearing** until the scaffold-vs-variants competition is
   refactored. They're not defensive overkill — they're necessary
   to defeat `scaffold.css`.
5. **Library-override `!important` stays.** Any rule whose selector
   targets a class emitted by Mermaid, KaTeX, or another external
   library needs `!important` to defeat the library's inline styles.
   That's not a cascade workaround.

## Related references

- `engineering/decisions/2026-05-18-important-audit-phase-35-prep.md` —
  the full audit; categorization of every `!important` declaration
- `engineering/decisions/2026-05-18-component-reorg-and-modular-css.md` —
  the broader refactor plan that surfaced this
- `design/design-system.md` §10 (CSS architecture) — high-level
  bundling intent
- `engineering/gotchas.md` — VS Code PDF preview and other
  rasterization-environment quirks that affect pixel-diff
- `tools/build-css.js` header comment — bundle order rationale
