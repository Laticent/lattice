// Shared seeds for the Craft track's live labs.
//
// One module so the same slide reappears across pages — a reader who learned to
// read the KPI slide on the token tour meets it again on the contrast page and
// spends their attention on what changed, not on a new example. Every slide here
// is real Lattice source: paste any of them into the Playground and they render.

/** A KPI slide — three figures, each with a label, a delta and status tags. */
export const SLIDE_KPI = `<!-- _class: kpi -->

## Revenue ahead of plan; margin and cash both expanded.

1. $2.4B
   - Total revenue
   - target $2.2B · +9% \`On plan\` \`Board\`
2. 42%
   - Gross margin
   - +2pp QoQ \`On plan\` \`Audit\`
3. $1.1B
   - Cash & equivalents
   - +$180M QoQ \`On plan\` \`Investor\`
`;

/** Four cards — the plainest way to see surfaces, borders and body ink at once. */
export const SLIDE_CARDS = `<!-- _class: cards-grid -->

## Four things the quarter proved.

- Demand held
  - Renewals closed at 94%, two points above plan.
- Costs fell
  - Hosting spend down 18% after the migration.
- Hiring paused
  - Two roles held open into next quarter.
- Cash extended
  - Runway now reaches Q3 of next year.
`;

/** A title slide — the inverse bookend, where the canvas flips to the dark surface. */
export const SLIDE_TITLE = `<!-- _class: title -->
<!-- _paginate: false -->

# Fourth quarter review

\`Board · March\`

Results, risks, and what we do next.
`;

/** A code slide — every syntax color on the screen at once. */
export const SLIDE_CODE = `<!-- _class: code -->

## The renderer reads the theme, never a color.

\`\`\`js
// Every color a layout paints comes from a token.
function panelStyle(theme) {
  const fill = theme.get('--bg-alt');
  const ink = theme.get('--text-body');
  return \`background:\${fill};color:\${ink}\`;
}
\`\`\`
`;

/** A flowchart — where the categorical colors show up. */
export const SLIDE_DIAGRAM = `<!-- _class: diagram -->

## How a deck becomes a PDF.

\`\`\`mermaid
flowchart LR
  A[Markdown] --> B[Engine]
  B --> C[Themed HTML]
  C --> D[PDF]
\`\`\`
`;

/**
 * A theme small enough to read in one screen. It sets the seventeen colors
 * everything else leans on; the engine's own defaults cover the rest, which is
 * exactly why a half-finished theme still renders instead of collapsing to
 * black on white.
 */
export const THEME_MINI = `/* @theme craft-lab */
@import 'lattice';

:where(:root) { color-scheme: light; }

:root {
  /* Surfaces — the two grounds every slide paints on */
  --bg:              #FBFCFE;
  --bg-alt:          #EEF2F8;
  --border:          #CBD6E4;
  --surface-inverse: #0A1628;

  /* Ink — loudest to quietest */
  --text-display:   #F4F7FB;
  --text-heading:   #0A1628;
  --text-body:      #1C2A3E;
  --text-label:     #2E5C8A;
  --text-secondary: #3A4A61;
  --text-muted:     #5A6A80;
  --muted-mark:     #6B7B92;

  /* Brand */
  --accent:      #2E5C8A;
  --accent-soft: #DCE7F3;
  --on-accent:   #FFFFFF;

  /* Signals */
  --pass: #2D6A3F;
  --warn: #B45309;
  --fail: #991B1B;
}
`;

/**
 * A theme with BOTH canvases in one file — the light-dark() lesson, and the one
 * seed that carries categorical pairs. It needs them: the engine ships no default
 * for the --cat-* family (a theme that omits them renders unstyled, which is why
 * the token contract requires all twenty-four), so a diagram lab seeded without
 * them draws every node in --surface-inverse.
 */
export const THEME_PAIRS = `/* @theme craft-lab */
@import 'lattice';

:where(:root) { color-scheme: light; }

:root {
  /* Each token names both canvases. The browser picks the side that
   * matches the active color-scheme — so one file dresses two decks. */
  --bg:              light-dark(#FBFCFE, #0C1119);
  --bg-alt:          light-dark(#EEF2F8, #151C28);
  --border:          light-dark(#CBD6E4, #2A3646);
  --surface-inverse: light-dark(#0A1628, #E8EEF6);

  --text-display:   light-dark(#F4F7FB, #0A1628);
  --text-heading:   light-dark(#0A1628, #EDF2F9);
  --text-body:      light-dark(#1C2A3E, #D2DCEA);
  --text-label:     light-dark(#2E5C8A, #7FB2E5);
  --text-secondary: light-dark(#3A4A61, #A9B8CC);
  --text-muted:     light-dark(#5A6A80, #93A3B8);
  --muted-mark:     light-dark(#6B7B92, #7C8CA2);

  --accent:      light-dark(#2E5C8A, #7FB2E5);
  --accent-soft: light-dark(#DCE7F3, #1B2C42);
  --on-accent:   light-dark(#FFFFFF, #06121F);

  --pass: light-dark(#2D6A3F, #4ADE80);
  --warn: light-dark(#B45309, #F59E0B);
  --fail: light-dark(#991B1B, #F87171);

  /* Categorical — four of the twelve slots. Each is a PAIR of the same hue, and
   * the two tiers trade places between the canvases: pale fill + deep mark on the
   * light page, jewel fill + pale mark on the dark one. The label inks flip with
   * them, which is the mistake the categorical page is mostly about. */
  --cat-1-fill: light-dark(#BCD5EC, #00558C);  --cat-1-mark: light-dark(#2E608A, #CFE0EE);
  --cat-2-fill: light-dark(#BFE3DC, #0A5F52);  --cat-2-mark: light-dark(#1F6E60, #CBE7E1);
  --cat-3-fill: light-dark(#F3DFB8, #7A4E0A);  --cat-3-mark: light-dark(#8A5A12, #EFDCBB);
  --cat-4-fill: light-dark(#E3CFE8, #5E2F6E);  --cat-4-mark: light-dark(#6D3E7C, #E2CFE7);

  --cat-on-fill: var(--text-heading);
  --cat-on-mark: light-dark(#FFFFFF, #0A1628);

  --diagram-stroke: light-dark(#2E608A, #CFE0EE);
  --diagram-line:   light-dark(#0A1628, #EDF2F9);
}
`;

/**
 * The complete `evergreen` palette the themes track builds — the hand-written
 * half, annotated. Shown whole on the worked-example page so a learner can
 * check their own file against a finished one, which no other page in the
 * track lets them do.
 */
export const THEME_EVERGREEN = `/* @theme evergreen
 *
 * A cool green palette. Pale surfaces, one saturated brand stroke, and red
 * reserved for alarm — so a deck reads as ink on paper rather than a chart
 * of colors.
 */
@import 'lattice';

:where(:root) { color-scheme: light; }

:root {
  /* Brand axis — three anchors every value below was derived from. The engine
   * never reads these; they are here so the file records the decision. */
  --brand-canvas: #0B3A34;
  --brand-accent: #0E8C7A;
  --brand-bright: #17B89E;

  /* Surfaces — kept close together, tinted a degree toward the brand hue. */
  --bg:              light-dark(#FBFDFC, #0C1A17);
  --bg-alt:          light-dark(#EEF5F3, #12241F);
  --border:          light-dark(#CBDBD6, #24403A);
  --surface-inverse: light-dark(#0A211D, #EAF3F0);

  /* Ink — loudest to quietest. Each comment is the measured ratio on --bg,
   * light canvas then dark; --text-display is measured on --surface-inverse,
   * the only surface it ever lands on. */
  --text-display:   light-dark(#F2F8F6, #0A211D);  /* 15.7 · 14.9 — on the dark surface */
  --text-heading:   light-dark(#0A211D, #EAF3F0);  /* 16.5 · 15.8 */
  --text-body:      light-dark(#1C2E2A, #D2E2DD);  /* 13.9 · 13.3 */
  --text-label:     light-dark(#1F6E60, #7FD3C2);  /*  6.0 · 10.2 — brand-hued label tier */
  --text-secondary: light-dark(#3A4E49, #A9C0BA);  /*  8.7 ·  9.3 */
  --text-muted:     light-dark(#5A6A66, #94AAA4);  /*  5.6 ·  7.3 — quiet TEXT, floor 4.5 */
  --muted-mark:     light-dark(#6B7B77, #7E938D);  /*  4.4 ·  5.5 — DECORATION, floor 3 */

  /* Accent — --on-accent is picked by eye, per canvas. Nothing derives it. */
  --accent:      light-dark(#0E8C7A, #17B89E);
  --accent-soft: light-dark(#D7ECE7, #123B34);
  --on-accent:   light-dark(#FFFFFF, #04120F);

  /* Signals — warn is amber, not a second red. */
  --pass: light-dark(#2D6A3F, #4ADE80);
  --warn: light-dark(#B45309, #F59E0B);
  --fail: light-dark(#991B1B, #F87171);

  /* Structural — the stroke has to read on white. */
  --diagram-stroke: #1F6E60;
  --diagram-line:   light-dark(#0A211D, #EAF3F0);

  /* Code — the syntax colors, each readable on --code-bg. Twelve in a real
   * file; the tour covers why comments and punctuation are not exempt. */
  --code-text:    light-dark(#EAF3F0, #EAF3F0);
  --hljs-comment: light-dark(#7FA79E, #7FA79E);

  /* Sequential ramp anchor — mid-range on BOTH canvases, or the nine stops
   * the engine derives from it bunch against one end. */
  --seq-500: light-dark(#2E8B79, #35A08C);
}
`;

/** The slide the component labs style. Plain markdown, no component class yet. */
export const SLIDE_PLAIN = `<!-- _class: content -->

## A slide with nothing but a heading and a paragraph.

The engine gives you a section, a stage, and your words. Everything
past that is the component's CSS.
`;

/** A hand-written component: the smallest thing that counts as one. */
export const SLIDE_CUSTOM_COMPONENT = `<!-- _class: takeaway -->

## We should renew the contract.

- Price held flat for two years
- Migration cost exceeds the saving
- The team already knows the tool
`;

export const CSS_CUSTOM_COMPONENT = `/* Every selector hangs off the slide's stage cell — the box your
 * content lands in. The heading is NOT in here; the engine gives it
 * its own cell above (.cell-masthead), already styled. */
section.takeaway > .cell-stage {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--sp-sm);
  padding: var(--sp-lg);
  background: var(--accent-soft);
  border-radius: var(--radius-md);
}

/* The reasons. One flat list, each with an accent tick down its left.
 * The class is written TWICE here so the rule outranks the fallback
 * layout's own list styling — see "The three CSS rules". A registered
 * component does not need the doubling. */
section.takeaway.takeaway > .cell-stage > ul {
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
  list-style: none;
  padding: 0;
}

section.takeaway.takeaway > .cell-stage > ul > li {
  padding-left: var(--sp-md);
  border-left: 4px solid var(--accent);
  color: var(--text-body);
  font-size: var(--fs-body);
}
`;

/**
 * The scaffold's starting point — what `npm run new:component` actually leaves
 * you with. The capstone lab opens on THIS, not on the finished component, so the
 * reader builds the thing rather than reading it.
 */
export const CSS_COMPONENT_STUB = `/* takeaway.styles.css — as the scaffold writes it.
 * One rule, no opinions. Everything below is yours. */
section.takeaway > .cell-stage {
  display: flex;
  flex-direction: column;
}
`;

/** The slide the finished-finish example paints behind — its class matches the
 *  real preset name, so the lab shows exactly the CSS a shipped finish carries. */
export const SLIDE_FINISH_QUARRY = `<!-- _class: content finish-quarry -->

## Atmosphere behind the words, never ornament on top of them.
`;

/**
 * The complete `quarry` finish the finishes track builds — all four slot
 * families, every full-bleed layer twinned for export. Shown whole on the
 * worked-example page.
 */
export const CSS_FINISH_QUARRY = `section.finish-quarry {
  /* ── z2 · TEXTURE — a fine ruled grain. Listed FIRST in the shared
   *    background-image, so it sits above the wash. */
  --fin-texture:
    repeating-linear-gradient(0deg,
      color-mix(in srgb, var(--text-heading) 5%, transparent) 0 1px,
      transparent 1px 30px);
  --fin-texture-opaque:
    repeating-linear-gradient(0deg,
      color-mix(in srgb, var(--text-heading) 5%, var(--fin-canvas)) 0 1px,
      transparent 1px 30px);

  /* ── z1 · WASH — light falling from the top-left. */
  --fin-wash:
    radial-gradient(ellipse 110% 90% at 0% 0%,
      color-mix(in srgb, var(--accent) 11%, transparent) 0%,
      transparent 58%);
  --fin-wash-opaque:
    radial-gradient(ellipse 110% 90% at 0% 0%,
      color-mix(in srgb, var(--accent) 11%, var(--fin-canvas)) 0%,
      var(--fin-canvas) 58%);

  /* ── z3 · MARK — both of its slots declared. The gradient slot is none,
   *    so it cannot inherit one; the glyph is empty so the author opts in
   *    per slide rather than inheriting somebody's monogram. */
  --fin-mark: none;
  --fin-mark-text: "";

  /* ── z4 · EDGE — declared as nothing, so it cannot inherit a stray layer. */
  --fin-edge: none;
  --fin-frame: none;

  /* ── Bookkeeping: one entry per background layer, in the order above. */
  --fin-size:     auto, auto;
  --fin-position: center, 0% 0%;
  --fin-repeat:   repeat, no-repeat;
}
`;

/** The slide every finish lab paints behind. `finish-lab` is a per-slide finish class. */
export const SLIDE_FINISH = `<!-- _class: content finish-lab -->

## Atmosphere behind the words, never ornament on top of them.
`;

/** A finish with one layer: an accent wash in the top-right corner. */
export const CSS_FINISH_WASH = `section.finish-lab {
  /* z1 · wash — an ambient field of color */
  --fin-wash:
    radial-gradient(ellipse 120% 95% at 100% 0%,
      color-mix(in srgb, var(--accent) 14%, transparent) 0%,
      transparent 60%);

  /* The opaque twin, for print and PDF export */
  --fin-wash-opaque:
    radial-gradient(ellipse 120% 95% at 100% 0%,
      color-mix(in srgb, var(--accent) 14%, var(--fin-canvas)) 0%,
      var(--fin-canvas) 60%);

  --fin-size: auto;
  --fin-position: 100% 0%;
  --fin-repeat: no-repeat;
}
`;

/** The same finish plus a ruled texture — two layers, in compositor order. */
export const CSS_FINISH_TWO_LAYERS = `section.finish-lab {
  /* z2 · texture — a repeating pattern, listed FIRST */
  --fin-texture:
    repeating-linear-gradient(0deg,
      color-mix(in srgb, var(--text-heading) 6%, transparent) 0 1px,
      transparent 1px 34px);
  --fin-texture-opaque:
    repeating-linear-gradient(0deg,
      color-mix(in srgb, var(--text-heading) 6%, var(--fin-canvas)) 0 1px,
      transparent 1px 34px);

  /* z1 · wash — listed SECOND, painted beneath */
  --fin-wash:
    radial-gradient(ellipse 120% 95% at 0% 100%,
      color-mix(in srgb, var(--accent) 12%, transparent) 0%,
      transparent 62%);
  --fin-wash-opaque:
    radial-gradient(ellipse 120% 95% at 0% 100%,
      color-mix(in srgb, var(--accent) 12%, var(--fin-canvas)) 0%,
      var(--fin-canvas) 62%);

  /* One entry per layer, in the same order */
  --fin-size: auto, auto;
  --fin-position: center, 0% 100%;
  --fin-repeat: repeat, no-repeat;
}
`;
