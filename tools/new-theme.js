#!/usr/bin/env node
/**
 * Scaffold a new Lattice palette from the indaco template.
 *
 * Usage:
 *   npm run new:theme <name>           # creates themes/<name>.css
 *                                      # and    themes/<name>-dark.css
 *   node tools/new-theme.js <name>     # equivalent direct invocation
 *
 * The new files copy themes/indaco.css and themes/indaco-dark.css verbatim,
 * with the @theme directive rewritten and a single TODO(palette) checklist
 * block inserted at the top of the light file. The DIAGRAM OVERRIDES
 * section in lattice.css references --diagram-* tokens by var(--token),
 * so it inherits the author's new values without selector edits.
 *
 * See themes/README.md for the mental model and 5-minute path.
 * See design/theming.md for the variable contract and the --diagram-*
 * taxonomy.
 */


const fs   = require('fs');
const path = require('path');

const ROOT          = path.join(__dirname, '..');
const THEMES_DIR    = path.join(ROOT, 'themes');
const TEMPLATE      = path.join(THEMES_DIR, 'indaco.css');
const TEMPLATE_DARK = path.join(THEMES_DIR, 'indaco-dark.css');

const NAME_RE  = /^[a-z][a-z0-9_-]{1,31}$/;
const RESERVED = new Set([
  'lattice', 'indaco', 'indaco-dark',
  'cuoio', 'cuoio-dark', 'atelier', 'atelier-dark',
  'brina', 'brina-dark', 'burgundy', 'burgundy-dark',
  'crepuscolo', 'crepuscolo-dark', 'laguna', 'laguna-dark',
  'magnolia', 'magnolia-dark', 'mustard', 'mustard-dark',
  'onyx', 'onyx-dark', 'ardesia', 'ardesia-dark',
  'carbone', 'concrete', 'concrete-dark',
]);

function bail(msg, code = 1) {
  process.stderr.write(`new-theme: ${msg}\n`);
  process.exit(code);
}

function capitalise(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function checklistBlock(name) {
  return `\n/* TODO(palette) — author checklist for ${name}
 * ════════════════════════════════════════════════════════════════════════
 * grep this file for TODO(palette) to find each edit point. In order of
 * impact (see themes/README.md for the rationale on each):
 *
 *   1. Brand axis        — 3-5 hex anchors along one hue. Single source
 *                          of truth; drives accent, surface-inverse, spectrum.
 *   2. Surfaces / ink    — light-dark() pairs for bg, bg-alt, border,
 *                          text-* tokens. Edit the LIGHT side here; the
 *                          DARK side resolves to --scheme-dark-* below.
 *   3. Accent            — most-seen colour after ink. Must clear 4.5:1
 *                          on --bg AND on --accent-soft.
 *   4. Categorical cycle  — --cat-1-fill..--cat-12-fill paired with
 *                          --cat-1-mark..--cat-12-mark, plus the inks
 *                          --cat-on-fill / --cat-on-mark. Each is a FLIPPING
 *                          light-dark() tier of one hue: fill = light-dark(
 *                          pale, jewel); mark = light-dark(deep, pale). The
 *                          inks FLIP too (--cat-on-fill: var(--text-heading)).
 *                          Holds the three-layer contract (mark-vs-bg >=3:1,
 *                          ink-vs-fill >=4.5:1, fill != mark) — checkCatContrast
 *                          gates it, both modes. See design/skills/theme.md.
 *   5. Diagram structural — --diagram-stroke, --diagram-line,
 *                          --diagram-accent-warm, and the universal semantic
 *                          palette (--diagram-active*, --diagram-done*,
 *                          --diagram-critical*, --diagram-today, --diagram-note).
 *                          Borders, edges, gantt state, notes, alarm.
 *   6. Chart palette     — --chart-cat1..--chart-cat8 (hues; fill/ink derived)
 *                          and --chart-state-{pass,warn,fail,info,mute}. Verify
 *                          distinguishability with:
 *                            node tools/contrast-audit.js ${name}
 *   7. Dark-variant      — --scheme-dark-* tokens, the DARK side of every
 *                          light-dark() pair above.
 *   8. Semantic signals  — --pass / --fail / --warn. Usually inherit.
 *
 * The DIAGRAM OVERRIDES section in lattice.css consumes --diagram-*
 * by name, so per-diagram CSS picks up your values automatically.
 *
 * Delete this block when the palette ships.
 * ════════════════════════════════════════════════════════════════════════
 */
`;
}

function transformPalette(src, name) {
  const Title = capitalise(name);

  // Fail loudly if indaco.css drifts away from the patterns this script
  // depends on; that's a signal to revisit the scaffolder rather than to
  // silently produce a half-rewritten file.
  const checks = [
    [/@theme\s+indaco(?!-)/,                                  'opening @theme directive'],
    [/Lattice · Indaco palette/,                              'header title line'],
    [/The default Lattice palette — cool indigo\./,           'indigo description block'],
    [/This file is the canonical palette template/,           'canonical-template block'],
    [/\*\/\s*\n@import\s+'lattice'/,                          'header-to-@import boundary'],
  ];
  for (const [re, label] of checks) {
    if (!re.test(src)) {
      bail(`themes/indaco.css no longer matches expected pattern: ${label}. ` +
           `Update tools/new-theme.js.`);
    }
  }

  const indigoDescription = / \* The default Lattice palette — cool indigo\. Pale-cool surfaces with\n \* saturated brand navy borders and dark slate ink\. Saturated red is\n \* reserved for alarm states \(gantt critical, error fills\) — every other\n \* surface in this palette stays pale so the deck reads as ink-on-paper\.\n/;
  const templateNote = / \*\n \* This file is the canonical palette template: copy it to\n \* themes\/<name>\.css and edit the tokens to author a new palette\.\n/;

  return src
    .replace(/@theme\s+indaco(?!-)/g, `@theme ${name}`)
    .replace(/Lattice · Indaco palette/g, `Lattice · ${Title} palette`)
    .replace(indigoDescription,
      ` * TODO(palette): one-paragraph voice for ${Title}. Name the hue\n` +
      ` * family, the surface character, and any deviations from the default\n` +
      ` * pale-fill / saturated-border / alarm-only-red contract below.\n`)
    .replace(templateNote, '')
    .replace(/(\*\/\s*\n)(@import\s+'lattice')/, `$1${checklistBlock(name)}\n$2`);
}

function transformDarkWrapper(src, name) {
  const Title = capitalise(name);

  const checks = [
    [/@theme\s+indaco-dark\b/,         'opening @theme directive (dark)'],
    [/@import\s+'indaco'/,             '@import target (dark wrapper)'],
    [/Lattice · Indaco \(dark canvas\)/, 'header title line (dark)'],
  ];
  for (const [re, label] of checks) {
    if (!re.test(src)) {
      bail(`themes/indaco-dark.css no longer matches expected pattern: ${label}. ` +
           `Update tools/new-theme.js.`);
    }
  }

  return src
    .replace(/@theme\s+indaco-dark\b/g, `@theme ${name}-dark`)
    .replace(/@import\s+'indaco'/g,     `@import '${name}'`)
    .replace(/Lattice · Indaco \(dark canvas\)/g, `Lattice · ${Title} (dark canvas)`)
    .replace(/Thin wrapper over indaco/g, `Thin wrapper over ${name}`)
    .replace(/indaco's light-dark\(\)/g, `${name}'s light-dark()`);
}

function main() {
  const name = process.argv[2];
  if (!name) bail('usage: npm run new:theme <name>');
  if (!NAME_RE.test(name)) {
    bail(`invalid name "${name}". Use lowercase letters, digits, _ and -; ` +
         `start with a letter; 2-32 chars.`);
  }
  if (RESERVED.has(name)) bail(`name "${name}" is reserved or already in use.`);

  const outLight = path.join(THEMES_DIR, `${name}.css`);
  const outDark  = path.join(THEMES_DIR, `${name}-dark.css`);

  if (fs.existsSync(outLight)) bail(`themes/${name}.css already exists — refusing to overwrite.`);
  if (fs.existsSync(outDark))  bail(`themes/${name}-dark.css already exists — refusing to overwrite.`);

  const tmplLight = fs.readFileSync(TEMPLATE, 'utf8');
  const tmplDark  = fs.readFileSync(TEMPLATE_DARK, 'utf8');

  fs.writeFileSync(outLight, transformPalette(tmplLight, name));
  fs.writeFileSync(outDark,  transformDarkWrapper(tmplDark, name));

  process.stdout.write(
    `Created themes/${name}.css\n` +
    `        themes/${name}-dark.css\n` +
    `\n` +
    `Next:\n` +
    `  1. Open themes/${name}.css; the TODO(palette) checklist at the top\n` +
    `     lists every edit point in order of impact.\n` +
    `  2. Edit the brand axis first; everything else hangs off it.\n` +
    `  3. Build a deck:\n` +
    `       node lattice-emulator.js examples/gallery.md /tmp/${name}.pdf ${name}\n` +
    `  4. Verify diagrams:\n` +
    `       node lattice-emulator.js examples/mermaid-gallery.md /tmp/${name}-mermaid.pdf ${name}\n` +
    `  5. Audit contrast:\n` +
    `       node tools/contrast-audit.js ${name}\n` +
    `\n` +
    `Reference: themes/README.md (mental model), design/theming.md (depth).\n`
  );
}

main();
