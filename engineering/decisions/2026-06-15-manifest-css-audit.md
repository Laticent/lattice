---
status: shipped
summary: Cross-checking all 52 component manifests against the CSS/transforms that render them; 34 findings across 17 components, all remediated
---

# Manifest-vs-CSS audit — do the manifest claims match what the CSS does?

**Date:** 2026-06-15
**Scope:** All 52 component manifests (`lib/components/<bucket>/<name>/<name>.manifest.json`)
cross-checked against the CSS/transforms that actually render them — each
component's `<name>.styles.css`, the central `lib/base/*.css`, sibling
`*.transform.js` files, the `lib/core/*` DOM emitters, and (for charts) the
shared `_chart-family/` kernel. Behavioral claims were verified against the
**committed gallery PDFs** where rendered output settles the question.

**Method:** seven parallel auditors (one per bucket-group), each required to
cite file:line evidence on *both* sides of every finding — the manifest claim
**and** the CSS/transform reality — plus a deterministic phantom-variant scan
of `dist/lattice.css`. Raw per-bucket reports were compiled in
`.scratch/manifest-audit/`.

## What "backs" a claim (why naive checks over-report)

A manifest claim can be implemented in three places, and you must check all
three before calling a claim false:

1. the component's own `<name>.styles.css`;
2. central cross-cutting CSS in `lib/base/*.css` (universal modifiers like
   `dark`/`mirror`/`numbered`, semi-universals `compact`/`loose`/`accent`,
   family modifiers like `canvas`/`checks-*`);
3. DOM emitted by a `*.transform.js` / `lib/core/*` that the CSS then targets
   (most chart variants are transform-branches, not CSS selectors).

A CSS-only scan flags transform-driven chart variants (`map`, `quadrant`,
`radar`, `word-cloud`, `state-chart`) as "missing"; manual verification
confirmed every one is backed by a real transform branch. Those are **not**
findings.

---

## Headline

> **Resolution (2026-06-15):** all findings below were remediated in the same
> change. Class B CSS bugs (compare-prose's four dead variants + the dead
> `mirror`, redline's OLD/NEW labels, citation-card's empty action box) were
> fixed in CSS/samples and visually verified against the rebuilt galleries.
> Class C phantoms (`compare-code mirror`, `kpi target`, plus the `cards-grid
> mirror` no-op) were deleted from their manifests. Class A prose/comment drift
> was corrected. This document is retained as the evidence record.

**34 findings across 17 components; ~35 components fully clean.**

| Severity | Count |
|---|---|
| CRITICAL (claim is false / renders broken) | 6 |
| MAJOR (behavior contradicts the claim) | 12 |
| MINOR (stale / imprecise wording) | 15 |
| NIT | 1 |

The findings fall into three remediation classes, which matter because the fix
differs:

- **Class A — manifest prose is wrong, the CSS is correct.** Fix the manifest
  text (safe, no render change). Most findings.
- **Class B — the CSS is broken, the manifest intent is right.** "Making the
  claim match the CSS" would mean *documenting a bug*. The right fix is to the
  CSS, and it needs visual sign-off. (compare-prose, redline.)
- **Class C — phantom variant: declared + captioned but never implemented.**
  A product call: implement the feature or delete the claim. (compare-code
  `mirror`, kpi `target`.)

---

## CRITICAL

### 1–4. `compare-prose` — four dead variants (Class B: CSS broken)
`chosen`, `decision`, `vertical`, `rejected` have ZERO visual effect. Their CSS
targets a `.compare-prose-inner .card` DOM that **no render path emits** — the
component's own base layout even guards on
`section.compare-prose:not(:has(.compare-prose-inner))`
(`compare-prose.styles.css:31,43`), proving `.compare-prose-inner` is a retired
structure. The four variants have no bare-`ul` fallback, so they render
identically to plain `compare-prose`.
- chosen — caption "accent left edge and tinted background"
  (`compare-prose.manifest.json:93`) vs `compare-prose.styles.css:79-84`
  (`.compare-prose-inner .card:nth-child(3)`); gallery p-05 shows two identical
  plain cards.
- decision — caption "struck left, DECISION connector label"
  (`:98`) vs `:79-133` (incl. `::after{content:'DECISION'}` at `:118`);
  gallery p-06 shows a plain chevron, no label, no strike.
- vertical — caption "stacks the two cards vertically" (`:103`) vs
  `:138-158`; gallery p-07 shows them still side-by-side.
- rejected — caption "strikes + dims the second card" (`:113`) vs `:92-99`;
  gallery p-09 shows the second card neither struck nor dimmed.
- **Fix (CSS):** re-scope each rule to the live `> :is(ul,ol) > li` DOM, the
  way the working `transition`/`banner-tag` variants already do
  (`compare-prose.styles.css:290-296`). (Note the central
  `section.compare-prose.mirror` rule at `base.modifiers.css:849` *also* targets
  `.compare-prose-inner`, so `mirror` on compare-prose is dead for the same
  reason — same fix.)

### 5. `compare-code` `mirror` — phantom variant (Class C)
`compare-code.manifest.json:11-13` declares `mirror` with a full caption
(`:69-72`), but **no `section.compare-code.mirror` rule exists anywhere**. The
layout is a static `grid-template-columns:1fr 1fr` (`compare-code.styles.css:12`)
with no order/`row-reverse`, and the central mirror block
(`base.modifiers.css:805-851`) enumerates exactly four supported layouts —
image, featured, split-panel, compare-prose — compare-code not among them.
Authoring `compare-code mirror` renders identically to bare.
- **Fix:** remove the variant + variantDoc, **or** ship the rule.

### 6. `citation-card` `pull-quote` sample renders an EMPTY gloss (Class A/sample)
The variant HIDES any gloss `<li>` lacking a bold lead:
`section.citation-card.pull-quote > :is(ul,ol) > li:not(:has(> strong:first-child)) { display:none }`
(`citation-card.styles.css:128`). The variantDoc sample authors `- What we must
do.` as plain text (`citation-card.manifest.json:99-100`); nothing auto-bolds it
(citation-card is excluded from `slotLabelLift`). Result: the gloss the caption
promises is invisible — confirmed on `citation-card.gallery.light.pdf` p.3. The
manifest's own antiPattern (`:74-75`) warns of exactly this.
- **Fix:** author the gloss line bold (`- **What we must do.**`) in the sample.

---

## MAJOR

| # | Component | Claim vs reality | Class |
|---|---|---|---|
| 1 | checklist | `purpose` (`:10`) says `[ ]` produces an **x** mark; `[ ]` decodes to `state-todo` = a hollow ring, **no inner mark** (`plugins.js:586`, `base.modifiers.css:692-697`). Internally contradicts the manifest's own slot text "[ ] todo". | A |
| 2 | split-panel | `watermark` caption (`:89`) says **h5** section rubric; the sample + live gallery use **h3** routed to the right panel (`gallery.md:251`, `split-panels.js:106-122`). An author following the caption lands an absolutely-positioned overlay in the *left* panel. | A |
| 3 | title | `eyebrow` slot (`:23`) says "below the h1"; CSS reorders it **above** via `order:-1` (`title.styles.css:16`). | A |
| 4 | kpi | `target` variant (`:94-97`) captioned a distinct "variance dashboard"; **no `section.kpi.target` rule**, and the briefing selector doesn't exclude `.target`, so it renders identically to bare kpi. | C |
| 5 | kpi | antiPattern (`:59-60`) claims `On plan`/`At risk`/… are "the vocabulary the engine recognises"; pill color is purely **positional** (`nth-child`), never text-driven (`pill-tag.js`, `kpi.styles.css:241-307`). | A |
| 6 | citation-card | default skeleton/sample (`:43,:45`) author "What we must do" without the bold the action-box chrome requires (`citation-card.styles.css:78-95` fires only on `li:has(> strong:first-child)`). | A |
| 7 | obligation-matrix | `asymmetric` caption (`:80`) says "inline state **pills**"; `.asymmetric` adds only card chrome — cells stay circular **discs** (`base.modifiers.css:772-800`, `obligation-matrix.styles.css:85-123`). "Pills" is a separate variant. | A |
| 8–10 | redline | `split`/`stacked`/`three-col` captions promise **OLD/NEW** blockquote labels; every label renders **"KEY INSIGHT"**. The redline specificity hack (`.split.split`, 0,4,3) is beaten by the central rule that grew to five `:not()` clauses (0,5,1) (`base.modifiers.css:175`). Columns/strike work; only the label text is wrong. Confirmed gallery p-04/05/06. | B |
| 11 | journey | `swimlane` caption (`:88`) "a dot … **sized by** that task's mood"; the dot is fixed-size (`journey.styles.css:571-583`), mood only sets color. | A |
| 12 | timeline-list | `description`/`purpose` (`:9-10`) map a **left/middle/right row**; the component renders a horizontal spine with each item a **vertical stack** (date above the dot, then title/status/body) (`timeline-list.styles.css:5-8,48-113`). Reads like a retired design. | A |

---

## MINOR (stale / imprecise — Class A)

- **cards-grid / cards-stack** — `numbered` listed in `variants[]` but the corner
  number is keyed on ordered-list (`> ol`) source, not a `.numbered` class
  (`cards-grid.styles.css:66-77`, `cards-stack.styles.css:83-94`); the variant
  class itself is inert. `cards-grid` also lists `mirror` as a declared no-op.
  (Convention: cross-cutting modifiers shouldn't be in `variants[]`.)
- **split-panel / split-panels.js** — header comments name `.quote`; the real
  selector is `.pullquote` (`split-panel.styles.css:9`, `split-panels.js:11`).
- **title** — `subtitle` "below the eyebrow" is imprecise (it's below the h1).
- **kpi** — count drift: description says "five layout modifiers", `variants[]`
  lists six.
- **stats** — `subtitle` slot selector `p > code` has no dedicated rule; styled by
  the generic `> p`/`> em`; "after h2" is wrong (the eyebrow is before h2).
- **image** — `museum` caption hard-codes "40px/100px"; the winning rule is cqi
  (`image.styles.css:277-280`) — correct only at HD.
- **citation-card** — `triptych` caption mislabels the composition (the citation
  spans the top band, not one of the three panels).
- **obligation-matrix** — stale `●/◐/○` glyph comment in the CSS header (code
  comment, not a manifest claim).
- **roadmap** — `milestones` caption claims a "date pill as a subtitle" that isn't
  rendered (`roadmap.styles.css:572-580`); `horizons` caption claims generated
  "Horizon 1/2/3 (now/next/later)" tinting, but the variant emits "Phase 01/02…"
  eyebrows with a categorical accent rotation (`roadmap.transform.js:206-239`).
- **progress** — `purpose` enumerates a partial status vocabulary.
- **piechart** — `donut` caption says the centre "can be used for a total label";
  no such mechanism exists (`chart-family.js:283-377`).

## NIT
- **journey** — `curve` caption says "y-axis scale / axis"; only gridlines are
  drawn, no numeric tick labels.

---

## Clean components (no manifest-vs-CSS drift)

anchor: closing, divider · statement: big-number, content, quote ·
inventory: actors, agenda, glossary, list, list-tabular, logo-wall, q-and-a ·
comparison: compare-table, decision, matrix-2x2, pricing, split-compare,
verdict-grid · progression: list-criteria, list-steps · evidence: (none fully
clean — see kpi/stats) · imagery: featured · chart: funnel, gantt, kanban, map,
quadrant, radar, state-chart, word-cloud · math: math · diagram: diagram ·
legal: authority-chain, regulatory-update, statute-stack.

## Adjacent observations (not manifest findings, logged for the maintainer)

- Several **stale CSS header comments** mirror the manifest errors they likely
  seeded (journey "sized by mood", roadmap milestones `<br>` subtitle + tick
  scale, piechart "total readout", obligation-matrix glyphs, actors "filled"
  pill). Worth fixing alongside the prose.
- `compare-prose`'s whole `.compare-prose-inner / .card` apparatus is dead; the
  `runtime/index.js:710-712` comment still *asserts* the build emits it.
- `roadmap.styles.css:412` grids horizons at a fixed 3 columns (`--horizon-count`
  never set), so a >3-phase horizons board would wrap.
- `kanban` supports an undocumented optional card-body sub-bullet (an undersell).
