/**
 * Unit: lib/core/carousel.js — the read-across SPLIT move (the cover carousel family).
 *
 * Every read-across layout shares ONE accent cover→content finish (the split-panel
 * treatment set as the fidelity bar): compare-prose (cover-sides), split-panel
 * (feature-cover), list-tabular (cover-rows), decision (cover-decision), compare-code
 * (cover-code). Each strategy parses the REAL rendered DOM (driven against committed
 * fixtures so the parser can't drift from the engine) and re-emits role sections;
 * an unparseable shape returns null so the caller leaves it for the ring.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { carouselize, readSubjects, readFeature, readRows } = require('../../../lib/core/carousel');
const { splitSections } = require('../../../lib/core/split-sections');
// The content-cell reader + depth-aware top-level walk the engine itself uses to place
// trailing material — the rule-6 gate below appends its sentinels at the SAME position
// rather than guessing one (HARD RULE #15).
const { extractStage } = require('../../../lib/core/below-note');
const { topLevelElements } = require('../../../lib/core/split-envelope');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/compare-prose.rendered.html'), 'utf8');
const [section] = splitSections(fixture).filter((p) => p.type === 'section');
const recipe = { strategy: 'cover-sides' };

const spFixture = fs.readFileSync(path.join(__dirname, 'fixtures/split-panel.rendered.html'), 'utf8');
const [spSection] = splitSections(spFixture).filter((p) => p.type === 'section');
const clsOf = (sec) => (sec.match(/\sclass="([^"]*)"/) || ['', ''])[1];

const ltFixture = fs.readFileSync(path.join(__dirname, 'fixtures/list-tabular.rendered.html'), 'utf8');
const [ltSection] = splitSections(ltFixture).filter((p) => p.type === 'section');

const dcFixture = fs.readFileSync(path.join(__dirname, 'fixtures/decision.rendered.html'), 'utf8');
const [dcSection] = splitSections(dcFixture).filter((p) => p.type === 'section');

const ccFixture = fs.readFileSync(path.join(__dirname, 'fixtures/compare-code.rendered.html'), 'utf8');
const [ccSection] = splitSections(ccFixture).filter((p) => p.type === 'section');

describe('core: carousel — readSubjects', () => {
  test('extracts exactly two label/body subjects from the real compare-prose DOM', () => {
    const subjects = readSubjects(section.inner);
    assert.equal(subjects.length, 2);
    assert.equal(subjects[0].label, 'Before Calibration');
    assert.equal(subjects[1].label, 'After Calibration');
    assert.match(subjects[0].body, /Equal weights/);
    assert.match(subjects[1].body, /historical accuracy/);
  });

  test('returns null when the slide is not a two-subject list', () => {
    assert.equal(readSubjects('<h2>x</h2><ul><li><strong>only one</strong><ul><li>b</li></ul></li></ul>'), null);
  });
});

describe('core: carousel — cover-sides (compare-prose, the fidelity finish)', () => {
  const parts = carouselize(section.openTag, section.inner, recipe);

  test('emits cover → one subject page each → verdict (the shared cover finish)', () => {
    assert.equal(parts.length, 4);
    assert.match(clsOf(parts[0]), /compare-split-cover/);
    assert.match(clsOf(parts[1]), /compare-split-points/);
    assert.match(clsOf(parts[2]), /compare-split-points/);
    assert.match(clsOf(parts[3]), /compare-split-verdict/);
  });

  test('every frame carries the Form chrome (header + footer)', () => {
    for (const p of parts) {
      assert.match(p, /<header\b/);
      assert.match(p, /<footer\b/);
    }
  });

  test('the cover carries the comparison question on the accent field', () => {
    assert.match(parts[0], /split-feat-h">Scoring model: before and after the calibration loop</);
  });

  test('each subject page is one side: label + body in the shared point finish', () => {
    assert.match(parts[1], /split-pt-t">Before Calibration/);
    assert.match(parts[1], /split-pt-b">Equal weights/);
    assert.match(parts[2], /split-pt-t">After Calibration/);
  });

  test('NO editorial finish — drop-cap / kicker / pull-quote-cover are gone', () => {
    for (const p of parts) {
      assert.doesNotMatch(p, /split-art\b|split-kicker|split-cover-q|split-ord/);
    }
  });

  test('the verdict is the slide synthesis line', () => {
    assert.match(parts[3], /split-pullq">The shift from equal to calibrated weights/);
  });

  test('only the cover keeps the engine id; continuations drop it (no duplicate ids)', () => {
    assert.match(parts[0], /\sid="/);
    for (const p of parts.slice(1)) assert.doesNotMatch(p, /\sid="/);
  });

  test('no synthesis → cover + subject pages only (no verdict frame)', () => {
    const noNote = section.inner.replace(/<div class="below-note">[\s\S]*?<\/div>/, '');
    const out = carouselize(section.openTag, noNote, recipe);
    assert.equal(out.length, 3);
    assert.equal(out.filter((p) => /compare-split-verdict/.test(p)).length, 0);
  });

  test('an absent / unknown recipe is a no-op (null → caller leaves it alone)', () => {
    assert.equal(carouselize(section.openTag, section.inner, null), null);
    assert.equal(carouselize(section.openTag, section.inner, { strategy: 'paginate-rows' }), null);
  });

  test('an unparseable section returns null (→ the ring, never a broken sequence)', () => {
    assert.equal(carouselize('<section class="compare-prose">', '<h2>no subjects here</h2>', recipe), null);
  });
});

describe('core: carousel — feature-cover (split-panel)', () => {
  const cvRecipe = { strategy: 'feature-cover', perPage: 2 };
  const clsOfSp = (sec) => (sec.match(/\sclass="([^"]*)"/) || ['', ''])[1];

  test('readFeature extracts watermark, eyebrow, heading, lede, and points from the real DOM', () => {
    const f = readFeature(spSection.inner);
    assert.equal(f.watermark, 'S');
    assert.equal(f.heading, 'Scoring Model Deep Dive');
    assert.match(f.eyebrow, /Section 01/);
    assert.match(f.lede, /most configurable component/);
    assert.equal(f.points.length, 3);
    assert.equal(f.points[0].title, 'Confidence');
    assert.doesNotMatch(f.points[0].body, /<\/?li/); // multi-bullet join is clean
  });

  test('emits a feature cover then the points paginated perPage at a time', () => {
    const parts = carouselize(spSection.openTag, spSection.inner, cvRecipe); // 3 points, perPage 2 → 1+1 pages? 2+1
    assert.equal(parts.length, 3); // cover + ceil(3/2)=2 point pages
    assert.match(clsOfSp(parts[0]), /split-panel-cover/);
    assert.match(clsOfSp(parts[1]), /split-panel-points/);
    assert.match(clsOfSp(parts[2]), /split-panel-points/);
  });

  test('the cover carries the feature; the watermark sits in a bleed container', () => {
    const [cover] = carouselize(spSection.openTag, spSection.inner, cvRecipe);
    assert.match(cover, /split-feat-h">Scoring Model Deep Dive</);
    assert.match(cover, /split-feat-bleed"[^>]*><div class="split-feat-wm">S</);
  });

  test('every point page repeats the feature heading as a running header', () => {
    const parts = carouselize(spSection.openTag, spSection.inner, cvRecipe);
    for (const p of parts.slice(1)) assert.match(p, /split-runhead">Scoring Model Deep Dive</);
  });

  test('only the cover keeps the engine id; point pages drop it', () => {
    const parts = carouselize(spSection.openTag, spSection.inner, cvRecipe);
    assert.match(parts[0], /\sid="/);
    for (const p of parts.slice(1)) assert.doesNotMatch(p, /\sid="/);
  });

  test('default variant: eyebrow (span.panel-eyebrow) + lede (panel-LEFT <p>) survive on the cover', () => {
    // The default/metric/steps variants render the eyebrow as <span class="panel-eyebrow">
    // and move the lede <p> into panel-left — not the <code>/right-panel shape of watermark.
    const inner =
      '<div class="panel-left"><span class="panel-eyebrow">Q2 board review</span><h2>Renewals held.</h2><p>The quarter closed on plan.</p></div>' +
      '<div class="panel-right"><ul><li><strong>One</strong><ul><li>Body one.</li></ul></li><li><strong>Two</strong><ul><li>Body two.</li></ul></li></ul></div>';
    const f = readFeature(inner);
    assert.equal(f.eyebrow, 'Q2 board review');
    assert.equal(f.lede, 'The quarter closed on plan.');
    assert.equal(f.heading, 'Renewals held.');
    const [cover] = carouselize('<section data-lattice-slide="1" class="split-panel form">', inner, cvRecipe);
    assert.match(cover, /split-feat-eye">Q2 board review</);
    assert.match(cover, /split-feat-lede">The quarter closed on plan.</);
  });

  test('no points (or no panel-right) → null, left for the ring', () => {
    assert.equal(carouselize('<section class="split-panel">', '<div class="panel-left"><h2>x</h2></div>', cvRecipe), null);
  });

  test('the editorial recipe does not match a split-panel section (strategy-gated)', () => {
    assert.equal(carouselize(spSection.openTag, spSection.inner, { strategy: 'editorial' }), null);
  });
});

describe('core: carousel — cover-rows (list-tabular)', () => {
  const cvRecipe = { strategy: 'cover-rows', perPage: 1 };
  const clsOfLt = (sec) => (sec.match(/\sclass="([^"]*)"/) || ['', ''])[1];

  test('readRows reads the leading-text label and the nested body of each row', () => {
    const rows = readRows(ltSection.inner);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].title, 'Confidence');
    assert.match(rows[0].body, /Independent corroborating sources/);
    assert.match(rows[0].body, /enterprise counts as one/); // both nested bullets joined
    assert.doesNotMatch(rows[0].body, /<\/?li/);
  });

  test('emits a title cover then the rows windowed perPage at a time', () => {
    const parts = carouselize(ltSection.openTag, ltSection.inner, cvRecipe); // 2 rows, perPage 1 → 2 pages
    assert.equal(parts.length, 3); // cover + 2 row pages
    assert.match(clsOfLt(parts[0]), /list-tabular-cover/);
    assert.match(clsOfLt(parts[1]), /list-tabular-points/);
    assert.match(clsOfLt(parts[2]), /list-tabular-points/);
  });

  test('the cover carries the table title (no watermark — a table has none)', () => {
    const [cover] = carouselize(ltSection.openTag, ltSection.inner, cvRecipe);
    assert.match(cover, /split-feat-h">The six signal dimensions/);
    assert.doesNotMatch(cover, /split-feat-wm/);
  });

  test('shares the split-panel row finish (running header + split-pt classes)', () => {
    const parts = carouselize(ltSection.openTag, ltSection.inner, cvRecipe);
    assert.match(parts[1], /split-runhead">The six signal dimensions/);
    assert.match(parts[1], /split-pt-t">Confidence/);
  });

  test('only the cover keeps the engine id; row pages drop it', () => {
    const parts = carouselize(ltSection.openTag, ltSection.inner, cvRecipe);
    assert.match(parts[0], /\sid="/);
    for (const p of parts.slice(1)) assert.doesNotMatch(p, /\sid="/);
  });

  test('no rows or no heading → null, left for the ring', () => {
    assert.equal(carouselize('<section class="list-tabular">', '<h2>only a title</h2>', cvRecipe), null);
  });
});

describe('core: carousel — cover-decision (decision)', () => {
  const r = { strategy: 'cover-decision', perPage: 1 };
  const cls = (sec) => (sec.match(/\sclass="([^"]*)"/) || ['', ''])[1];
  const parts = carouselize(dcSection.openTag, dcSection.inner, r);

  test('the verdict heading is the cover; justifications window beneath', () => {
    assert.ok(parts.length >= 2);
    assert.match(cls(parts[0]), /decision-cover/);
    for (const p of parts.slice(1)) assert.match(cls(p), /decision-points/);
    assert.match(parts[0], /split-feat-h">We are building, not buying</);
    assert.match(parts[1], /split-pt-t">Build/);
  });

  test('only the cover keeps the engine id', () => {
    assert.match(parts[0], /\sid="/);
    for (const p of parts.slice(1)) assert.doesNotMatch(p, /\sid="/);
  });

  test('no justification list → null (left for the ring)', () => {
    assert.equal(carouselize('<section class="decision">', '<h2>verdict only</h2>', r), null);
  });
});

describe('core: carousel — cover-code (compare-code)', () => {
  const r = { strategy: 'cover-code' };
  const cls = (sec) => (sec.match(/\sclass="([^"]*)"/) || ['', ''])[1];
  const parts = carouselize(ccSection.openTag, ccSection.inner, r);

  test('emits a title cover then one code block per page (full width)', () => {
    assert.equal(parts.length, 3); // cover + 2 blocks
    assert.match(cls(parts[0]), /compare-code-cover/);
    assert.match(cls(parts[1]), /compare-code-block/);
    assert.match(cls(parts[2]), /compare-code-block/);
  });

  test('each block page carries its label as a running header and the <pre> verbatim', () => {
    assert.match(parts[1], /split-runhead">Before · The Spreadsheet/);
    assert.match(parts[1], /<pre>[\s\S]*<\/pre>/);
    assert.match(parts[2], /split-runhead">After · The Framework/);
  });

  test('fewer than two code blocks → null (left for the ring)', () => {
    assert.equal(carouselize('<section class="compare-code">', '<h2>t</h2><div class="code-cols"><div class="code-col"><pre>x</pre></div></div>', r), null);
  });
});

describe('core: carousel — cover-paginate (dense lists / legal batch)', () => {
  const cls = (sec) => (sec.match(/\sclass="([^"]*)"/) || ['', ''])[1];
  // A statute-stack-shaped section: heading + a leading <code> eyebrow + a native item list.
  const openTag = '<section data-lattice-slide="1" id="s1" class="statute-stack form">';
  const item = (label) => `<li><strong>${label}</strong><ul><li><code>cite</code></li><li>obligation prose</li></ul></li>`;
  // The eyebrow renders BEFORE the title and the subtitle immediately AFTER it — the
  // shape masthead-lift builds (lib/forms/cell/masthead/masthead.transform.js), which is
  // what the shared cover reader keys on. (The old fixture put the eyebrow after the
  // heading, where a real render puts the SUBTITLE; the cover grabbed the first <code>
  // anywhere and so mislabelled a subtitle as the mono-caps kicker.)
  const inner = `<header>H</header><p><code>Scope eyebrow</code></p><h2>Heading</h2><p><code>Seven jurisdictions</code></p><ul>${item('A')}${item('B')}${item('C')}${item('D')}</ul><footer>F</footer>`;
  const recipe = { strategy: 'cover-paginate', axis: 'item', perPage: 2, intro: 'Item by item' };

  test('emits an accent cover then the layout\'s OWN native pages (never flattened)', () => {
    const parts = carouselize(openTag, inner, recipe);
    assert.equal(parts.length, 3); // cover + [2,2]
    assert.match(cls(parts[0]), /lat-split-cover/);
    // body pages keep the NATIVE class + the re-split guard marker, and the native <ul>
    assert.match(cls(parts[1]), /statute-stack/);
    assert.match(cls(parts[1]), /lat-split-native/);
    assert.match(parts[1], /<strong>A<\/strong>/);
    assert.match(parts[2], /<strong>C<\/strong>/);
  });

  test('the cover carries the whole masthead — eyebrow · title · subtitle — and the lead-in', () => {
    const [cover] = carouselize(openTag, inner, recipe);
    assert.match(cover, /split-feat-h">Heading/);
    assert.match(cover, /split-feat-eye">Scope eyebrow/);
    assert.match(cover, /split-feat-sub">Seven jurisdictions/); // §0a: subtitle rides the cover
    assert.match(cover, /split-cover-lead">Item by item/);
  });

  test('only the cover keeps the engine id — body pages never duplicate it', () => {
    const parts = carouselize(openTag, inner, recipe);
    assert.equal(parts[0].match(/\sid="s1"/) ? 1 : 0, 1);
    assert.equal(parts.filter((p) => /\sid="s1"/.test(p)).length, 1);
  });

  test('the measured ratio cuts denser than perPage, never looser', () => {
    // ratio 3 over 4 items → floor(4/3*0.82)=1 per page → cover + 4 pages
    const parts = carouselize(openTag, inner, recipe, 3);
    assert.equal(parts.length, 5);
  });

  test('a single member (can\'t split) → null, left for the ring', () => {
    const one = `<header>H</header><h2>Heading</h2><ul>${item('Solo')}</ul><footer>F</footer>`;
    assert.equal(carouselize(openTag, one, recipe), null);
  });
});

describe('core: carousel — cover-cards (compare-table portrait RESHAPE)', () => {
  // The engine renders compare-table as <h2> + a <table> (thead/tbody). In a portrait box the
  // table can't paginate out of horizontal overflow, so cover-cards TRANSPOSES each row to a
  // card (column headers → field labels) and cover-paginates the cards.
  const ctTag = '<section id="s1" class="content compare-table form" data-lattice-slide="1">';
  const ctInner =
    '<header>H</header>' +
    '<h2>Build versus buy versus delay.</h2>' +
    '<table><thead><tr><th></th><th>Build</th><th>Buy</th><th>Delay</th></tr></thead>' +
    '<tbody>' +
    '<tr><td>Up-front cost</td><td>$1.2M</td><td>$400k</td><td>$0</td></tr>' +
    '<tr><td>Time to value</td><td>9 months</td><td>6 weeks</td><td>None</td></tr>' +
    '<tr><td>Switching risk</td><td>Low</td><td>High</td><td>Rising</td></tr>' +
    '<tr><td>Fit to need</td><td>Exact</td><td>Approximate</td><td>Unknown</td></tr>' +
    '</tbody></table>' +
    '<footer>F</footer>';
  const ctRecipe = { strategy: 'cover-cards', axis: 'row', perPage: 2, intro: 'The full comparison' };
  const parts = carouselize(ctTag, ctInner, ctRecipe, 2, 'compare-table');

  test('emits an accent cover → card pages (perPage groups the rows)', () => {
    assert.equal(parts.length, 3); // 4 rows, perPage 2 → cover + 2 card pages
    assert.match(parts[0], /lat-split-cover/);
    assert.ok(parts.slice(1).every((p) => /lat-split-cards/.test(p)));
  });

  test('the cover carries the compare-table tell marker + heading + intro lead', () => {
    assert.match(parts[0], /split-cover-compare-table/);
    assert.match(parts[0], /split-feat-h">Build versus buy versus delay\./);
    assert.match(parts[0], /split-cover-lead">The full comparison/);
  });

  test('each ROW becomes a card: first cell is the title, columns are labelled fields', () => {
    assert.match(parts[1], /ct-card-title">Up-front cost</);
    assert.match(parts[1], /<dt>Build<\/dt><dd>\$1\.2M<\/dd>/);
    assert.match(parts[1], /<dt>Buy<\/dt><dd>\$400k<\/dd>/);
    assert.match(parts[1], /<dt>Delay<\/dt><dd>\$0<\/dd>/);
  });

  test('no datum is dropped — every cell survives the transpose (axiom 4)', () => {
    const all = parts.join('');
    for (const v of ['$1.2M', '$400k', '$0', '9 months', '6 weeks', 'Rising', 'Approximate', 'Unknown']) {
      assert.ok(all.includes(v), `transpose dropped ${v}`);
    }
  });

  test('only the cover keeps the engine id; card pages drop it (no duplicate ids)', () => {
    assert.equal(parts.filter((p) => /\sid="s1"/.test(p)).length, 1);
    assert.match(parts[0], /\sid="s1"/);
  });

  test('every frame carries the Form chrome (header + footer)', () => {
    assert.ok(parts.every((p) => /<header>H<\/header>/.test(p) && /<footer>F<\/footer>/.test(p)));
  });

  test('a table with <2 rows → null, left for the ring', () => {
    const one = '<h2>X</h2><table><thead><tr><th></th><th>A</th></tr></thead><tbody><tr><td>r</td><td>v</td></tr></tbody></table>';
    assert.equal(carouselize(ctTag, one, ctRecipe, 2, 'compare-table'), null);
  });

  // A trailing key-insight / below-note used to vanish entirely: cover-cards built its
  // pages from the parsed <table> alone, so anything after </table> in the source never
  // reached ANY emitted page (found on a real render — both a blockquote and a note
  // disappeared). `coverCardsSections` now runs the SAME `splitRegions` extraction
  // `splitEnvelope` uses, so this shape gets the identical envelope treatment.
  const ctWithTrailing = ctInner.replace(
    '</table>',
    '</table><blockquote><p>Build only wins if we actually staff it.</p></blockquote>' +
      '<div class="below-note"><p>Source: procurement review.</p></div>',
  );
  const trailingParts = carouselize(ctTag, ctWithTrailing, ctRecipe, 2, 'compare-table');

  test('a trailing key-insight blockquote gets its OWN final page, not dropped', () => {
    assert.equal(trailingParts.length, 4); // cover + 2 card pages + insight
    assert.match(trailingParts.at(-1), /lat-split-insight/);
    assert.match(trailingParts.at(-1), /Build only wins if we actually staff it\./);
    assert.ok(trailingParts.slice(1, -1).every((p) => !p.includes('Build only wins')));
  });

  test('a trailing below-note rides the LAST card page, marked, not its own page', () => {
    const lastCardPage = trailingParts.at(-2); // last card page, before the insight page
    assert.match(lastCardPage, /class="below-note lat-split-note"/);
    assert.match(lastCardPage, /Source: procurement review\./);
    assert.ok(!trailingParts[1].includes('procurement review')); // not on the FIRST card page
  });

  // The density figure is a CEILING, so chunking `i += per` by it left a runt last page —
  // 4 three-field rows at cap 3 came out 3+1, the same "jarring uneven slides" §0b rejects
  // and that `balancedPerPage` fixes on the plain + cover-paginate paths. The suite's other
  // cover-cards cases use perPage 2, where balanced and greedy agree (2+2), which is why
  // this escaped: it needs a cap that does NOT divide the row count evenly. Caught by
  // looking at the re-rendered demo deck.
  test('card pages are BALANCED against the density ceiling, not greedily chunked (no runt page)', () => {
    const per3 = { ...ctRecipe, perPage: 3 };
    const parts3 = carouselize(ctTag, ctInner, per3, 2, 'compare-table');
    const cardPages = parts3.slice(1);
    assert.equal(cardPages.length, 2, '4 rows at a ceiling of 3 → 2 balanced pages, not 3+1');
    const counts = cardPages.map((p) => (p.match(/class="ct-card"/g) || []).length);
    assert.deepEqual(counts, [2, 2], `expected an even 2+2 cut, got ${counts.join('+')}`);
    // …and the ceiling is still respected — balancing never grows a page past the density cap.
    assert.ok(Math.max(...counts) <= 3, 'a balanced page must not exceed the density ceiling');
  });

  test('a trailing note with no insight still lands on the last card page (no insight page emitted)', () => {
    const noteOnly = ctInner.replace('</table>', '</table><div class="below-note"><p>Source only.</p></div>');
    const parts2 = carouselize(ctTag, noteOnly, ctRecipe, 2, 'compare-table');
    assert.equal(parts2.length, 3); // cover + 2 card pages, no extra insight page
    assert.match(parts2.at(-1), /class="below-note lat-split-note"/);
  });
});

describe('core: carousel — redline-blocks (redline portrait SPLIT)', () => {
  // When a collapsed redline still overflows, each block gets its own slide: OLD on one, NEW
  // (with the note riding) on the next, heading + citation repeated, OLD/NEW identity on
  // explicit rl-old/rl-new classes.
  const rlTag = '<section id="r1" class="redline split" data-orientation="portrait" data-lattice-slide="2">';
  const rlInner =
    '<header>H</header>' +
    '<h2>SB-362 rewrote the rule.</h2>' +
    '<p><code>Cal. Civ. Code §1798.135</code></p>' +
    '<blockquote><p>Provide two or more methods to opt out of the sale.</p></blockquote>' +
    '<blockquote><p>Provide at least one method, including a homepage link.</p></blockquote>' +
    '<ul><li><strong>Why this matters.</strong> One duty now.</li></ul>' +
    '<footer>F</footer>';
  const rlRecipe = { strategy: 'redline-blocks' };
  const parts = carouselize(rlTag, rlInner, rlRecipe);

  test('OLD → its own slide, NEW (+ note) → the next', () => {
    assert.equal(parts.length, 2);
    assert.match(parts[0], /blockquote class="rl-old"/);
    assert.match(parts[0], /two or more methods/);
    assert.doesNotMatch(parts[0], /<ul\b/); // the note rides NEW, not OLD
    assert.match(parts[1], /blockquote class="rl-new"/);
    assert.match(parts[1], /at least one method/);
    assert.match(parts[1], /Why this matters/); // note rides the NEW slide
  });

  test('the heading + citation repeat on both slides; the 2nd is marked (cont.)', () => {
    assert.ok(parts.every((p) => /SB-362 rewrote the rule\./.test(p) && /Cal\. Civ\. Code/.test(p)));
    assert.doesNotMatch(parts[0], /lat-cont/);
    assert.match(parts[1], /lat-cont/);
  });

  test('only the first slide keeps the engine id; the wide variant class is dropped', () => {
    assert.equal(parts.filter((p) => /\sid="r1"/.test(p)).length, 1);
    const tokens = (p) => p.match(/class="([^"]*)"/)[1].split(/\s+/);
    assert.ok(parts.every((p) => !tokens(p).includes('split') && tokens(p).includes('redline')));
    assert.ok(parts.every((p) => tokens(p).includes('lat-split-native')));
  });

  test('every frame carries the Form chrome (header + footer)', () => {
    assert.ok(parts.every((p) => /<header>H<\/header>/.test(p) && /<footer>F<\/footer>/.test(p)));
  });

  test('a single-passage redline (1 blockquote) → null, left for the ring', () => {
    const one = '<h2>X</h2><p><code>cite</code></p><blockquote><p>one passage</p></blockquote>';
    assert.equal(carouselize(rlTag, one, rlRecipe), null);
  });

  test('a THIRD blockquote is the key insight — its own closing page, printed ONCE', () => {
    // FM-2 by another route, and the one the rule-6 conservation gate structurally cannot see:
    // a third top-level blockquote was in neither drop-set, so it survived on BOTH pages, and
    // the hoist's containment check then found its text already emitted and stood down. The
    // result was two body pages each carrying the takeaway, and no insight page at all.
    const withInsight = rlInner.replace(
      '<footer>F</footer>',
      '<blockquote><p>One duty is cheaper to audit than two.</p></blockquote><footer>F</footer>',
    );
    const out = carouselize(rlTag, withInsight, rlRecipe);
    const copies = out.join('').split('One duty is cheaper to audit').length - 1;
    assert.equal(copies, 1, 'the key insight appears exactly once across the run');
    assert.equal(out.filter((p) => /\sdata-split-role="insight"/.test(p)).length, 1);
    assert.match(out.at(-1), /One duty is cheaper to audit/);
    // …and the two passages are still where they belong.
    assert.match(out[0], /blockquote class="rl-old"/);
    assert.match(out[1], /blockquote class="rl-new"/);
  });
});

describe('core: carousel — kanban-lanes (kanban portrait, one lane per slide)', () => {
  // The chart family renders kanban as chart-header → chart-body → .kanban-board with one
  // .kanban-column per lane. In portrait each lane gets its own slide: the board re-emits
  // holding a single column, the chart-header repeats.
  const kbTag = '<section id="k1" class="kanban" data-lattice-slide="2">';
  const col = (name, ...cards) =>
    `<div class="kanban-column"><div class="kanban-column-header">${name}</div>` +
    `<div class="kanban-cards">${cards.map((c) => `<div class="kanban-card"><div class="kanban-card-title">${c}</div></div>`).join('')}</div></div>`;
  const kbInner =
    '<div class="chart-header"><p class="chart-eyebrow"><code>Sprint 14</code></p><h2>Where work stands.</h2></div>' +
    '<div class="chart-body"><div class="kanban-board">' +
    col('Backlog', 'A', 'B') + col('In progress', 'C') + col('Done', 'D', 'E') +
    '</div></div>' +
    '<footer>F</footer>';
  const parts = carouselize(kbTag, kbInner, { strategy: 'kanban-lanes' });

  test('one slide per lane, each holding a single column', () => {
    assert.equal(parts.length, 3);
    assert.ok(parts.every((p) => (p.match(/kanban-column"/g) || []).length === 1));
    assert.match(parts[0], /kanban-column-header">Backlog</);
    assert.match(parts[1], /kanban-column-header">In progress</);
    assert.match(parts[2], /kanban-column-header">Done</);
  });

  test('each lane keeps only its own cards', () => {
    assert.equal((parts[0].match(/kanban-card"/g) || []).length, 2); // Backlog: A, B
    assert.equal((parts[1].match(/kanban-card"/g) || []).length, 1); // In progress: C
    assert.equal((parts[2].match(/kanban-card"/g) || []).length, 2); // Done: D, E
    assert.doesNotMatch(parts[0], />C</); // no cross-lane bleed
  });

  test('the chart-header repeats; the first keeps the id, later slides are (cont.) + id-less', () => {
    assert.ok(parts.every((p) => /Where work stands\./.test(p)));
    assert.equal(parts.filter((p) => /\sid="k1"/.test(p)).length, 1);
    assert.match(parts[0], /\sid="k1"/);
    assert.doesNotMatch(parts[0], /lat-cont/);
    assert.ok(parts.slice(1).every((p) => /lat-cont/.test(p) && /lat-split-native/.test(p)));
  });

  test('a single-lane board → null (nothing to split between)', () => {
    const one = '<div class="chart-header"><h2>X</h2></div><div class="chart-body"><div class="kanban-board">' + col('Only', 'A', 'B') + '</div></div>';
    assert.equal(carouselize(kbTag, one, { strategy: 'kanban-lanes' }), null);
  });
});

test('carouselize degrades to null on Object.prototype-shadowing strategy names', () => {
  // A manifest typo like strategy:"toString" must be an unknown strategy
  // (null → left for the ring), not an inherited Object.prototype member.
  for (const strategy of ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf']) {
    assert.equal(carouselize('<section>', '<h2>t</h2>', { strategy }, 1.4, 'content'), null, strategy);
  }
});

// ── §8 rule 9 — the envelope invariant, across ALL NINE strategies ──────────────
// This is the test the rule always asked for and never had. The gate in
// split-envelope.test.js keyed on the CLASS `lat-split-cover`, which only the plain path
// and cover-paginate/cover-cards emit; the per-layout strategies emit their own
// (`split-panel-cover`, `list-tabular-cover`, `decision-cover`, `compare-code-cover`), so
// `covers.length` was 0, `<= 1` passed trivially, and the ordering assertions SKIPPED for
// 6 of the 9 strategies. Found by the HARD RULE #25 trio, two lenses independently.
//
// Now every strategy stamps a kernel-owned `data-split-role` (split-envelope.js `withRole`),
// so ONE assertion covers all of them — and a NEW strategy that forgets to stamp a role
// fails here rather than falling silently outside the invariant.
// The nine-strategy table, at module scope so the rule-9 invariant (below) and the rule-6
// conservation gate (further below) drive the SAME set — a strategy added to one is
// automatically covered by the other. The five read-across cases use the committed rendered
// fixtures; the four dense/native cases hand-author the minimum shape their parser needs.
const ssTag = '<section data-lattice-slide="1" id="s1" class="statute-stack form">';
const ssInner = '<h2>Statutes</h2><ul>' +
  ['A', 'B', 'C', 'D'].map((k) => `<li><strong>${k}</strong><ul><li>body ${k}</li></ul></li>`).join('') +
  '</ul>';
const ctTag = '<section id="s1" class="content compare-table form" data-lattice-slide="1">';
const ctInner = '<h2>Build versus buy.</h2>' +
  '<table><thead><tr><th></th><th>Build</th><th>Buy</th></tr></thead><tbody>' +
  '<tr><td>Cost</td><td>high</td><td>low</td></tr>' +
  '<tr><td>Speed</td><td>slow</td><td>fast</td></tr>' +
  '<tr><td>Risk</td><td>ours</td><td>theirs</td></tr>' +
  '</tbody></table>';
const rlTag = '<section data-lattice-slide="1" id="s1" class="redline split form">';
const rlInner = '<h2>Clause 4</h2><p><code>s.12</code></p>' +
  '<blockquote><p>old text</p></blockquote><blockquote><p>new text</p></blockquote><ul><li>why</li></ul>';
const kbTag = '<section data-lattice-slide="1" id="s1" class="kanban form">';
const kbInner = '<div class="chart-header"><h2>Board</h2></div><div class="chart-body">' +
  '<div class="kanban-board">' +
  '<div class="kanban-column"><h3>To do</h3><div class="kanban-card">a</div></div>' +
  '<div class="kanban-column"><h3>Doing</h3><div class="kanban-card">b</div></div>' +
  '</div></div>';

const STRATEGY_CASES = [
  ['cover-sides',    section.openTag,   section.inner,   { strategy: 'cover-sides' }],
  ['feature-cover',  spSection.openTag, spSection.inner, { strategy: 'feature-cover', perPage: 2 }],
  ['cover-rows',     ltSection.openTag, ltSection.inner, { strategy: 'cover-rows', perPage: 1 }],
  ['cover-decision', dcSection.openTag, dcSection.inner, { strategy: 'cover-decision', perPage: 1 }],
  ['cover-code',     ccSection.openTag, ccSection.inner, { strategy: 'cover-code' }],
  ['cover-paginate', ssTag,             ssInner,         { strategy: 'cover-paginate', axis: 'item', perPage: 2 }],
  ['cover-cards',    ctTag,             ctInner,         { strategy: 'cover-cards', axis: 'row', perPage: 1 }],
  ['redline-blocks', rlTag,             rlInner,         { strategy: 'redline-blocks' }],
  ['kanban-lanes',   kbTag,             kbInner,         { strategy: 'kanban-lanes' }],
];

const roleOf = (sec) => (sec.match(/\sdata-split-role="([^"]*)"/) || [])[1] || null;

describe('core: carousel — every strategy emits a role-stamped envelope (§8 rule 9)', () => {
  for (const [name, tag, inner, rec] of STRATEGY_CASES) {
    test(`${name}: every emitted page carries a valid role, cover first, insight last`, () => {
      const parts = carouselize(tag, inner, rec, 2, name);
      assert.ok(Array.isArray(parts) && parts.length >= 2, `${name}: expected a multi-page split, got ${parts?.length}`);
      const roles = parts.map(roleOf);
      assert.ok(
        roles.every((r) => ['cover', 'body', 'insight'].includes(r)),
        `${name}: un-stamped or unknown role(s) — ${JSON.stringify(roles)}. Every split path must stamp ` +
        `data-split-role or it falls outside the §8 rule 9 invariant, which is how 6 of 9 strategies ` +
        `escaped the gate.`,
      );
      assert.ok(roles.filter((r) => r === 'cover').length <= 1, `${name}: ${roles.filter((r) => r === 'cover').length} covers`);
      assert.ok(roles.filter((r) => r === 'insight').length <= 1, `${name}: >1 insight page`);
      if (roles.includes('cover')) assert.equal(roles[0], 'cover', `${name}: cover is not first — ${roles}`);
      if (roles.includes('insight')) assert.equal(roles.at(-1), 'insight', `${name}: insight is not last — ${roles}`);
    });
  }
});

// ── §8 rule 6 — CONTENT CONSERVATION, across ALL NINE strategies ────────────────
// "Slot-driven re-author must pass content-conservation before any builder retires (§5) —
// no silent drop of watermark/eyebrow/lede/verdict."
//
// Six of the nine strategies RE-AUTHOR the body from a parsed shape rather than partitioning
// the source, so anything their parser doesn't read simply never reaches a page. That is not
// a hypothetical: building this gate found five separate silent drops on real committed
// fixtures, each fixed in the same change —
//
//   · the deck's SECTION RAIL (`nav.tile-progress`) was not in `chromeOf`, so every cover
//     page lost it — including the PLAIN path's, whose own body pages keep it (a run whose
//     chrome flickered off and back on mid-run);
//   · `split-panel`'s panel-right `<h3>` SUBHEAD was read by nothing → dropped;
//   · a trailing `.below-note` was dropped outright by `cover-decision`, `cover-code` and
//     `redline-blocks` (none of them consumes one);
//   · trailing material inside `.panel-right` (where split-panel puts its body AND its
//     footer) was invisible to the top-level trailing scan → dropped by `feature-cover`;
//   · `kanban-lanes` swept anything after the board into its `suffix` and repeated it on
//     EVERY lane (the FM-2 duplication, in the one strategy that looked immune).
//
// The check is a WORD MULTISET containment: every whitespace-separated token in the source
// section must appear at least as many times across the emitted pages. Deliberately
// insensitive to WHERE a leaf ends up — a strategy that RELOCATES material (compare-prose
// turning a trailing note into its verdict page, cover-rows promoting one to the cover lede)
// passes, because relocation is not loss. Counts can only rise (a repeated heading, a runhead),
// so containment never has to model duplication.
//
// Three variants per strategy: the fixture as committed, plus a sentinel key-insight and a
// sentinel note+insight appended at the true end of the content cell — the exact position the
// engine renders trailing material into. A strategy that consumes one of the two kinds is
// unaffected (containment, again); one that drops it fails here.
describe('core: carousel — no strategy drops content (§8 rule 6)', () => {
  // A drop is a DEFECT, not a config: this list is the escape hatch for a substitution the
  // engine makes deliberately, and it is EMPTY. Every drop the gate found was fixable, so
  // none was sanctioned. Adding an entry requires the justification inline — and a stale
  // entry (one whose strategy no longer drops anything) fails too, so the list can't rot.
  // Shape: { strategy, variant, words: [...], why }.
  const SANCTIONED_SPLIT_DROPS = [];

  const words = (html) => String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-zA-Z]+;|&#\d+;/g, ' ')   // the cover's `&rarr;` etc. are added, never source
    .split(/\s+/)
    .filter(Boolean);
  const bag = (ws) => ws.reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map());
  /** Source tokens the emitted pages are short of, as `word×n`. Empty ⇒ conserved. */
  function droppedWords(src, emitted) {
    const have = bag(words(emitted));
    const out = [];
    for (const [w, n] of bag(words(src))) {
      const short = n - (have.get(w) || 0);
      if (short > 0) out.push(`${w}×${short}`);
    }
    return out;
  }

  const SENTINEL_INSIGHT = '<blockquote><p>Zq the run takeaway sentinel.</p></blockquote>';
  const SENTINEL_NOTE = '<div class="below-note"><p>Zn the footnote sentinel.</p></div>';

  // Append at the END OF THE CONTENT CELL — where below-note.js places trailing material on a
  // `.cell-stage` slide, and the end of the section otherwise. Hand-placing it anywhere else
  // (before the `<footer>`, say) tests a shape the engine never emits.
  function withTrailing(inner, extra) {
    const stage = extractStage(inner);
    if (stage) return inner.slice(0, stage.bodyEnd) + extra + inner.slice(stage.bodyEnd);
    const els = topLevelElements(inner);
    let at = els.length;
    while (at > 0 && ['header', 'footer', 'nav'].includes(els[at - 1].name)) at -= 1;
    return at < els.length ? inner.slice(0, els[at].start) + extra + inner.slice(els[at].start) : inner + extra;
  }

  const VARIANTS = [
    ['as-committed', (inner) => inner],
    ['+key-insight', (inner) => withTrailing(inner, SENTINEL_INSIGHT)],
    // A slide never carries two `.below-note` divs (below-note.js wraps ONE trailing region),
    // so a fixture that already has one gets its own replaced rather than a second added.
    ['+note+insight', (inner) => withTrailing(
      inner.replace(/<div class="below-note">[\s\S]*?<\/div>\s*<\/div>|<div class="below-note">[\s\S]*?<\/div>/, ''),
      SENTINEL_NOTE + SENTINEL_INSIGHT,
    )],
  ];

  for (const [name, tag, inner, rec] of STRATEGY_CASES) {
    for (const [variant, mutate] of VARIANTS) {
      test(`${name} (${variant}): every source text leaf survives somewhere`, () => {
        const src = mutate(inner);
        const parts = carouselize(tag, src, rec, 2, name);
        assert.ok(Array.isArray(parts) && parts.length >= 2, `${name}/${variant}: expected a split`);
        const dropped = droppedWords(src, parts.join(''));
        const sanction = SANCTIONED_SPLIT_DROPS.find((s) => s.strategy === name && s.variant === variant);
        if (!sanction) {
          assert.deepEqual(dropped, [], `${name}/${variant} DROPPED ${dropped.join(' ')} — rule 6 forbids a ` +
            `silent drop. Carry it (the cover for masthead material, the last body page for a ` +
            `footnote, its own page for a key insight), or add a justified SANCTIONED_SPLIT_DROPS entry.`);
          return;
        }
        assert.deepEqual(dropped.sort(), [...sanction.words].sort(),
          `${name}/${variant}: the sanctioned drop is STALE or has changed. Sanctioned "${sanction.why}"`);
      });
    }
  }

  test('SANCTIONED_SPLIT_DROPS carries a justification for every entry (no bare escape hatch)', () => {
    for (const s of SANCTIONED_SPLIT_DROPS) {
      assert.ok(s.why && s.why.length > 20, `sanctioned drop for ${s.strategy}/${s.variant} has no justification`);
      assert.ok(Array.isArray(s.words) && s.words.length, `sanctioned drop for ${s.strategy} names no words`);
      assert.ok(STRATEGY_CASES.some((c) => c[0] === s.strategy), `sanctioned drop names unknown strategy ${s.strategy}`);
    }
  });

  // The gate has to be able to FAIL. A strategy stripped of the generic trailing hoist must
  // report the sentinel as dropped — otherwise a green run proves nothing (the exact way the
  // rule-9 gate was hollow for 6 of 9 strategies before this PR).
  test('the gate detects a real drop (negative control)', () => {
    const src = withTrailing(dcSection.inner, SENTINEL_INSIGHT);
    const parts = carouselize(dcSection.openTag, src, { strategy: 'cover-decision', perPage: 1 }, 2, 'cover-decision');
    const withoutInsightPage = parts.filter((p) => roleOf(p) !== 'insight');
    assert.ok(withoutInsightPage.length < parts.length, 'sentinel did not produce an insight page');
    assert.ok(
      droppedWords(src, withoutInsightPage.join('')).some((w) => w.startsWith('Zq')),
      'the gate did NOT notice the sentinel missing — containment check is not actually checking',
    );
  });
});
