/**
 * Unit: tools/build-marp-kit.js — the copy-and-go kit in dist/marp-kit.
 *
 * These assertions are chosen for ONE property: every failure they catch is
 * SILENT. A kit missing a font renders in system serif with no error. A kit
 * whose config drops `html: true` prints the deck's <script> tags as visible
 * text and builds no charts. A minifier that strips the `@theme` comment yields
 * unstyled slides and no diagnostic. #1256 shipped four such defects for months
 * precisely because nothing on our side rendered the bundle.
 *
 * What this file does NOT do is render. A real marp-cli render of this exact
 * kit is scoped in engineering/decisions/2026-08-03-export-fidelity-gate-scoping.md
 * and is deliberately not a unit test — it needs Chromium.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildKit, fontFiles, DECK } = require('../../../tools/build-marp-kit.js');

const KIT = buildKit();
const text = (k) => {
  const v = KIT.get(k);
  assert.ok(v, `kit is missing ${k}`);
  return Buffer.isBuffer(v) ? v.toString('utf8') : String(v);
};

test('ships every file a recipient needs, and nothing they must fetch', () => {
  for (const f of [
    DECK,
    'lattice.min.css',
    'cuoio.min.css',
    'cuoio-dark.min.css',
    'lattice-runtime.min.js',
    'mermaid-v11.min.js',
    'marp.config.cjs',
    '.vscode/settings.json',
    'README.md',
  ]) {
    assert.ok(KIT.has(f), `kit is missing ${f}`);
  }
});

test('carries every font its own CSS references — the silent #1256 failure', () => {
  // lattice.css points at fonts with `url(fonts/…)`, relative to the stylesheet.
  // A kit without them does not error; it falls back to system serif, which is
  // exactly how the export shipped broken title slides for months.
  const css = [...KIT.keys()].filter((k) => k.endsWith('.css')).map(text);
  const needed = fontFiles(css);
  assert.ok(needed.length > 0, 'expected the CSS to reference bundled fonts');
  for (const f of needed) {
    assert.ok(KIT.has(`fonts/${f}`), `kit references fonts/${f} but does not ship it`);
  }
});

test('minified CSS still declares its @theme — the directive lives in a comment', () => {
  // A stock minifier strips comments, which would leave Marp unable to register
  // the stylesheet at all: unstyled slides, no error. tools/minify-css.js exists
  // to preserve these tokens; this asserts the guard still holds in the artifact.
  assert.match(text('lattice.min.css'), /@theme\s+lattice\b/);
  assert.match(text('cuoio.min.css'), /@theme\s+cuoio\b/);
  assert.match(text('lattice.min.css'), /@size\s+hd\b/);
});

test('both configs set html:true — without it the runtime never loads', () => {
  // marp-core defaults to html:false, which ESCAPES raw HTML rather than
  // dropping it. The deck's two trailing <script> tags then print as literal
  // text on the last slide and no chart or diagram is ever built (#1256 §1).
  assert.match(text('marp.config.cjs'), /html:\s*true/);
  const vs = JSON.parse(text('.vscode/settings.json'));
  assert.equal(vs['markdown.marp.enableHtml'], true);
});

test('both configs register the ENGINE css, not just the palette', () => {
  // Every palette does `@import 'lattice'` BY NAME, and only Marp's theme set
  // resolves a by-name import. Registering cuoio alone silently yields a deck
  // with no layout rules at all.
  assert.match(text('marp.config.cjs'), /lattice\.min\.css/);
  const themes = JSON.parse(text('.vscode/settings.json'))['markdown.marp.themes'];
  assert.ok(
    themes.some((t) => t.includes('lattice.min.css')),
    'VS Code settings must register lattice.min.css, not only the palette',
  );
});

test('the sample deck loads its scripts LAST, after every slide', () => {
  const deck = text(DECK);
  const runtime = deck.indexOf('<script src="lattice-runtime.min.js">');
  assert.ok(runtime > 0, 'sample deck must load the runtime');
  // Marp emits raw HTML inline in document order, so a <script> at the top
  // lands inside slide 1 and runs before the rest of the deck exists. Nothing
  // may follow the script block except whitespace.
  assert.equal(deck.slice(runtime).split('\n').slice(1).join('').trim(), '');
  assert.ok(
    deck.indexOf('<script src="mermaid-v11.min.js">') < runtime,
    'mermaid must load before the runtime that drives it',
  );
});

test('the sample deck exercises the constructs that break, not just prose', () => {
  // A sample too simple to break is worthless as a fidelity check. These are
  // exactly the constructs #1256 found shipping broken.
  const deck = text(DECK);
  assert.match(deck, /```mermaid/, 'needs a Mermaid diagram');
  assert.match(deck, /_class: radar/, 'needs a runtime-built chart');
  assert.match(deck, /_class: split-panel/, 'needs a transform-driven layout');
  assert.match(deck, /_class: matrix-grid/, 'needs the matrix-grid checkbox transform');
  assert.match(deck, /_class: math/, 'needs KaTeX math');
});

test('the sample deck declares front matter Marp can actually read', () => {
  const fm = text(DECK).split('---')[1];
  assert.match(fm, /marp:\s*true/, 'without this the VS Code extension never activates');
  assert.match(fm, /theme:\s*cuoio/, 'must name the palette the kit ships');
  // `size: hd` is deliberate: at 4k this 14-slide deck did not finish rendering
  // through marp-cli, while hd completes in seconds. A copy-and-go kit has to
  // work on a modest machine the first time.
  assert.match(fm, /size:\s*hd/);
});

test('no inline `<!-- … -->` literal in the deck — the mono font ligates it', () => {
  // Inline code spans render `<!--` as an arrow glyph in the mono stack, which
  // mangles the very syntax this deck exists to document. Fenced blocks are
  // unaffected, so literals belong there.
  const deck = text(DECK);
  const inlineComment = /`[^`\n]*<!--[^`\n]*`/.exec(deck);
  assert.equal(
    inlineComment,
    null,
    `inline comment literal would render as an arrow glyph: ${inlineComment?.[0]}`,
  );
});

test('the committed dist/marp-kit matches what the builder produces', () => {
  // Guards the copy a recipient actually downloads, not just the generator.
  const root = path.join(__dirname, '../../../dist/marp-kit');
  for (const [rel, body] of KIT) {
    const p = path.join(root, rel);
    assert.ok(fs.existsSync(p), `dist/marp-kit is missing ${rel} — run npm run build`);
    const want = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
    assert.ok(fs.readFileSync(p).equals(want), `dist/marp-kit/${rel} is stale`);
  }
});
