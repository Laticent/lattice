/**
 * The findings a superseded Segno phase-2 review raised against the merged readers
 * (followups.d/2519-p2-check-phase-2a-trio-findings-against-2513.md). #2537 landed the
 * `pill-literal` rule for finding 1 first (its tests are in test/unit/components/lint-core.test.js);
 * this file pins what that PR left: the escape the rule suggests, and finding 3 in render paths.
 *
 *   1. a pill label holding `|` `=` `[` `]` `{` `"` rendered literal with no lint warning — CONFIRMED,
 *      fixed by `pill-literal` (#2537); the escape it suggests is here;
 *   2. `{"BETA"}` loses its quotes — REFUTED: quotes are the notation's delimiters (Segno note
 *      § Quoting and escaping), and `{"\"BETA\""}` draws them;
 *   3. a fix built with String.replace(text, to) expands `$&` in author text — CONFIRMED in the
 *      spark-size fix, fixed with a function replacer;
 *   4. a fast path that walks the parser's reused buffer — REFUTED, pinned in
 *      docs/src/lib/segno/schema.test.ts ("a custom type that parses while a record binds").
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const lintCore = require('../../../lib/authoring/lint-core.js');
const pills = require('../../../lib/core/inline-pills.js');
const directives = require('../../../lib/core/inline-code-directives.js');

const deck = (body, fm = '') => `---\nmarp: true\n${fm}---\n\n${body}\n`;
const pillLiterals = (src) => lintCore.findLiteralPills(src).map((f) => f.span);

describe('the pill escape — what this PR adds beside #2537\'s `pill-literal`', () => {
  test('the escape the rule offers costs no visible backslash, and silences it', () => {
    assert.equal(directives.escapedText('\\{A|B}'), '{A|B}');
    assert.equal(directives.escapedText('\\{dotted, cross}'), '{dotted, cross}');
    assert.equal(directives.escapedText('\\{LIVE}'), '{LIVE}', 'a working pill escapes as before');
    assert.equal(directives.escapedText('\\{ a }'), null, 'not a pill attempt, so the backslash stays');
    assert.equal(directives.escapedText('\\d+'), null);
    assert.ok(pillLiterals(deck('- `{A|B, tag}`')).length === 1, 'control: the unescaped span warns');
    assert.deepEqual(pillLiterals(deck('- `\\{A|B, tag}`')), []);
  });

  test('LaTeX, regex intervals and template tags are not pill attempts — the backslash stays', () => {
    // The checker's repro: an escaped opener with an escaped closer was half-stripped.
    for (const s of ['\\{2,3\\}', '\\{a,b\\}', '\\{1,2}']) assert.equal(directives.escapedText(s), null, s);
  });
});

describe('quotes — finding 2 (refuted: they are the notation\'s delimiters)', () => {
  test('a quoted label draws its text; escaped quotes draw quotes', () => {
    assert.equal(pills.pillHtml('{"BETA"}'), '<span class="lat-pill" data-shape="pill">BETA</span>');
    assert.equal(pills.pillHtml('{"\\"BETA\\""}'), '<span class="lat-pill" data-shape="pill">&quot;BETA&quot;</span>');
  });
});

describe('autofix replacements — finding 3', () => {
  test('a spark-size fix keeps `$&` and `$\'` in the span as written', () => {
    // Unreachable from the Studio today (a span holding `$` does not render as a spark, so it
    // is never measured), but the function takes any report, and a string replacement would
    // splice the matched span into the fix.
    for (const tail of ['"$&"', '"$\'"']) {
      const span = `~{1 2 3, ${tail}}`;
      const [f] = lintCore.sparkFitFindings(deck(`## A\n\nBody \`${span}\``), [{ src: span, why: 'wide', to: 'sm', over: 9, stillOver: false }]);
      assert.equal(f.replace.to, `\`~{1 2 3, ${tail}, sm}\``);
    }
  });
});

describe('author text in a string replacement — the rest of finding 3\'s class', () => {
  test('a QR label holding `$&` keeps it', () => {
    const { qrSvg } = require('../../../lib/engine/qr.js');
    const out = qrSvg('https://example.com', { label: 'Pay $& now' });
    assert.match(out, /aria-label="Pay \$&amp; now"/);
    assert.match(out, /<title>Pay \$&amp; now<\/title>/);
  });

  test('a blocked web image keeps a `$&` or `$`` in its recorded address', () => {
    const { blockWebImages } = require('../../../lib/core/remote-ref.js');
    // Each pair is [what the author wrote, how the attribute must carry it].
    for (const [q, attr] of [['$&', '$&amp;'], ['$`', '$`']]) {
      const out = blockWebImages(`<img src="https://cdn.example.com/a.png?x=${q}y">`).html;
      assert.ok(out.includes(`data-lattice-web-src="https://cdn.example.com/a.png?x=${attr}y"`), out);
    }
  });
});

describe('author class words in a string replacement', () => {
  test('a split-panel slide whose class words hold `$&` keeps one well-formed class attribute', () => {
    const { createEngine } = require('../../../lib/engine/index.js');
    const out = createEngine().render(deck('<!-- _class: split-panel proof x$&y -->\n\n## A\n\n- a\n- b'));
    const html = String(out.html || out);
    const open = html.match(/<section[^>]*split-panel[^>]*>/)[0];
    assert.equal(open.match(/\sclass="/g).length, 1, open);
    assert.match(open, /\sclass="[^"]*x\$&amp;y[^"]*"/);
  });
});

describe('author text in a string replacement — the sites followups.d/2519-p3 named', () => {
  const meta = require('../../../lib/forms/tile/meta/meta.transform.js');
  const roadmap = require('../../../lib/components/chart/roadmap/roadmap.transform.js');
  const TOKENS = ['$&', '$`', "$'"];

  test('a `meta:` value holding a replacement token keeps it', () => {
    const page = '<header>H</header><div class="masthead-bay"></div><footer>F</footer>';
    for (const q of TOKENS) {
      const out = meta.applyToHtml(page, `---\nmarp: true\nmeta: "Pay ${q} now"\n---\n`);
      const bay = out.match(/<div class="masthead-bay">([\s\S]*?)<\/div>/)[1];
      assert.ok(!/masthead-bay|<header>|<footer>/.test(bay), `${q}: page markup spliced into the bay: ${bay}`);
      assert.ok(bay.includes('Pay') && bay.includes('now'), `${q}: ${bay}`);
    }
  });

  test('a roadmap status cell and a horizons card holding `$&` keep it', () => {
    const table = (cell) => `<table><thead><tr><th>W</th><th>Phase 01</th><th>Phase 02</th></tr></thead><tbody><tr><td>Intake</td><td>${cell}</td><td>Two</td></tr></tbody></table>`;
    const status = roadmap.applyStatusMarkers(table('[x] Pay $& now'));
    assert.match(status, /Pay \$& now/);
    assert.equal((status.match(/<tbody/g) || []).length, 1, status);
    const horizons = roadmap.applyHorizons(table('Pay $& now'));
    assert.match(horizons, /Pay \$& now/);
    assert.doesNotMatch(horizons, /<table/, horizons);
  });
});
