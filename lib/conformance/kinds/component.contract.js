/**
 * The COMPONENT contract — what every component directory owes
 * (engineering/decisions/2026-10-15-conformance-harness.md §6.2 Family A, §9 phase 2).
 *
 * STATIC clauses run here, in `npm test`, over every directory under lib/components/<bucket>/ —
 * the 75 components AND the shared `_`-prefixed folders (`_chart-family`, `_qr-card`), which are
 * instances too because a folder of CSS with no manifest is exactly what passed every gate before.
 * RENDER clauses (`tier: 'render'`) are declared in `renderClauses` below and run by
 * tools/conformance-render.js REPORT-ONLY: nightly over every component and all 33 palettes, and per PR over
 * the components the diff touches on three palettes (owner ruling 2026-10-16, decision note §13): they are listed in the
 * generated checklist so nobody reads the static half as the whole contract, and the runner never
 * evaluates them.
 *
 * Each instance carries the facts its clauses read. `enumerate()` measures them; a fixture states
 * them, so a failing fixture trips exactly one clause (§6.3 rule 4).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const COMPONENTS = path.join(ROOT, 'lib', 'components');
const ADDED = '2026-10-16';
const NOTE = 'engineering/decisions/2026-10-15-conformance-harness.md';
const CORPUS = path.join(ROOT, 'test', 'conformance', 'card-row-corpus.json');

/** CSS comments out, so a property named in prose is not counted as a declaration. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Physical (left/right) declarations: the properties that do not mirror under `dir="rtl"`
 * (§7: right-to-left is in scope, §12.5). Counted per declaration, comments stripped. A logical
 * property (`margin-inline-start`, `inset-inline-end`, `text-align: start`) is not counted.
 */
const PHYSICAL = [
  // `(?<![\w#.-])` keeps a CLASS named `.left:hover` or a custom property `--x-left:` from counting.
  /(?<![\w#.-])(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right)(?:-[a-z]+)*\s*:/gi,
  /(?<![\w#.-])border-(?:top|bottom)-(?:left|right)-radius\s*:/gi,
  /(?<![\w#.-])(?:left|right)\s*:/gi,
  /(?<![\w#.-])text-align\s*:\s*(?:left|right)\b/gi,
  /(?<![\w#.-])float\s*:\s*(?:left|right)\b/gi,
  /(?<![\w#.-])justify-(?:content|items|self)\s*:\s*(?:left|right)\b/gi,
  /(?<![\w#.-])(?:background|object|mask)-position\s*:[^;}]*\b(?:left|right)\b/gi,
];
/** Four-value shorthands whose left and right differ: `margin: 0 0 0 4px`, `inset: 0 auto 0 0`. */
const FOUR_VALUE = /(?<![\w#.-])(?:margin|padding|inset|scroll-margin|scroll-padding|border-width|border-style|border-color)\s*:\s*([^;}]+)/gi;
function topLevelWords(v) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of v.replace(/!important/i, '').trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && !depth) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function physicalCount(css) {
  const bare = stripComments(css);
  let n = PHYSICAL.reduce((t, re) => t + (bare.match(re) || []).length, 0);
  for (const m of bare.matchAll(FOUR_VALUE)) {
    const w = topLevelWords(m[1]);
    if (w.length === 4 && w[1].toLowerCase() !== w[3].toLowerCase()) n++;
  }
  return n;
}

/** `name` and `variant` as the classes of one `_class:` directive, or named in a slide's footer. */
function galleryRealizes(gallery, name, variant) {
  for (const m of gallery.matchAll(/<!--\s*_class:\s*([^>]*?)\s*-->/g)) {
    const tokens = m[1].split(/\s+/);
    if (tokens.includes(name) && tokens.includes(variant)) return true;
  }
  // A variant authored as CONTENT (cards-grid `numbered` is an ordered list, not a class) is shown
  // by a slide whose footer names it: `<!-- _footer: "… · cards-grid numbered — …" -->`.
  return new RegExp(`_footer:[^>]*(?<![\\w-])${name} ${variant}(?![\\w-])`).test(gallery);
}

function context(root = COMPONENTS) {
  const { buildVocab, lintText } = require('../../authoring/lint');
  const vocab = buildVocab();
  const buildCss = fs.readFileSync(path.join(ROOT, 'tools', 'build-css.js'), 'utf8');
  const corpus = fs.existsSync(CORPUS) ? JSON.parse(fs.readFileSync(CORPUS, 'utf8')) : { labels: {} };
  const dirs = [];
  for (const b of fs.readdirSync(root, { withFileTypes: true })) {
    if (!b.isDirectory()) continue;
    // A FLAT component folder (lib/components/<name>/<name>.manifest.json) is read by the engine
    // like a bucketed one, so it is an instance with an empty bucket.
    if (fs.existsSync(path.join(root, b.name, `${b.name}.manifest.json`)) || fs.existsSync(path.join(root, b.name, `${b.name}.styles.css`))) {
      dirs.push({ bucket: '', name: b.name });
      continue;
    }
    for (const d of fs.readdirSync(path.join(root, b.name), { withFileTypes: true })) {
      if (d.isDirectory()) dirs.push({ bucket: b.name, name: d.name });
    }
  }
  const lint = (source) => lintText(source, { vocab });
  const names = new Set(dirs.filter((d) => !d.name.startsWith('_')).map((d) => d.name));
  return { root, vocab, lint, buildCss, corpus, dirs, names };
}

const deck = (cls) => `---\nmarp: true\ntheme: indaco\n---\n\n<!-- _class: ${cls} -->\n\n## A\n\n- x\n`;

/** The facts an instance carries, measured. */
function measure({ bucket, name }, ctx) {
  const dir = path.join(ctx.root, bucket, name);
  const rel = ['lib/components', bucket, name].filter(Boolean).join('/');
  const shared = name.startsWith('_');
  const files = fs.readdirSync(dir);
  const manifestFile = path.join(dir, `${name}.manifest.json`);
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;
  const stylesFile = path.join(dir, `${name}.styles.css`);
  const css = files.filter((f) => f.endsWith('.css'));
  const galleryFile = path.join(dir, `${name}.gallery.md`);
  const gallery = fs.existsSync(galleryFile) ? fs.readFileSync(galleryFile, 'utf8') : '';
  const variants = manifest?.variants || [];
  return {
    name,
    bucket,
    shared,
    hasManifest: Boolean(manifest),
    hasStyles: fs.existsSync(stylesFile),
    // A stylesheet other than <name>.styles.css, and whether tools/build-css.js names it.
    strayCss: css.filter((f) => f !== `${name}.styles.css`).map((f) => ({ file: f, wired: ctx.buildCss.includes(`${rel}/${f}`) })),
    variants,
    unrenderedVariants: manifest?.galleryAuthored ? [] : variants.filter((v) => !galleryRealizes(gallery, name, v)),
    lintRefusedVariants: manifest ? variants.filter((v) => ctx.lint(deck(`${name} ${v}`)).some((x) => x.rule === 'unknown-class')) : [],
    axisProblems: manifest ? axisProblems(manifest) : [],
    capacityProblems: manifest ? capacityProblems(manifest, ctx) : [],
    physical: fs.existsSync(stylesFile) ? physicalCount(fs.readFileSync(stylesFile, 'utf8')) : 0,
    cardRowLabel: Object.hasOwn(ctx.corpus.labels, name) ? ctx.corpus.labels[name] : Object.hasOwn(ctx.corpus.candidates || {}, name) ? 'candidate' : null,
    declaresCards: Boolean(manifest?.cards),
  };
}

/** `variantAxes` problems: members that are not variants, a default outside its axis, a variant in two exclusive axes. */
function axisProblems(m) {
  const out = [];
  const variants = new Set(m.variants || []);
  const exclusiveOwner = new Map();
  for (const a of m.variantAxes || []) {
    for (const v of a.members) if (!variants.has(v)) out.push(`axis '${a.label}' lists '${v}', which is not a variant`);
    if (a.default && !a.members.includes(a.default)) out.push(`axis '${a.label}' default '${a.default}' is not one of its members`);
    if (a.exclusive) {
      for (const v of a.members) {
        if (exclusiveOwner.has(v)) out.push(`'${v}' sits in two exclusive axes ('${exclusiveOwner.get(v)}' and '${a.label}')`);
        exclusiveOwner.set(v, a.label);
      }
    }
  }
  return out;
}

/** `capacity` problems: counts out of order, an `escalateTo` that names nothing real. */
function capacityProblems(m, ctx) {
  const c = m.capacity;
  if (!c) return [];
  const out = [];
  const order = ['min', 'sweet', 'soft', 'hard'].filter((k) => Number.isInteger(c[k]));
  for (let i = 1; i < order.length; i++) {
    if (c[order[i - 1]] > c[order[i]]) out.push(`capacity.${order[i - 1]} (${c[order[i - 1]]}) is above capacity.${order[i]} (${c[order[i]]})`);
  }
  const w = c.withCompact;
  if (w && Number.isInteger(w.soft) && Number.isInteger(w.hard) && w.soft > w.hard) out.push(`capacity.withCompact.soft (${w.soft}) is above its hard (${w.hard})`);
  for (const t of c.escalateTo || []) {
    // A sibling component, or the one prose move the Fit Ladder owns ('split across slides').
    const named = t.split(/[^a-z0-9-]+/i).filter((w2) => ctx.names.has(w2));
    if (!named.length && !/^split across slides\b/i.test(t)) out.push(`escalateTo '${t}' names no component and is not 'split across slides'`);
  }
  return out;
}

function enumerate(ctx) {
  return ctx.dirs.map((d) => measure(d, ctx)).sort((a, b) => a.name.localeCompare(b.name));
}

/** A fixture: the facts, defaults filled in. The default instance is a conforming component. */
function fromFixture(json) {
  return {
    name: 'fixture', bucket: 'fixture', shared: false, hasManifest: true, hasStyles: true, strayCss: [], variants: [],
    unrenderedVariants: [], lintRefusedVariants: [], axisProblems: [], capacityProblems: [], physical: 0,
    cardRowLabel: false, declaresCards: false, ...json,
  };
}

const real = (i) => !i.shared;

const clauses = [
  {
    id: 'component.files-both-ways',
    level: 'conditional',
    tier: 'static',
    applies: real,
    check: (i) => {
      if (i.hasManifest && !i.hasStyles) return `${i.name}.manifest.json has no ${i.name}.styles.css beside it: a component with no layout`;
      if (!i.hasManifest && i.hasStyles) return `${i.name}.styles.css has no ${i.name}.manifest.json beside it: CSS the engine never lists`;
      if (!i.hasManifest) return `${i.bucket ? `lib/components/${i.bucket}/${i.name}` : `lib/components/${i.name}`}/ holds no manifest: a folder with a name that is not a component (shared folders start with '_')`;
      return null;
    },
    fixtures: { fails: 'css-without-manifest', passes: 'conforming' },
    reach: 70,
    catches: [],
    catchesNone: 'All 75 components have both files on 2026-10-16 (measured). The note found the CSS-only case live in `_qr-card/`; that folder is a shared sheet, which `css-wired` checks instead.',
    added: ADDED,
    why: `${NOTE} §3.3`,
  },
  {
    id: 'component.css-wired',
    level: 'conditional',
    tier: 'static',
    applies: (i) => i.strayCss.length > 0,
    check: (i) => {
      const loose = i.strayCss.filter((s) => !s.wired).map((s) => s.file);
      return loose.length ? `${loose.join(', ')} is a stylesheet nothing in tools/build-css.js names, so it never ships` : null;
    },
    fixtures: { fails: 'stray-css-unwired', passes: 'stray-css-wired' },
    reach: 2,
    catches: [],
    catchesNone: 'Both stray sheets (`_qr-card/qr-general.css`, `_chart-family/chart-finish.generated.css`) are wired on 2026-10-16. The audit found `_qr-card` invisible to every gate; this makes its wiring a checked fact.',
    added: ADDED,
    why: `${NOTE} §3.3`,
  },
  {
    id: 'component.variants-rendered',
    level: 'conditional',
    tier: 'static',
    applies: (i) => real(i) && i.variants.length > 0,
    check: (i) => (i.unrenderedVariants.length ? `no gallery slide shows ${i.unrenderedVariants.join(', ')}: the render tier never sees a variant the gallery does not draw` : null),
    fixtures: { fails: 'variant-not-in-gallery', passes: 'conforming-variant' },
    reach: 40,
    catches: [],
    catchesNone: 'All 224 variants are drawn on 2026-10-16 (cards-grid and cards-stack `numbered` by footer, since an ordered list is the variant). It is the reach guarantee for the render tier, which renders the galleries.',
    added: ADDED,
    why: `${NOTE} §6.2 Family A`,
  },
  {
    id: 'component.variant-known-to-lint',
    level: 'conditional',
    tier: 'static',
    applies: (i) => real(i) && i.variants.length > 0,
    check: (i) => (i.lintRefusedVariants.length ? `lint:deck calls ${i.lintRefusedVariants.join(', ')} an unknown class, though the manifest lists it` : null),
    fixtures: { fails: 'variant-lint-refuses', passes: 'conforming-variant' },
    reach: 40,
    catches: [],
    catchesNone: 'Every manifest variant lints clean on 2026-10-16. It keeps the manifest and the linter from drifting apart.',
    added: ADDED,
    why: `${NOTE} §6.2 Family A`,
  },
  {
    id: 'component.axes-coherent',
    level: 'if-present',
    tier: 'static',
    applies: (i) => real(i) && i.hasManifest,
    check: (i) => (i.axisProblems.length ? i.axisProblems.join('; ') : null),
    fixtures: { fails: 'axis-member-not-a-variant', passes: 'conforming' },
    reach: 70,
    catches: [],
    catchesNone: 'Every declared `variantAxes` is coherent on 2026-10-16. It keeps an exclusive axis from naming a variant that no longer exists.',
    added: ADDED,
    why: `${NOTE} §6.2 Family A`,
  },
  {
    id: 'component.capacity-coherent',
    level: 'if-present',
    tier: 'static',
    applies: (i) => real(i) && i.hasManifest,
    check: (i) => (i.capacityProblems.length ? i.capacityProblems.join('; ') : null),
    fixtures: { fails: 'capacity-out-of-order', passes: 'conforming' },
    reach: 70,
    catches: [],
    catchesNone: 'Every declared capacity is ordered and every escalateTo names something real on 2026-10-16. Whether the declared number is TRUE (measured at `soft`, §6.3 rule 3) needs a render and is not in this phase.',
    added: ADDED,
    why: `${NOTE} §6.3 rule 3`,
  },
  {
    id: 'component.logical-properties',
    level: 'conditional',
    tier: 'static',
    applies: (i) => real(i) && i.hasStyles,
    measure: (i) => i.physical,
    check: (i) => (i.physical ? `${i.physical} physical left/right declaration(s) in ${i.name}.styles.css: use margin-inline-*, padding-inline-*, inset-inline-*, text-align: start/end` : null),
    fixtures: { fails: 'physical-left-right', passes: 'conforming' },
    reach: 70,
    catches: ['2026-10-16: right-to-left text is in scope (§12.5) and component CSS carries hundreds of physical left/right declarations that do not mirror; the ratchet seeds today\'s count per component (see test/conformance/debt.json) and only lets it fall'],
    added: ADDED,
    why: `${NOTE} §12.5`,
  },
  {
    id: 'component.card-row-labeled',
    level: 'conditional',
    tier: 'static',
    applies: real,
    check: (i) => (typeof i.cardRowLabel === 'boolean' || i.cardRowLabel === 'candidate' ? null : `${i.cardRowLabel === null ? 'no label' : `label ${JSON.stringify(i.cardRowLabel)} is not true or false`} in test/conformance/card-row-corpus.json (labels, or candidates with a reason): say whether ${i.name} has a row of equal cards`),
    fixtures: { fails: 'card-row-unlabeled', passes: 'conforming' },
    reach: 70,
    catches: ['2026-10-15: nothing asked whether a component SHOULD declare `cards`; stats, actors and kpi had card rows and never did (§3.1 row 1)'],
    added: ADDED,
    why: `${NOTE} §12.2`,
  },
  {
    id: 'component.cards-declared',
    level: 'conditional',
    tier: 'static',
    applies: (i) => real(i) && i.cardRowLabel === true,
    check: (i) => (i.declaresCards ? null : `${i.name} has a card row (corpus) but no \`cards\` in its manifest, so a deck's \`cards:\` does nothing on it`),
    fixtures: { fails: 'card-row-undeclared', passes: 'card-row-declared' },
    reach: 20,
    catches: ['2026-10-15: stats, actors and kpi hard-code their own card alignment and ignore a deck\'s `cards:` (resolve-cards.js:31; stats.styles.css:147; actors.styles.css:31,48; kpi.styles.css:649); all three adopted `cards` on 2026-10-16 (owner ruling, demo deck examples/cards-stats-actors-kpi.md), so the clause passes on all 23 labeled components'],
    added: ADDED,
    why: `${NOTE} §12.2`,
  },
];

/**
 * The RENDER clauses: declared here so the checklist shows the whole contract, run by
 * tools/conformance-render.js, report-only until the owner sets the per-PR budget (§12.4).
 * Not evaluated by lib/conformance/run.js.
 */
const renderClauses = [
  { id: 'component.render.fits', axes: ['variant'], what: 'every variant slide fits its frame (the shared overflow oracle)', status: 'report-only', why: `${NOTE} §6.2 Family A` },
  { id: 'component.render.contrast', axes: ['variant', 'theme', 'scheme'], what: 'every text run meets WCAG AA in every shipped palette, light and dark (the shared contrast probe, large text not exempted)', status: 'report-only', why: `${NOTE} §3.1` },
  { id: 'component.render.axe', axes: ['variant'], what: 'axe-core finds no violation other than contrast on any variant slide', status: 'report-only', why: `${NOTE} §6.2 Family A` },
  { id: 'component.render.card-row', axes: ['variant'], what: 'the geometric card-row trigger agrees with the hand-labeled corpus; its hit and miss rate is published (§6.3 rule 6)', status: 'report-only', why: `${NOTE} §6.3 rule 6` },
];

module.exports = {
  kind: 'component',
  title: 'Component',
  summary: 'Every folder under lib/components/: manifest and stylesheet both ways, every variant drawn and known to lint, coherent axes and capacity, logical (RTL-safe) properties, a labeled card row that declares `cards`. Rendered clauses run nightly and, for changed components, per PR; both report-only.',
  context: () => context(),
  contextAt: context,
  measure,
  enumerate,
  instanceId: (i) => i.name,
  fromFixture,
  clauses,
  renderClauses,
  physicalCount,
};
