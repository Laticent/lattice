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
const { carouselize, readSubjects, readFeature, readRows, CAROUSEL_STRATEGIES, MEMBER_CLAIM_STRATEGIES } = require('../../../lib/core/carousel');
const { splitSections } = require('../../../lib/core/split-sections');
// The content-cell reader + depth-aware top-level walk the engine itself uses to place
// trailing material — the rule-6 gate below appends its sentinels at the SAME position
// rather than guessing one (HARD RULE #15).
const { extractStage } = require('../../../lib/core/below-note');
const { transformSection: journeyTransform } = require('../../../lib/components/chart/journey/journey.transform');
const { buildKanbanBoard } = require('../../../lib/components/chart/kanban/kanban.transform');
const { topLevelElements } = require('../../../lib/core/split-envelope');
// The engine's own beat ORDER — the sentinels below are assembled from it, not typed in an
// order someone remembered (HARD RULE #15).
const { BEATS, rendersBeat } = require('../../../lib/core/coda');

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

  test('emits cover → one subject page each → the shared CLOSING page', () => {
    // The fourth page used to be this strategy's OWN `compare-split-verdict` frame, built from
    // the slide's trailing `.below-note`. That consumed the note, so a slide carrying a note AND
    // a key insight ended `… body(the verdict) · insight` — the two beats on separate pages,
    // which is the retired 2026-07-26 placement. The run closes on the kernel's one closing page
    // now (2026-09-01), and the note rides its coda cell.
    assert.equal(parts.length, 4);
    assert.match(clsOf(parts[0]), /compare-split-cover/);
    assert.match(clsOf(parts[1]), /compare-split-points/);
    assert.match(clsOf(parts[2]), /compare-split-points/);
    assert.match(clsOf(parts[3]), /lat-split-closing/);
    assert.match(parts[3], /\sdata-split-role="closing"/);
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

  test('the synthesis line closes the run, in the closing page\'s coda cell', () => {
    // Its own `.below-note` wrapper, inside `.cell-coda` — which is where the hairline footnote
    // treatment attaches (lib/forms/cell/coda/coda.css). It used to be re-authored as a
    // `.split-pullq`, which meant compare-prose owned a second copy of "where trailing material
    // goes" (HARD RULE #1).
    assert.match(parts[3], /<div class="cell-coda"[^>]*>[\s\S]*below-note[\s\S]*The shift from equal to calibrated weights/);
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

  test('each ROW becomes a card: first cell is the title, columns are labeled fields', () => {
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

  // `cover-cards` re-authors its own body from a transposed table, so it never goes through
  // `splitEnvelope` — which is why it kept the retired 2026-07-26 placement (note on the last
  // card page, insight on a page of its own) for one change longer than every other path. It
  // now calls the SAME `closingPage` builder (HARD RULE #1).
  test('the note and the key insight close the run TOGETHER, on one page', () => {
    assert.equal(trailingParts.length, 4); // cover + 2 card pages + closing
    const closing = trailingParts.at(-1);
    assert.match(closing, /lat-split-closing/);
    assert.match(closing, /Build only wins if we actually staff it\./);
    assert.match(closing, /Source: procurement review\./);
    // Neither beat may appear on a card page.
    assert.ok(trailingParts.slice(1, -1).every((p) => !p.includes('Build only wins')));
    assert.ok(trailingParts.slice(1, -1).every((p) => !p.includes('procurement review')));
    // …and the note is at full size, not the compact step it took while sharing a page.
    assert.ok(!trailingParts.some((p) => /lat-split-note/.test(p)));
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

  test('a note with NO insight still earns the closing page — trailing material is trailing material', () => {
    const noteOnly = ctInner.replace('</table>', '</table><div class="below-note"><p>Source only.</p></div>');
    const parts2 = carouselize(ctTag, noteOnly, ctRecipe, 2, 'compare-table');
    assert.equal(parts2.length, 4); // cover + 2 card pages + closing
    assert.match(parts2.at(-1), /lat-split-closing/);
    assert.match(parts2.at(-1), /Source only\./);
    assert.ok(!parts2.slice(1, -1).some((p) => p.includes('Source only')));
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

  test('a THIRD blockquote is redline\'s own passage, not a beat — it rides page 2, printed ONCE', () => {
    // FM-2 by another route, and the one the rule-6 conservation gate structurally cannot see:
    // a third top-level blockquote was in neither drop-set, so it survived on BOTH pages, and
    // the hoist's containment check then found its text already emitted and stood down. The
    // result was two body pages each carrying the takeaway, and no closing page at all.
    const withInsight = rlInner.replace(
      '<footer>F</footer>',
      '<blockquote><p>One duty is cheaper to audit than two.</p></blockquote><footer>F</footer>',
    );
    const out = carouselize(rlTag, withInsight, rlRecipe);
    const copies = out.join('').split('One duty is cheaper to audit').length - 1;
    assert.equal(copies, 1, 'the extra blockquote appears exactly once across the run');
    // IT DOES NOT GET A CLOSING PAGE, and that changed on 2026-09-02 for a reason worth keeping.
    // `redline` declares `coda.claims: ["blockquote"]` — it renders blockquotes as its OWN
    // passages, which is why the coda harvest steps over them and why an author's `> …` on a
    // redline slide is a passage rather than a KEY INSIGHT panel. Promoting a third one to a
    // closing page invented a beat the unsplit slide never had, and the same shape-only
    // classification was simultaneously moving BOTH passages off their pages when the optional
    // why-list was absent. It rides the last body page instead: present, once, in its own
    // component's treatment.
    assert.equal(out.filter((p) => /\sdata-split-role="closing"/.test(p)).length, 0,
      'a claimed blockquote must not be promoted to a closing page');
    assert.match(out.at(-1), /One duty is cheaper to audit/);
    // …and the two passages are still where they belong.
    assert.match(out[0], /blockquote class="rl-old"/);
    assert.match(out[1], /blockquote class="rl-new"/);
  });

  test('a NON-trailing third blockquote rides the last body page — never dropped', () => {
    // The first fix for the duplication above cut every extra blockquote from both pages and
    // relied on the conservation hoist to rescue it. The hoist only sees a CONTIGUOUS TRAILING
    // run, so a third blockquote followed by the why-list was rescued by nothing and landed on
    // NO page — trading a visible duplication for a silent drop, which is strictly worse. Only
    // what the hoist will actually rescue may be cut from both pages.
    const stranded = rlInner.replace(
      '<ul><li><strong>Why this matters.</strong>',
      '<blockquote><p>One duty is cheaper to audit than two.</p></blockquote><ul><li><strong>Why this matters.</strong>',
    );
    const out = carouselize(rlTag, stranded, rlRecipe);
    const joined = out.join('');
    assert.equal(joined.split('One duty is cheaper to audit').length - 1, 1, 'exactly one copy — not two, not zero');
    assert.match(out.at(-1), /One duty is cheaper to audit/, 'it rides the LAST body page');
    // Neither passage nor the why-list is disturbed by carrying it.
    assert.equal(joined.split('two or more methods').length - 1, 1);
    assert.equal(joined.split('at least one method').length - 1, 1);
    assert.equal(joined.split('One duty now').length - 1, 1);
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
const rmTag = '<section data-lattice-slide="1" id="s1" class="roadmap horizons form">';
const rmCard = (phase) => `<div class="horizon-card"><div class="horizon-head">` +
  `<span class="horizon-title">${phase}</span></div><ul class="horizon-rows"><li>row ${phase}</li></ul></div>`;
const rmInner = '<div class="chart-header"><h2>Roadmap</h2></div><div class="chart-body">' +
  `<div class="horizons">${rmCard('H1')}${rmCard('H2')}${rmCard('H3')}</div></div>`;
const kbTag = '<section data-lattice-slide="1" id="s1" class="kanban form">';
// DERIVED FROM THE ENGINE, like the journey fixtures below. The hand-written version of this
// gave each lane an `<h3>` title, and `kanban.transform.js` has never emitted one — it builds
// `<div class="kanban-column-header">`. A fixture that invents its component's DOM cannot catch
// a defect in how that DOM is read, and this one did not: `kanban-lanes` shipped runs with no
// forward pointer at all, because the real lane holds no list for `membersIn` to find.
const kbInner = '<div class="chart-header"><h2>Board</h2></div><div class="chart-body">' +
  buildKanbanBoard(
    '<li>To do<ul><li>Spec the API</li></ul></li>' +
    '<li>Doing<ul><li>Wire the client</li></ul></li>',
  ) + '</div>';

// ── journey: the fixture is DERIVED FROM THE ENGINE, not transcribed from a render ──
// Every other fixture above is hand-written, and that is the standing hazard this file already
// names: a gate whose population comes from its author's memory certifies the memory. journey's
// board is built by `journey.transform.js`, which is pure and takes `(html, ctx)` — so the two
// forms are asked for here rather than reproduced. If the transform's DOM ever moves, these
// fixtures move with it and the strategy is tested against what actually ships.
//
// The two forms are the whole point of the enrollment: PORTRAIT emits `ol.journey-vstack` and
// slices one stage per page; LANDSCAPE emits a shared-axis grid (absolute `--col` per task,
// `grid-column: span var(--span)` bands) and must NOT slice. Both are pinned below.
const jnAuthored = '<h2>Path</h2><ul>' +
  '<li>Evaluate<ul><li>Read case study <code>@buyer</code> <code>:5</code></li>' +
  '<li>Book demo <code>@buyer</code> <code>:4</code></li></ul></li>' +
  '<li>Trial<ul><li>Trial signup <code>@buyer</code> <code>:3</code></li></ul></li>' +
  '<li>Activate<ul><li>First report <code>@user</code> <code>:4</code></li></ul></li>' +
  '</ul>';
const jnBoard = (orientation) =>
  journeyTransform(jnAuthored, { cls: 'journey', orientation });
const jnTag = '<section data-lattice-slide="1" id="s1" class="journey form chart-frame">';
// The chart family wraps the board in `.cell-stage > .chart-body`; the splitter walks past both
// into the prefix, so the wrap has to be here or the fixture is not the shape that ships.
const jnSection = (orientation) =>
  `<div class="cell-masthead"><div class="masthead-lede"><h2>Path</h2></div></div>` +
  `<div class="cell-stage"><div class="chart-body">` +
  `${jnBoard(orientation).replace('<h2>Path</h2>', '')}` +
  `</div></div><div class="cell-footer"><footer>journey</footer></div>`;
const jnInner = jnSection('portrait');
const jnLandscapeInner = jnSection('landscape');

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
  ['roadmap-horizons', rmTag,           rmInner,         { strategy: 'roadmap-horizons' }],
  ['journey-stages', jnTag,             jnInner,         { strategy: 'journey-stages' }],
];

// THE TABLE'S POPULATION COMES FROM THE ENGINE, not from whatever fixtures anyone happened to
// write. It did not, and the cost was exactly what that phrasing predicts: `roadmap-horizons`
// was never in this table, so for as long as it has existed it sat outside BOTH gates the table
// drives — the rule-9 envelope invariant and the rule-6 conservation check. It was found by
// probing the strategies by hand, not by any gate, and it was duplicating trailing material onto
// every horizon card. A hand-written population is a gate that certifies its author's memory.
test('core: carousel — STRATEGY_CASES covers every registered strategy', () => {
  const covered = new Set(STRATEGY_CASES.map(([name]) => name));
  const missing = Object.keys(CAROUSEL_STRATEGIES).filter((k) => !covered.has(k));
  assert.deepEqual(missing, [], `strategies with no case in STRATEGY_CASES: ${missing.join(', ')}. ` +
    'Every gate below drives off this table, so an uncovered strategy is silently exempt from all of them.');
  const unknown = [...covered].filter((k) => !Object.hasOwn(CAROUSEL_STRATEGIES, k));
  assert.deepEqual(unknown, [], `STRATEGY_CASES names strategies the engine does not register: ${unknown.join(', ')}`);
});

const roleOf = (sec) => (sec.match(/\sdata-split-role="([^"]*)"/) || [])[1] || null;

describe('core: carousel — every strategy emits a role-stamped envelope (§8 rule 9)', () => {
  for (const [name, tag, inner, rec] of STRATEGY_CASES) {
    test(`${name}: every emitted page carries a valid role, cover first, closing last`, () => {
      const parts = carouselize(tag, inner, rec, 2, name);
      assert.ok(Array.isArray(parts) && parts.length >= 2, `${name}: expected a multi-page split, got ${parts?.length}`);
      const roles = parts.map(roleOf);
      assert.ok(
        roles.every((r) => ['cover', 'body', 'closing'].includes(r)),
        `${name}: un-stamped or unknown role(s) — ${JSON.stringify(roles)}. Every split path must stamp ` +
        `data-split-role or it falls outside the §8 rule 9 invariant, which is how 6 of 9 strategies ` +
        `escaped the gate. \`insight\` is NOT a role a carousel run may END on any more: the note and ` +
        `the key insight close it TOGETHER on one page (2026-09-01).`,
      );
      assert.ok(roles.filter((r) => r === 'cover').length <= 1, `${name}: ${roles.filter((r) => r === 'cover').length} covers`);
      assert.ok(roles.filter((r) => r === 'closing').length <= 1, `${name}: >1 closing page`);
      if (roles.includes('cover')) assert.equal(roles[0], 'cover', `${name}: cover is not first — ${roles}`);
      if (roles.includes('closing')) assert.equal(roles.at(-1), 'closing', `${name}: closing is not last — ${roles}`);
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
//   · the deck's SECTION RAIL (`div.tile-progress`) was not in `chromeOf`, so every cover
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
  // IN THE ENGINE'S OWN BEAT ORDER, derived from `coda.js` rather than typed here.
  //
  // This gate appended NOTE + INSIGHT, which is an order the engine cannot produce. `harvestBody`
  // peels the tail as "an optional trailing `<p>` (the note), then an optional `<blockquote>`
  // before it (the insight)" — BEATS is `['key-insight', 'below-note']` and its comment says the
  // insight "can never come after the note". A `.below-note` wrapper sitting before a bare
  // blockquote is therefore a shape no author can author and no harvest can emit, which is the
  // thing this gate's own docblock warns against two paragraphs above ("Hand-placing it anywhere
  // else … tests a shape the engine never emits").
  //
  // It went unnoticed while nothing depended on order. It stopped being harmless the moment the
  // trailing scan began asking a layout's `coda.claims`: the scan walks BACKWARD over a
  // CONTIGUOUS run, so a claimed element at the very end terminates it — and with the beats
  // inverted, `redline`'s claimed blockquote sat last and hid the note behind it, which read as a
  // duplication defect in the engine rather than a defect in the fixture.
  const SENTINEL_FOR = { 'key-insight': SENTINEL_INSIGHT, 'below-note': SENTINEL_NOTE };
  const BOTH_BEATS = BEATS.map((b) => SENTINEL_FOR[b]).join('');

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
      BOTH_BEATS,
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
    const withoutClosingPage = parts.filter((p) => roleOf(p) !== 'closing');
    assert.ok(withoutClosingPage.length < parts.length, 'sentinel did not produce a closing page');
    assert.ok(
      droppedWords(src, withoutClosingPage.join('')).some((w) => w.startsWith('Zq')),
      'the gate did NOT notice the sentinel missing — containment check is not actually checking',
    );
  });
});

// ── The 2026-09-01 CLOSING PAGE, across every strategy ─────────────────────────
// "Every run ends on a CLOSING page carrying the below-note and the key insight TOGETHER."
// That was true of the plain envelope and `cover-cards` and of nothing else: five strategies
// still shipped the retired 2026-07-26 placement (the note spliced into the last BODY page, the
// insight on a page of its own), and `feature-cover` lost both outright.
//
// TWO assertions, and the second is the one the rule-6 conservation gate structurally CANNOT
// make. That gate is a word-multiset CONTAINMENT check, so counts that RISE always pass — it
// reports a shortfall and never a duplicate. `kanban-lanes` and `roadmap-horizons` both re-emit
// a source slice that carries everything after the last lane / card, and they repeat that slice
// per page: measured before this change, a two-lane kanban printed one key insight THREE times
// (once per lane, once on the closing page) and passed rule 6 green.
describe('core: carousel — the run closes on ONE page carrying both beats (2026-09-01)', () => {
  const INSIGHT = '<blockquote><p>Zq the run takeaway sentinel.</p></blockquote>';
  const NOTE = '<div class="below-note"><p>Zn the footnote sentinel.</p></div>';
  // The engine's beat order, from `coda.js` — see the rule-6 gate above for why typing it here
  // instead produced a shape no harvest can emit.
  const SENTINEL_FOR = { 'key-insight': INSIGHT, 'below-note': NOTE };
  const BOTH = BEATS.map((b) => SENTINEL_FOR[b]).join('');
  // The same placement `withTrailing` uses in the conservation gate — the end of the content
  // cell, which is where the engine renders trailing material. Duplicated here rather than
  // shared because the two describes are independent gates; if they ever disagree about where
  // trailing material lives, that disagreement should be visible rather than averaged away.
  const atCellEnd = (inner, extra) => {
    const stage = extractStage(inner);
    if (stage) return inner.slice(0, stage.bodyEnd) + extra + inner.slice(stage.bodyEnd);
    const els = topLevelElements(inner);
    let at = els.length;
    while (at > 0 && ['header', 'footer', 'nav'].includes(els[at - 1].name)) at -= 1;
    return at < els.length ? inner.slice(0, els[at].start) + extra + inner.slice(els[at].start) : inner + extra;
  };
  // A fixture that already carries a below-note gets its own replaced, never a second added —
  // below-note.js wraps ONE trailing region, so two would be a shape the engine never emits.
  const withBothBeats = (inner) => atCellEnd(
    inner.replace(/<div class="below-note">[\s\S]*?<\/div>\s*<\/div>|<div class="below-note">[\s\S]*?<\/div>/, ''),
    BOTH,
  );

  // WHICH beats a layout hoists is the layout's own declaration, and the expectation is read from
  // it rather than assumed uniform. A claim is honored ONLY where the claimed element rides a
  // MEMBER (`MEMBER_CLAIM_STRATEGIES`) — `redline` claims `blockquote` and its two passages ARE
  // the members, so hoisting them is what emptied two body pages onto a closing page. Everywhere
  // else the beat is hoisted whatever the manifest says: a re-authoring strategy rebuilds its
  // body, so an unparsed element reaches no page; and a native slice repeats everything outside
  // the member set on every page, so a claimed beat there is DUPLICATED (journey, measured: a
  // below-note on both pages of a two-stage run) or, when the component docks its coda outside
  // the sliced subtree, lost entirely (roadmap, measured: zero copies).
  //
  // Only the BARE shapes are gated. The NOTE sentinel is a `.below-note` WRAPPER, which is the
  // coda harvest's own output — the harvest runs only where the beat is rendered, so its presence
  // is already the answer and the kernel hoists it unconditionally. The INSIGHT sentinel is a bare
  // `<blockquote>`, which is the shape a claim can speak for.
  const hoists = (name, tag, beat) => (beat === 'below-note'
    || !MEMBER_CLAIM_STRATEGIES.has(name)
    || rendersBeat(clsOf(tag), beat));
  // …and the expectation must not be able to go vacuous: most cases must still carry both.
  test('the closing-page expectation is not vacuous — most strategies hoist both beats', () => {
    const both = STRATEGY_CASES.filter(([n, t]) => hoists(n, t, 'key-insight') && hoists(n, t, 'below-note'));
    assert.ok(both.length >= STRATEGY_CASES.length - 1,
      `only ${both.length}/${STRATEGY_CASES.length} cases expect both beats — the arm below is weakening`);
  });

  for (const [name, tag, inner, rec] of STRATEGY_CASES) {
    test(`${name}: the beats it hoists land on ONE closing page, and it is last`, () => {
      const parts = carouselize(tag, withBothBeats(inner), rec, 2, name);
      assert.ok(Array.isArray(parts) && parts.length >= 2, `${name}: expected a split`);
      const wantInsight = hoists(name, tag, 'key-insight');
      const wantNote = hoists(name, tag, 'below-note');
      const closing = parts.filter((p) => roleOf(p) === 'closing');
      assert.equal(closing.length, 1, `${name}: expected exactly one closing page, got ${closing.length} ` +
        `(roles: ${parts.map(roleOf).join(',')})`);
      assert.equal(roleOf(parts.at(-1)), 'closing', `${name}: the closing page is not last`);
      if (wantInsight) assert.match(closing[0], /Zq the run takeaway sentinel/, `${name}: the key insight is not on the closing page`);
      if (wantNote) assert.match(closing[0], /Zn the footnote sentinel/, `${name}: the below-note is not on the closing page`);
      // TOGETHER means the same page, and there must be no `insight`-role page left over —
      // that role is what the retired placement used for the takeaway's separate beat.
      assert.equal(parts.filter((p) => roleOf(p) === 'insight').length, 0,
        `${name}: still emits a separate insight page — that is the retired 2026-07-26 placement`);
      // A COMPOSED closing page names the slide it closes. The subtractive `closingPage` keeps
      // the section's own masthead and does so for free; a composed one has no masthead to keep,
      // and without this it shipped a lone note in a page-tall box with nothing saying which
      // slide it belonged to. Only asserted where the page IS composed — `cover-paginate` and
      // `cover-cards` build the subtractive kind and carry the real masthead instead.
      if (/\bsplit-closing-/.test(closing[0])) {
        assert.match(closing[0], /<div class="split-runhead">\S/,
          `${name}: the composed closing page carries no runhead — it does not name its slide`);
      }
    });

    test(`${name}: neither beat is printed twice (the duplication rule 6 cannot see)`, () => {
      const parts = carouselize(tag, withBothBeats(inner), rec, 2, name);
      const all = parts.join('');
      for (const sentinel of ['Zq the run takeaway sentinel', 'Zn the footnote sentinel']) {
        const copies = all.split(sentinel).length - 1;
        assert.equal(copies, 1, `${name}: "${sentinel}" appears ${copies} times across the run. ` +
          'A strategy that re-emits a source SLICE must strip the trailing beats from it — the slice ' +
          'is repeated per page, and the conservation gate passes a duplicate because containment ' +
          'only ever reports a shortfall.');
      }
    });
  }

  // The pair above has to be able to FAIL, or a green run proves nothing. Feed a strategy a
  // slide with NO trailing material and there must be no closing page at all — which also pins
  // that a run with nothing to say does not end on an empty page.
  test('no trailing material → no closing page (negative control)', () => {
    for (const [name, tag, inner, rec] of STRATEGY_CASES) {
      const bare = inner.replace(/<div class="below-note">[\s\S]*?<\/div>\s*<\/div>|<div class="below-note">[\s\S]*?<\/div>/, '');
      const parts = carouselize(tag, bare, rec, 2, name);
      if (!parts) continue;
      const closing = parts.filter((p) => roleOf(p) === 'closing');
      assert.equal(closing.length, 0, `${name}: emitted a closing page for a slide with no trailing material`);
    }
  });
});

// ── The fit BERTHS are chrome, and only a REAL section shape can prove it ──────
// The three corner tabs `fit-berth.js` appends are the last top-level children of every
// rendered section — and `trailingSlotMaterialOf` finds a layout's own content slot by taking
// the LAST top-level element. So on a real render it took an empty `.fixme-tab` instead of
// `.panel-right`, found no trailing material there, and `feature-cover` lost the author's key
// insight and below-note OUTRIGHT: no page, no warning, and no shortfall the containment gate
// could report, because the material was never located to begin with.
//
// NONE OF THE COMMITTED FIXTURES CARRY BERTHS — they are hand-sliced or captured before that
// pass runs — so every gate in this file was green while the defect shipped. Removing the fix
// and re-running the whole file still passes (mutation-checked). That is the failure mode this
// arm exists for, and it is why the berth markup comes from `BERTH_HTML` rather than being
// typed here: the input is the engine's own, so it cannot drift away from what ships.
describe('core: carousel — a member\'s sub-bullets keep their own lines', () => {
  // `subjectBody` joined them with a bare space, fusing fields the author wrote as separate ones.
  // `list-tabular` authors a row as `- Term` / `  - what it measures` / `  - how it scores`, and
  // the join rendered "Penalizes signals that swing Also penalizes the early-warning ones" — one
  // run-on clause a reader has to re-parse, on a slide whose own title promises "what they
  // measure, and how they score".
  //
  // No gate could have caught it. The conservation check counts WORDS, and every word was
  // present; only the sentence boundaries were gone. It was found by rasterizing the run and
  // reading it (QUALITY BAR), which is the only instrument that sees this class of defect.
  const row = (title, ...bullets) =>
    `<li>${title}<ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul></li>`;
  const inner = (...rows) => `<h2>Signals</h2><ol>${rows.join('')}</ol>`;

  test('two sub-bullets emit two lines, not one run-on string', () => {
    const [r] = readRows(inner(row('Volatility', 'Penalizes signals that swing', 'Also penalizes the early-warning ones')));
    assert.ok(r, 'no row parsed');
    assert.doesNotMatch(r.body, /swing Also/,
      'the two authored fields were fused into one clause — this is the defect, not a formatting nit');
    assert.match(r.body, /<span class="split-pt-line">Penalizes signals that swing<\/span>/);
    assert.match(r.body, /<span class="split-pt-line">Also penalizes the early-warning ones<\/span>/);
  });

  test('a SINGLE sub-bullet emits no wrapper — the common case is byte-identical', () => {
    const [r] = readRows(inner(row('Recency', 'Time-decay on a configurable half-life')));
    assert.equal(r.body, 'Time-decay on a configurable half-life');
  });

  test('the separation survives into the emitted page', () => {
    const src = inner(
      row('Volatility', 'Penalizes signals that swing', 'Also penalizes the early-warning ones'),
      row('Recency', 'Time-decay on a configurable half-life', 'Two-week default surprises everyone'),
    );
    const parts = carouselize('<section data-lattice-slide="1" id="s1" class="list-tabular form">',
      src, { strategy: 'cover-rows', perPage: 1 }, 2, 'list-tabular');
    assert.ok(parts, 'expected a split');
    assert.doesNotMatch(parts.join(''), /swing Also/, 'the fused clause reached an emitted page');
  });
});

describe('core: carousel — a rendered section ends in BERTHS, and they are not the content slot', () => {
  const { BERTH_HTML } = require('../../../lib/core/fit-berth');
  const { trailingSlotMaterialOf } = require('../../../lib/core/split-envelope');
  const INSIGHT = '<blockquote><p>Zq the run takeaway sentinel.</p></blockquote>';
  const NOTE = '<p>Zn the footnote sentinel.</p>';

  // The real portrait shape: split-panel puts its body AND its running footer inside
  // `.panel-right`, so the author's trailing beats render THERE, and the berths follow the
  // panels as the section's own last children.
  const withBeatsAndBerths = () => {
    const inner = spSection.inner;
    const footerAt = inner.lastIndexOf('<footer');
    assert.ok(footerAt > 0, 'fixture no longer carries a footer inside its panel');
    return inner.slice(0, footerAt) + INSIGHT + NOTE + inner.slice(footerAt) + BERTH_HTML;
  };

  test('the content slot is found behind the berths, and both beats with it', () => {
    const found = trailingSlotMaterialOf(withBeatsAndBerths());
    const outers = [...found.insight, ...found.note].map((sp) => sp.outer).join('');
    assert.match(outers, /Zq the run takeaway sentinel/, 'the key insight was not located');
    assert.match(outers, /Zn the footnote sentinel/, 'the below-note was not located');
  });

  test('feature-cover ends on a closing page carrying both, each exactly once', () => {
    const src = withBeatsAndBerths();
    const parts = carouselize(spSection.openTag, src, { strategy: 'feature-cover', perPage: 2 }, 2, 'split-panel');
    assert.ok(Array.isArray(parts) && parts.length >= 2, 'expected a split');
    const closing = parts.filter((p) => roleOf(p) === 'closing');
    assert.equal(closing.length, 1, `expected one closing page, got ${closing.length}`);
    for (const sentinel of ['Zq the run takeaway sentinel', 'Zn the footnote sentinel']) {
      assert.match(closing[0], new RegExp(sentinel), `the closing page is missing "${sentinel}"`);
      assert.equal(parts.join('').split(sentinel).length - 1, 1, `"${sentinel}" is not printed exactly once`);
    }
    // The bare `<p>` gets the coda kernel's own `.below-note` wrapper, so the hairline
    // treatment attaches — without it this was the one closing page in five with no rule under
    // the insight panel (seen by rasterizing the run, not by any assertion).
    assert.match(closing[0], /<div class="below-note"><p>Zn the footnote sentinel/);
  });

  test('a bare trailing paragraph is a note only AFTER a structural block', () => {
    // The widening that admits the `<p>` above is the coda kernel's own promotion rule
    // (`STRUCTURAL`), not a new heuristic — so prose still reads as prose.
    const slot = (body) => `<h2>T</h2><div class="panel-left"><p>l</p></div><div class="panel-right">${body}</div>`;
    const afterList = trailingSlotMaterialOf(slot('<ul><li>a</li></ul><p>Zn concluding sentence.</p>'));
    assert.match(afterList.note.map((n) => n.outer).join(''), /Zn concluding sentence/,
      'a sentence after a list is a footnote and must be hoisted');
    const afterProse = trailingSlotMaterialOf(slot('<p>first paragraph</p><p>Zn second paragraph.</p>'));
    assert.equal(afterProse.note.length, 0,
      'a paragraph after another paragraph is PROSE — hoisting it would move a component\'s own copy off its page');
  });
});

describe('core: carousel — roadmap-horizons (roadmap portrait, phase cards across 2–4 pages)', () => {
  // At portrait chart-family auto-selects `horizons`, which transposes the roadmap grid
  // into one .horizon-card per phase inside a .horizons grid. Each card is already a
  // self-contained unit (phase head + that phase's workstream rows), so the seam is real
  // there in a way it is NOT in the table form — which is why this splitter refuses the
  // table outright. Budget: 2–4 pages, 4 max (#1209).
  const rmTag = '<section id="r1" class="roadmap horizons" data-lattice-slide="3">';
  const card = (phase, ...rows) =>
    `<div class="horizon-card"><div class="horizon-head"><span class="horizon-eyebrow">P</span>` +
    `<span class="horizon-title">${phase}</span></div><ul class="horizon-rows">` +
    `${rows.map((r) => `<li><span class="row-label">WS</span><span class="row-text">${r}</span></li>`).join('')}` +
    '</ul></div>';
  const innerFor = (...phases) =>
    '<div class="chart-header"><p class="chart-eyebrow"><code>H2 2026</code></p><h2>The rollout plan.</h2></div>' +
    '<div class="chart-body"><div class="roadmap-figure"><div class="horizons">' +
    phases.map((p) => card(p, `${p} work`)).join('') +
    '</div><ul class="roadmap-legend"><li>shipped</li></ul></div></div>' +
    '<footer>F</footer>';
  const split = (...phases) => carouselize(rmTag, innerFor(...phases), { strategy: 'roadmap-horizons' });

  test('one page per phase while inside the budget', () => {
    const parts = split('Foundation', 'Hardening', 'Scale');
    assert.equal(parts.length, 3);
    assert.ok(parts.every((p) => (p.match(/horizon-card"/g) || []).length === 1));
    assert.match(parts[0], /horizon-title">Foundation</);
    assert.match(parts[1], /horizon-title">Hardening</);
    assert.match(parts[2], /horizon-title">Scale</);
  });

  test('one page per phase at EVERY count — the 2–4 page budget is retired', () => {
    // The budget (#1209: "2–4 parts, 4 being the max") grouped a 6-phase roadmap into
    // 2+2+1+1. That is packing, and packing is what the single-element rule forbids
    // (2026-09-01). The budget's own sentence had already conceded the point — "One card per
    // page reads best" — and then paid it away to stay under the cap.
    for (let n = 2; n <= 16; n += 1) {
      const phases = Array.from({ length: n }, (_, i) => `P${i + 1}`);
      const parts = split(...phases);
      assert.equal(parts.length, n, `${n} phases must produce ${n} pages`);
      assert.ok(parts.every((p) => (p.match(/horizon-card"/g) || []).length === 1),
        `${n} phases: a page carried more than one card`);
      // Conservation: every phase appears exactly once across the run.
      const seen = parts.flatMap((p) => [...p.matchAll(/horizon-title">([^<]*)</g)].map((m) => m[1]));
      assert.deepStrictEqual(seen.sort(), phases.slice().sort(),
        `${n} phases: a phase was dropped or duplicated`);
    }
  });

  test('pages are balanced — no page carries 2+ more cards than another', () => {
    for (let n = 2; n <= 16; n += 1) {
      const parts = split(...Array.from({ length: n }, (_, i) => `P${i + 1}`));
      const counts = parts.map((p) => (p.match(/horizon-card"/g) || []).length);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1,
        `${n} phases split unevenly: ${counts.join('+')}`);
    }
  });

  test('the chart-header repeats; the first keeps the id, later pages are (cont.) + id-less', () => {
    const parts = split('A', 'B', 'C');
    assert.ok(parts.every((p) => /The rollout plan\./.test(p)));
    assert.equal(parts.filter((p) => /\sid="r1"/.test(p)).length, 1);
    assert.doesNotMatch(parts[0], /lat-cont/);
    assert.ok(parts.slice(1).every((p) => /lat-cont/.test(p) && /lat-split-native/.test(p)));
  });

  test('the TABLE form is refused — §0c keeps it atomic', () => {
    const table =
      '<div class="chart-header"><h2>X</h2></div><div class="chart-body"><div class="roadmap-figure">' +
      '<table><thead><tr><th>Workstream</th><th>P1</th></tr></thead>' +
      '<tbody><tr><td>A</td><td>x</td></tr></tbody></table></div></div>';
    assert.equal(carouselize(rmTag, table, { strategy: 'roadmap-horizons' }), null);
  });

  test('a single-phase board → null (nothing to split between)', () => {
    assert.equal(split('Only'), null);
  });
});

// ── journey-stages: the enrollment is SCOPED, and the scope is the whole claim ─────
//
// journey is enrolled at PORTRAIT ONLY. At landscape it is one figure over a shared axis —
// `.journey-board` sets `--task-count`, every task carries an absolute `--col`, and the stage
// ribbon spans its tasks with `grid-column: span var(--span)` — so a slice would leave a page
// holding tasks at columns 4-5 of a grid whose columns 1-3 are gone. That is the same test
// `matrix-grid` and `gantt` fail, and journey fails it in exactly one of its two rendered forms.
//
// Nothing else in the suite can see that. `STRATEGY_CASES` proves the PORTRAIT form splits
// correctly and says nothing about the landscape one, and a strategy that quietly began
// splitting landscape too would pass every gate above while shredding the grid — which is
// precisely how `matrix-2x2` shipped a portrait render showing two of four quadrants (#1193).
// So the negative is pinned here, from the same engine-derived fixture as the positive.
describe('core: carousel — journey-stages splits the vertical stack and never the grid', () => {
  test('portrait: one page per stage, and the stage bands survive the cut', () => {
    const parts = carouselize(jnTag, jnInner, { strategy: 'journey-stages' }, 2, 'journey');
    assert.ok(Array.isArray(parts), 'portrait journey did not split');
    assert.equal(parts.length, 3, `expected one page per authored stage, got ${parts.length}`);
    for (const [i, p] of parts.entries()) {
      assert.equal((p.match(/class="journey-vstage"/g) || []).length, 1,
        `page ${i + 1} carries ${(p.match(/class="journey-vstage"/g) || []).length} stages, not 1`);
    }
    // The categorical accent is `[data-section="N"]`, written on the member by the transform —
    // which is the ONLY reason the colour sequence survives being sliced. `timeline-list` picks
    // its dot spectrum with `:nth-child(6n+k)` on an element carrying no index, so one member
    // per page makes every page `:nth-child(1)` and the whole run collapses to cat-1. If this
    // assertion ever fails, journey has acquired that defect and the enrollment must come out.
    const sections = parts.map((p) => (p.match(/class="journey-vstage" data-section="(\d+)"/) || [])[1]);
    assert.deepEqual(sections, ['0', '1', '2'],
      `stage accents must stay distinct across the run — got ${JSON.stringify(sections)}`);
  });

  test('portrait: every authored task reaches exactly one page', () => {
    const parts = carouselize(jnTag, jnInner, { strategy: 'journey-stages' }, 2, 'journey');
    const before = (jnInner.match(/class="journey-vtask"/g) || []).length;
    const after = parts.reduce((n, p) => n + (p.match(/class="journey-vtask"/g) || []).length, 0);
    assert.equal(after, before, `${before} tasks in, ${after} out — the run must neither drop nor duplicate`);
    assert.ok(before >= 4, 'fixture too small to be evidence of anything');
  });

  test('portrait: both legends ride every page — a mood face without its key is unreadable', () => {
    const parts = carouselize(jnTag, jnInner, { strategy: 'journey-stages' }, 2, 'journey');
    for (const [i, p] of parts.entries()) {
      assert.ok(/journey-legend/.test(p), `page ${i + 1} lost the actor legend`);
      assert.ok(/journey-mood-legend/.test(p), `page ${i + 1} lost the mood key`);
    }
  });

  test('landscape: the shared-axis grid is left WHOLE', () => {
    assert.ok(/--task-count/.test(jnLandscapeInner) && !/journey-vstack/.test(jnLandscapeInner),
      'fixture is not the landscape grid form — the negative below would prove nothing');
    const parts = carouselize(jnTag, jnLandscapeInner, { strategy: 'journey-stages' }, 2, 'journey');
    assert.equal(parts, null,
      'the landscape journey was split. Every task carries an absolute --col into a ' +
      'repeat(var(--task-count), 1fr) grid, so a sliced page draws its tasks into columns that ' +
      'are no longer there. It must ring instead.');
  });
});

// ── a native-slice page NAMES the member it carries ───────────────────────────
//
// The forward pointer is built by `applyRelationshipSignals`, which resolves a page's members
// with `membersIn` — the first `<ul>`/`<ol>` on the page and its `<li>` children. That proxy
// holds where the page's body IS the collection and breaks on a native slice, where the page
// holds ONE member that may contain lists of its own. Measured on the real decks before this:
//
//   · `roadmap` — the first list on a phase page is `ul.horizon-rows` INSIDE the card, so every
//     pointer named a workstream row rather than the phase: "Signal Intake Scoring v2",
//     two fields of one row run together, on a page titled "Q2".
//   · `kanban`  — lanes are built from `<div>`s, so `membersIn` found nothing and the runs
//     carried NO pointer at all.
//   · `journey` — correct, and by luck: its vertical stack happens to be the page's first list.
//
// So the splitter says what it cut. These assert the stamp itself, because the stamp is the only
// thing standing between the pointer and the heuristic that was wrong for two of three.
describe('core: carousel — a native slice stamps the member it carries', () => {
  const NATIVE = [
    ['kanban-lanes', kbTag, kbInner, ['To do', 'Doing']],
    ['roadmap-horizons', rmTag, rmInner, ['H1', 'H2', 'H3']],
    ['journey-stages', jnTag, jnInner, ['Evaluate', 'Trial', 'Activate']],
  ];

  for (const [name, tag, inner, expected] of NATIVE) {
    test(`${name}: every page names its own member, in order`, () => {
      const parts = carouselize(tag, inner, { strategy: name }, 2, name);
      assert.ok(Array.isArray(parts), `${name}: expected a split`);
      const labels = parts
        .filter((p) => /\sdata-split-role="body"/.test(p))
        .map((p) => (p.match(/\sdata-split-label="([^"]*)"/) || [])[1]);
      assert.deepEqual(labels, expected,
        `${name}: the pages must name their own members. Without the stamp the pointer falls back `
        + 'to membersIn, which names the first list on the page — a workstream row for roadmap, '
        + 'and nothing at all for kanban.');
    });
  }

  // The stamp carries AUTHOR TEXT into an HTML attribute, so it has to be escaped. A lane titled
  // with a quote would otherwise close the attribute and the rest of the title would parse as
  // markup on the page.
  test('the label is escaped — a quote in a title cannot break out of the attribute', () => {
    const inner = '<div class="chart-header"><h2>Board</h2></div><div class="chart-body">'
      + buildKanbanBoard(
        '<li>The "big" lane<ul><li>one</li></ul></li><li>Second<ul><li>two</li></ul></li>')
      + '</div>';
    const parts = carouselize(kbTag, inner, { strategy: 'kanban-lanes' }, 2, 'kanban');
    const raw = (parts[0].match(/\sdata-split-label="([^"]*)"/) || [])[1];
    assert.equal(raw, 'The &quot;big&quot; lane', 'an unescaped quote would end the attribute early');
    assert.ok(!/data-split-label="[^"]*"[^>]*big/.test(parts[0]), 'title text leaked outside the attribute');
  });

  // FOUND BY THE INDEPENDENT CHECKER. The extractor matched `([\\s\\S]*?)</[a-z0-9]+>` — lazy, and
  // any closing tag name — so it stopped at the first NESTED close instead of the title's own.
  // `kanban` and `roadmap` both pass an author's inline markup straight into the title, so a lane
  // written `- **Backlog** and triage` labelled itself "Backlog" and the pointer named half a
  // title. `journey` is immune because its transform strips tags first, which is exactly why the
  // committed decks never showed it and the first round of these tests, written with plain-text
  // titles, could not have.
  test('a title containing markup is taken whole, not cut at the first nested tag', () => {
    const inner = '<div class="chart-header"><h2>Board</h2></div><div class="chart-body">'
      + buildKanbanBoard(
        '<li><strong>Backlog</strong> and triage<ul><li>a</li></ul></li>'
        + '<li><strong>In flight</strong> this sprint<ul><li>b</li></ul></li>')
      + '</div>';
    const parts = carouselize(kbTag, inner, { strategy: 'kanban-lanes' }, 2, 'kanban');
    const labels = parts.filter((p) => /\sdata-split-role="body"/.test(p))
      .map((p) => (p.match(/\sdata-split-label="([^"]*)"/) || [])[1]);
    assert.deepEqual(labels, ['Backlog and triage', 'In flight this sprint'],
      'the title was cut at a nested closing tag — the pointer would name half a lane');
  });

  // An entity in a title survives ONE decode on read. The slice is rendered HTML, where an
  // author's `&` is already `&amp;`; escaping that again stores `&amp;amp;` and the reader hands
  // the pointer a literal `&amp;`.
  test('an ampersand in a title round-trips to one ampersand', () => {
    const inner = '<div class="chart-header"><h2>Board</h2></div><div class="chart-body">'
      + buildKanbanBoard('<li>Ops &amp; IT<ul><li>a</li></ul></li><li>Second<ul><li>b</li></ul></li>')
      + '</div>';
    const parts = carouselize(kbTag, inner, { strategy: 'kanban-lanes' }, 2, 'kanban');
    const raw = (parts[0].match(/\sdata-split-label="([^"]*)"/) || [])[1];
    assert.equal(raw, 'Ops &amp; IT', 'stored double-escaped — one decode on read yields `&amp;`');
  });

  // A strategy that declares no `label` must not stamp a blank one: an empty attribute would be
  // read as a member named '' and print a bare "continues" where the heuristic had a real name.
  test('no label class, no stamp — the heuristic still runs', () => {
    const parts = carouselize(rlTag, rlInner, { strategy: 'redline-blocks' }, 2, 'redline');
    assert.ok(Array.isArray(parts));
    for (const p of parts) {
      assert.ok(!/\sdata-split-label=/.test(p),
        'redline-blocks declares no label class, so its pages must carry no stamp at all');
    }
  });
});
