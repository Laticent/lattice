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
 * A theme small enough to read in one screen. It sets the ten colors everything
 * else leans on; the engine's own defaults cover the rest, which is exactly why
 * a half-finished theme still renders instead of collapsing to black on white.
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

/** The same theme, re-hued warm — the "change three values" exercise. */
export const THEME_WARM_ACCENT = `/* @theme craft-lab */
@import 'lattice';

:where(:root) { color-scheme: light; }

:root {
  --bg:              #FDFBF7;
  --bg-alt:          #F5EEE2;
  --border:          #E0D3BE;
  --surface-inverse: #2A1F14;

  --text-display:   #FBF6EE;
  --text-heading:   #2A1F14;
  --text-body:      #3D2E1E;
  --text-secondary: #5A4632;
  --text-muted:     #6E5A44;
  --muted-mark:     #806B54;

  --accent:      #9A5B1E;
  --accent-soft: #F2E3CE;
  --on-accent:   #FFFFFF;

  --pass: #4A6A2D;
  --warn: #B45309;
  --fail: #9A3412;
}
`;

/** A theme with BOTH canvases in one file — the light-dark() lesson. */
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
  --text-secondary: light-dark(#3A4A61, #A9B8CC);
  --text-muted:     light-dark(#5A6A80, #93A3B8);
  --muted-mark:     light-dark(#6B7B92, #7C8CA2);

  --accent:      light-dark(#2E5C8A, #7FB2E5);
  --accent-soft: light-dark(#DCE7F3, #1B2C42);
  --on-accent:   light-dark(#FFFFFF, #06121F);

  --pass: light-dark(#2D6A3F, #4ADE80);
  --warn: light-dark(#B45309, #F59E0B);
  --fail: light-dark(#991B1B, #F87171);
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
