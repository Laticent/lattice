/**
 * calibrate-core — the shared rig behind `calibrate-density` and
 * `calibrate-capacity`.
 *
 * Both tools run the SAME experiment and differ only in which variable moves:
 *
 *   density  — hold the element COUNT, grow the WORDS per element
 *   capacity — hold the words per element, grow the element COUNT
 *
 * Each builds a graded deck (one slide per step), renders it through the real
 * engine, and reads the SAME cell-aware overflow probe the runtime and export
 * use — the "⚠ OVERFLOW … pages X, Y" line. The first step that trips the probe
 * is the geometric break point. The oracle is the shipping renderer, not a
 * model of it, which is the whole reason these numbers can be trusted
 * (2026-06-17-content-capacity-contract.md §4).
 *
 * Keeping the element BUILDERS in one place matters: they encode each
 * component's real authored shape, and a second copy would drift from the first
 * exactly the way the hand-written capacity numbers drifted from reality.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');

// Deck sizes to calibrate against. The four adaptive FAMILIES (lib/adaptive/
// families.js) are the useful axis — a component's capacity is a property of the
// box shape it reflows into, not of a particular @size — so each family maps to
// a representative registered @size. The legacy landscape/portrait words are
// kept so existing invocations of calibrate-density keep working.
const SIZE_ALIAS = {
  wide: '16:9',
  square: 'square',
  tall: 'portrait',
  strip: 'mobile',
  landscape: '16:9',
  portrait: '9:16',
};

const FAMILIES = ['wide', 'square', 'tall', 'strip'];

const FILLER = ('clear concise board ready signal scored weekly across teams before review normalized into one schema then ranked by confidence recency and strategic weight adjusted each quarter against measured outcomes')
  .split(' ');

/** N prose words drawn from a fixed filler, so a step is reproducible. */
const words = (n) => Array.from({ length: Math.max(1, n) }, (_, i) => FILLER[i % FILLER.length]).join(' ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Per-element builders: author the component's real shape with the body filled
// to W PROSE words (matching lib/authoring/prose-budgets.js elementWordCounts).
//
// NOTE: a few layouts (split-panel, timeline-list) carry a lead/subtitle
// paragraph in their real sample that these builders omit — so a calibration
// reads a slightly MORE generous ceiling than reality. Harmless while the
// shipped numbers sit editorially below the measured ceiling, but add the lead
// line here if you ever tighten a budget toward the geometry.
const BUILDERS = {
  'cards-grid': (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  'cards-stack': (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  'verdict-grid': (w) => `- **${cap(words(2))}.**\n  - ${cap(words(w - 2))}.`,
  inventory: (w) => `- **${cap(words(2))}.** ${cap(words(w - 2))}.`,
  actors: (w) => `- ${cap(words(w - 2))} \`Head of Product\`\n  - ${cap(words(2))}.`,
  'list-steps': (w) => `1. ${cap(words(2))}\n   - ${cap(words(w - 2))}.`,
  // A premise row is term / clause / framing question — three parts, matching its
  // skeleton. Added in #1220: premise's capacity was first set from an ad-hoc
  // render, which is the "measured by a script nobody can re-run" shape this repo
  // keeps getting bitten by. With a builder here the number is re-derivable:
  // `node tools/calibrate-capacity.js premise --family tall`.
  premise: (w) => `1. ${cap(words(2))}\n   - ${cap(words(Math.max(1, w - 5)))}.\n   - ${cap(words(3))}?`,
  'q-and-a': (w) => `- ${cap(words(2))}?\n  - ${cap(words(w - 2))}.`,
  // A team-profile person is name / role pill / one note line. The portrait is
  // deliberately OMITTED so the rig measures the MONOGRAM path: the figure box is
  // CSS-sized and identical in height either way, and a relative `![](x.svg)` in
  // a temp deck would resolve to nothing and collapse the cell it is supposed to
  // stand in. The variable words go to the note, which is the part that varies.
  'team-profile': (w) => `- ${cap(words(2))}\n  - \`Head of Delivery\`\n  - ${cap(words(Math.max(1, w - 2)))}.`,
  agenda: (w) => `1. ${cap(words(w))} \`p.3\``,
  checklist: (w) => `- [x] ${cap(words(w))}`,
  stats: (w) => `1. 73%\n   - ${cap(words(w))}`,
  // A kpi metric is value / label / target-trend-and-pills — three lines, matching
  // its manifest skeleton and every kpi slide that ships. The builder used to emit
  // only the value and ONE nested bullet, which is a `stats` row, not a kpi: it
  // dropped the mono target line AND the status pills, so it measured a support
  // tile roughly a third shorter than the real one and read a correspondingly
  // generous ceiling. That mattered — the ceiling this rig prints is the evidence
  // behind kpi's stated allowance (#1277), so it has to render the contract the
  // allowance is about. The variable words go to the label, which is the part that
  // varies in real decks; the target line is fixed cost, as it is in practice.
  kpi: (w) => `1. 42%\n   - ${cap(words(Math.max(1, w - 5)))}\n   - target 40% · +2pp \`On plan\` \`Board\``,
  list: (w) => `- ${cap(words(w))}.`,
  glossary: (w) => `- ${cap(words(1))}\n  - ${cap(words(w - 1))}.`,
  'list-tabular': (w) => `1. ${cap(words(2))}\n   - ${cap(words(w - 2))}.`,
  'timeline-list': (w) => `1. \`2025 Q1\` ${cap(words(2))}\n   - ${cap(words(w - 2))}.`,
  'compare-prose': (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  decision: (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  'matrix-2x2': (w) => `- **${cap(words(2))}.**\n  - ${cap(words(w - 2))}`,
  'split-panel': (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  'split-compare': (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  // Legal-family layouts with a countable item axis (added for the square
  // capacity grounding, #1218). Shapes follow each manifest's own skeleton.
  // A ONE-word tier label, the shape the docs teach (Statute, Regulation, Guidance, Case). The rail
  // is narrow: a two-word label like "Agency guidance" wraps to a second line and costs every row a
  // line, which is how this rig read a laptop ceiling of 4 while the documented row holds 5.
  'authority-chain': (w) => `1. ${cap(words(1))}\n   - \`${cap(words(2))}\`\n   - ${cap(words(Math.max(1, w - 3)))}.`,
  'regulatory-update': (w) => `1. ${cap(words(2))}\n   - \`${cap(words(2))}\`\n   - ${cap(words(Math.max(1, w - 6)))}.\n   - \`Effective Mar 2026\``,
  'statute-stack': (w) => `- ${cap(words(1))} \`${cap(words(2))}\`\n  - ${cap(words(Math.max(1, w - 5)))}.\n  - \`${cap(words(2))}\``,
  // A `code` "element" is one LINE of a single fenced block — `BODY_WRAP.code` puts the
  // fence around the lines — so the count this measures is the pane's line cap. Short,
  // fixed lines: the width budget is a separate, derived number (lint-core
  // CODE_LINE_BUDGET), and a wrapped line would conflate the two.
  code: () => 'const value = compute(input);',
  // compare-code: an element is one LINE, written into BOTH panes by BODY_WRAP, so the count
  // this measures is lines per pane (2361-p3-venue-budget-gaps).
  'compare-code': () => 'const value = compute(input);',
  // obligation-matrix: a ROW is a regime label and five state markers, as the gallery writes it.
  'obligation-matrix': (w) => `| ${cap(words(Math.min(2, Math.max(1, w))))} | [x] | [-] | [x] | [x] | [/] |`,
  pricing: (w) => `- ${cap(words(1))} \`$49 / mo\`\n  - [x] ${cap(words(2))}\n  - ${cap(words(Math.max(1, w - 4)))}.`,
  // Added for the per-venue budgets (2026-09-25-font-scale-fit.md, Amendment 2026-09-27): every
  // component with a `capacity` block gets a measured row, so these five had to be authorable.
  // Shapes follow each manifest's skeleton. A table ROW spreads its words over the label and
  // three value cells; `BODY_WRAP.table` supplies the header.
  table: (w) => {
    const rest = Math.max(3, w - 2);
    const a = Math.ceil(rest / 3);
    const b = Math.ceil((rest - a) / 2);
    return `| ${cap(words(2))} | ${cap(words(a))} | ${cap(words(b))} | ${cap(words(Math.max(1, rest - a - b)))} |`;
  },
  cycle: (w) => `- ${cap(words(2))}\n  - ${cap(words(w - 2))}.`,
  'policy-recommendation': (w) => `- ${cap(words(2))}\n  - ${cap(words(Math.max(1, w - 2)))} \`Citation 2025\``,
  // A kanban element is a LANE (its `capacity.axis` counts lanes), holding two cards of `w` words:
  // `w` is the CARD length its `density` budgets. lint counts the whole lane (label, both cards
  // and their team lines, 2w + 3 words), so the manifest keys each row by that lane length.
  kanban: (w) => `- ${cap(words(1))}\n  - ${cap(words(w))} \`S\`\n    - team-a\n  - ${cap(words(w))} \`M\`\n    - team-b`,
  // A roadmap element is a COLUMN, the leading workstream column included (its `capacity.axis`
  // is `col`). The builder names one column; `BODY_WRAP.roadmap` turns the list into the table.
  roadmap: () => `${cap(words(1))} \`Q2 2026\``,

  // THE SVG CHARTS (2376-p2). An element is one item on the chart's `pane.budget.axis`: a bar, a
  // wedge, a point, a series, a region. `i` is the element's index, so every label is DISTINCT
  // (line, slope and scatter key points by label, and repeated names would merge them) and the
  // values vary without chance. Labels hold at most three words, a chart label's real length.
  // A viewBox chart does not overflow as it fills: it shrinks, so its ceiling is read from the
  // legibility lines as well as OVERFLOW (`parseProbeLog`).
  bar: (w, i = 0) => `- ${label(w, i)} \`${value(i)}\``,
  bullet: (w, i = 0) => `- ${label(w, i)} \`${value(i)}\` \`${value(i + 3)}\``,
  funnel: (w, i = 0) => `- ${label(w, i)} \`${Math.round(12000 * 0.62 ** i)}\``,
  piechart: (w, i = 0) => `- ${label(w, i)} \`${value(i)}%\``,
  scatter: (w, i = 0) => `- ${label(w, i)} \`$${value(i) * 5}k\` \`${value(i + 2)}%\``,
  // waterfall: a total, then deltas.
  waterfall: (w, i = 0) => `- ${label(w, i)} \`${i === 0 ? '12.0M' : `${i % 2 ? '+' : '-'}${(value(i) / 40).toFixed(1)}M`}\``,
  // line and stacked-bar count the CATEGORY axis (x points / bars), each carrying two series.
  line: (_w, i = 0) => `- W${i + 1}\n  - Plan \`${value(i)}\`\n  - Actual \`${value(i + 5)}\``,
  'stacked-bar': (_w, i = 0) => `- FY${20 + i}\n  - Licenses \`${value(i)}\`\n  - Services \`${value(i + 4)}\``,
  // slope and radar count SERIES; radar's five axes are fixed chrome.
  slope: (w, i = 0) => `- ${label(w, i)}\n  - 2023 \`${value(i)}%\`\n  - 2026 \`${value(i + 7)}%\``,
  radar: (w, i = 0) => `- ${label(w, i)}\n${['Coverage', 'Integration', 'Cost', 'Support', 'Speed'].map((ax, k) => `  - ${ax} \`${1 + ((i + k) * 7) % 10}\``).join('\n')}`,
  // heatmap counts ROWS; `BODY_WRAP.heatmap` supplies the column header.
  heatmap: (w, i = 0) => `| ${label(w, i)} | ${[0, 1, 2, 3].map((k) => value(i + k)).join(' | ')} |`,
  // map counts REGIONS, which must be real places the kernel can draw.
  map: (_w, i = 0) => `- ${MAP_REGIONS[i % MAP_REGIONS.length]} \`${value(i)}\``,

  // THE HTML-DRAWN AND GROUPED CHARTS (2376-p2, the panes-probe-calibration PR). An element is one
  // item on the manifest's `pane.budget.axis`, shaped like the gallery's first slide. Grouped
  // charts carry TWO children per group, the gallery's smallest real group.
  // gantt counts LANES (workstreams), each a done task and a live one after it; the calendar
  // derives from the spans, so no window pill is needed.
  gantt: (w, i = 0) => `- ${label(w, i)}\n  - Plan ${i + 1} \`Q${1 + (i % 2)}..Q${2 + (i % 2)}\` \`done\`\n  - Build ${i + 1} \`Q${2 + (i % 2)}..Q4\` \`live\` \`after=Plan ${i + 1}\``,
  // journey counts STAGES, each two scored steps.
  journey: (w, i = 0) => `- ${label(w, i)}\n  - Step ${i + 1}a \`@user\` \`:${1 + (i % 5)}\`\n  - Step ${i + 1}b \`@user\` \`:${1 + ((i + 2) % 5)}\``,
  // matrix-grid counts ROWS of a five-column grid with one named cell; `BODY_WRAP` supplies the
  // header and the axis pill.
  'matrix-grid': (w, i = 0) => `| ${label(w, i)} | [ ] | [-] | [x] Level ${i + 1} | [ ] |`,
  // progress counts TRACKS, each a percent and a status pill.
  progress: (w, i = 0) => `- ${label(w, i)} \`${value(i)}%\` \`${['on-track', 'at-risk', 'done', 'blocked'][i % 4]}\``,
  // quadrant counts POINTS, spread over all four quarters; `BODY_WRAP` deals them into four named
  // groups, since a top-level item is a group name, not a point.
  quadrant: (w, i = 0) => `- ${label(w, i)} \`${1 + ((i * 3) % 9)}, ${10 + ((i * 37) % 85)}\``,
  // state-chart counts STATES, a chain: each state after the first steps back to the one before.
  'state-chart': (w, i = 0) => `${i + 1}. ${label(w, i)}${i ? `\n   - \`back => ${i}\`` : ''}`,
  // word-cloud counts WORDS, one or two words each, weights 1..5.
  'word-cloud': (w, i = 0) => `- ${label(Math.min(2, w), i).toLowerCase()} \`${1 + ((i * 3) % 5)}\``,
};

// An element's label: up to three filler words, a different run for each index.
function label(w, i) {
  const n = Math.max(1, Math.min(3, w));
  const run = Array.from({ length: n }, (_, k) => FILLER[(i * 3 + k) % FILLER.length]).join(' ');
  return cap(i * 3 >= FILLER.length ? `${run} ${i + 1}` : run);
}
// A value in 20..79, spread so neighbors differ.
const value = (i) => 20 + ((i * 37) % 60);
const MAP_REGIONS = ['India', 'Nigeria', 'Kenya', 'Brazil', 'Indonesia', 'Ethiopia', 'Bangladesh', 'Mexico',
  'Egypt', 'Vietnam', 'Peru', 'Ghana', 'Chile', 'Morocco', 'Tanzania', 'Uganda'];

// A component whose elements only render inside a wrapper: the builder writes one
// element, this wraps the whole body once.
const BODY_WRAP = {
  code: (body) => `\`\`\`js\n${body}\n\`\`\``,
  'compare-code': (body) => `\`Before · one\`\n\n\`\`\`js\n${body}\n\`\`\`\n\n\`After · two\`\n\n\`\`\`js\n${body}\n\`\`\``,
  'obligation-matrix': (body) => `| Regulation | Notice | Consent | Retention | Breach | DSAR |\n| --- | :-: | :-: | :-: | :-: | :-: |\n${body}`,
  table: (body) => `| Criterion | Option A | Option B | Option C |\n| --- | --- | --- | --- |\n${body}`,
  heatmap: (body) => `|  | M0 | M1 | M2 | M3 |\n| --- | --: | --: | --: | --: |\n${body}`,
  quadrant: (body) => {
    const pts = body.split('\n');
    return ['Quick Wins', 'Strategic Bets', 'Defer', 'Time Sinks']
      .map((g, k) => [`- ${g}`, ...pts.filter((_, i) => i % 4 === k).map((p) => `  ${p}`)])
      .filter((g) => g.length > 1).map((g) => g.join('\n')).join('\n');
  },
  'matrix-grid': (body) => `\`[Wider reach, Deeper cognition]\`\n\n| Verb | Self | Team | Org | Field |\n| --- | :-: | :-: | :-: | :-: |\n${body}`,
  roadmap: (body) => {
    const cols = body.split('\n');
    const row = (label) => `| ${label} | ${cols.slice(1).map((_, i) => ['[x] Shipped item', '[-] In-flight item', '[ ] Planned item'][i % 3]).join(' | ')} |`;
    return [`| Workstream | ${cols.slice(1).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, row('First workstream'), row('Second workstream')].join('\n');
  },
};

// Square-family components this rig deliberately does NOT calibrate, and why.
// Logged rather than silently skipped: a count calibration needs a repeatable
// element AND no fixed chrome the builder can't express, or the measured
// ceiling is a fiction.
//
//   citation-card  — atomic. One citation per slide; there is no count axis.
//   logo-wall      — elements are image assets; a synthetic deck would measure
//                    broken-image boxes, not logos.
//   math           — the equation is fixed chrome that dominates the box; a deck
//                    of bare legend lines measures the wrong thing.
//   content        — same: the lead paragraph is the slide, the bullets optional.
// Shape: { name → why }. Printed by `calibrate-capacity --all` so the dropped
// coverage is stated, not implied by an absence — the list existed as an inert
// export for a while, reading like a decision while enforcing nothing.
const NOT_COUNT_CALIBRATABLE = Object.freeze({
  'citation-card': 'atomic — one citation per slide, so there is no count axis',
  'logo-wall': 'elements are image assets; a synthetic deck measures broken-image boxes, not logos',
  math: 'the equation is fixed chrome that dominates the box; a deck of bare legend lines measures the wrong thing',
  content: 'the lead paragraph IS the slide and the bullets are optional — same problem',
});

/** The component's manifest, found across the bucket directories. */
function findManifest(name) {
  const buckets = fs.readdirSync(path.join(ROOT, 'lib', 'components'));
  for (const b of buckets) {
    const p = path.join(ROOT, 'lib', 'components', b, name, `${name}.manifest.json`);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return null;
}

/**
 * A graded deck: one slide per step, page N ↔ step N.
 *
 * Rendered with `--no-split` — the deck must not re-paginate, or page N would stop
 * mapping to step N. That is INSTRUMENTATION, which is why it is a tool flag and not a
 * deck directive: this rig needs the deck held still so it can measure, which is a
 * different need from any an author has (2026-07-29-autosplit-is-not-a-toggle.md). Front matter emits no
 * `section[data-lattice-slide]`, so the emulator's `slide: i+1` aligns to
 * steps[i].
 *
 * `slideFor(step)` returns EITHER `{ label, body }` — the calibration shape, where the
 * rig writes the heading and the step supplies the elements below it — OR
 * `{ slide }`, the whole slide body verbatim under the class comment. The second form
 * exists for a sweep whose variable IS the heading (tools/check-jank.js grows the
 * heading and holds the component's documented chrome fixed), which the first cannot
 * express because it owns the heading itself.
 */
/** The venue each `--scale` rung measures (lib/core/resolve-venue.js). */
const VENUE_FOR_SCALE = Object.freeze({ l: 'huddle', xl: 'conference', '2xl': 'hall' });

function gradedDeck({ comp, size, steps, slideFor, scale = null, eyebrow = false }) {
  const slides = steps.map((step, i) => {
    const made = slideFor(step);
    if (made.slide != null) return `<!-- _class: ${comp} -->\n\n${made.slide.trim()}\n`;
    const heading = `## Calibration step ${i + 1} — ${made.label}.`;
    // `eyebrow` adds the one-line label most real slides carry above the heading. It is
    // off by default because `capacity` is measured without it (2026-07-28-capacity-basis.md);
    // the code pane's scale budget is measured both ways because the eyebrow costs it
    // one to two whole lines, which is the difference between a warning and silence.
    const lead = eyebrow ? '`Calibration · eyebrow`\n\n' : '';
    return `<!-- _class: ${comp} -->\n\n${lead}${heading}\n\n${made.body}`;
  });
  // `scale` puts the VENUE for that rung in the front matter (l → huddle, xl → conference,
  // 2xl → hall), so a ceiling is measured at what a deck at that venue renders. It used to write
  // `class: scale-xl`, which sets the same `--fs-scale` and NOT the venue's meta lift (eyebrows,
  // labels and captions ×1.15 at conference, ×1.3 at hall; lib/base/base.modifiers.css), so every
  // conference and hall row was measured on a slide the venue never renders: a real
  // `split-panel proof` slide clipped at `venue: hall` and fit at `class: scale-2xl`
  // (2026-09-25-font-scale-fit.md, Amendment (5)).
  const cls = scale ? `venue: ${VENUE_FOR_SCALE[scale]}\n` : '';
  return `---\nsize: ${size}\n${cls}---\n\n${slides.join('\n\n---\n\n')}\n`;
}

/**
 * The pages an emulator log reports as not fitting. `clipped` is the `⚠ OVERFLOW` line: a deck at
 * a scale renders every slide at that scale and clips what does not fit (the automatic step-down
 * was retired on 2026-09-27). The other two are LEGIBILITY: a viewBox chart never overflows as it
 * fills — it shrinks — so its ceiling is where it stops being readable instead: `underFloor` is
 * the `⚠ TYPE FLOOR` line (a figure's text below the floor) and `labelsDropped` the `⚠ CHART
 * LABELS DROPPED` line (a name the kernel declined to paint), and `overprint` the `⚠ CHART LABELS
 * OVERPRINT` line (a painted label crossing a mark it does not sit inside — a bullet row squeezed
 * until its name prints through the bar above). Each line is anchored on its glyph,
 * so prose elsewhere in the log that names one is never read as it. Pure, so the parse is
 * unit-tested (test/unit/tools/calibrate-core-parse.test.js).
 */
function parseProbeLog(log) {
  const pageNums = (list) => list.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  const m = log.match(/⚠ OVERFLOW[^\n]*?pages?\s+([\d,\s]+)/);
  // A box that clips its own content (a kanban lane, a timeline card) loses text without
  // the slide exceeding the frame, so the engine reports it on its own CONTENT CLIPPED line.
  // Read as a fit, it let kanban's hall row claim 4 lanes where 4 lanes lose their cards.
  // It is returned apart, because the same line also reports an ELLIPSIS (premise's label),
  // which cuts text sideways at any count; `countClipped` below decides which it is.
  const box = log.match(/⚠ CONTENT CLIPPED[^\n]*?pages?\s+([\d,\s]+)/);
  const line = (re) => (log.match(re) || [''])[0];
  const pagesOn = (text) => [...text.matchAll(/page (\d+)/g)].map((x) => Number(x[1]));
  return {
    clipped: m ? pageNums(m[1]) : [],
    boxClipped: box ? pageNums(box[1]) : [],
    underFloor: pagesOn(line(/⚠ TYPE FLOOR —[^\n]*/)),
    labelsDropped: pagesOn(line(/⚠ CHART LABELS DROPPED —[^\n]*/)),
    overprint: pagesOn(line(/⚠ CHART LABELS OVERPRINT —[^\n]*/)),
  };
}

/**
 * The pages a COUNT-graded deck clips on (`calibrate-capacity`, whose deck grows one element a
 * page from page 1): every OVERFLOW page, plus the box clips once they start. A box clip
 * already on page 1 does not come from the count — it is an ellipsis on a label, the same at
 * any count — so the box line is not read at all. Otherwise a box clip is the count filling
 * its box. Only that caller opts in (`renderProbe`'s `countBox`): `calibrate-density` grows
 * words, not elements, and `check-jank` reads its own axis, so neither is read this way.
 */
function countClipped(clipped, boxClipped) {
  const box = boxClipped.includes(1) ? [] : boxClipped;
  return [...new Set([...clipped, ...box])].sort((a, b) => a - b);
}

/**
 * Render a deck and return the set of 1-based page numbers the overflow probe
 * flagged. Throws only when the render itself failed for a reason other than
 * overflow (the probe's own non-zero exit is the signal we came for).
 *
 * Options, all for the geometry rig (tools/check-jank.js) and all defaulting to
 * the calibration behavior this started as:
 *   format   'pdf' (default) or 'html' — the `.html` output is the same real
 *            browser render minus the PDF encode, and it is the artifact a DOM
 *            measurement pass needs.
 *   palette  a theme name, passed as `-p`; omitted means the engine default.
 *   keep     hold the temp directory and hand back `out` + `cleanup()`, so the
 *            caller can load the rendered file. The default still deletes it
 *            before returning, which is what the two calibrators want.
 *   countBox also count CONTENT CLIPPED pages, the way a count ceiling reads them
 *            (`countClipped`). Only `calibrate-capacity` passes it.
 */
function renderProbe(deck, label, { format = 'pdf', palette = null, keep = false, countBox = false } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-'));
  const src = path.join(tmpDir, `${label}.md`);
  const out = path.join(tmpDir, `${label}.${format}`);
  const cleanup = () => fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.writeFileSync(src, deck);
  // A `keep` caller owns the directory only once it HAS the path — a throw before
  // that point would strand it, so the flag decides in the finally.
  let handedOver = false;
  try {
    const args = [EMULATOR, src, '-o', out, '--no-split', '-q'];
    if (palette) args.push('-p', palette);
    const r = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    const log = `${r.stdout || ''}\n${r.stderr || ''}`;
    if (r.status !== 0 && !/OVERFLOW/.test(log)) {
      const tail = log.trim().split('\n').slice(-8).join('\n');
      throw new Error(`Render failed for '${label}' (exit ${r.status}).\n${tail}`);
    }
    const { clipped, boxClipped, underFloor, labelsDropped, overprint } = parseProbeLog(log);
    const pages = countBox ? countClipped(clipped, boxClipped) : clipped;
    handedOver = keep;
    return {
      overflowed: new Set(pages), clipped: new Set(pages),
      underFloor: new Set(underFloor), labelsDropped: new Set(labelsDropped), overprint: new Set(overprint),
      log, out, cleanup,
    };
  } finally {
    if (!handedOver) cleanup();
  }
}

module.exports = { ROOT, EMULATOR, SIZE_ALIAS, FAMILIES, BUILDERS, BODY_WRAP, NOT_COUNT_CALIBRATABLE, words, cap, findManifest, gradedDeck, renderProbe, parseProbeLog, countClipped };
