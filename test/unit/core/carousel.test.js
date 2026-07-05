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
  const inner = `<header>H</header><h2>Heading</h2><p><code>Scope eyebrow</code></p><ul>${item('A')}${item('B')}${item('C')}${item('D')}</ul><footer>F</footer>`;
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

  test('the cover carries the heading hero, the eyebrow, and the intro lead-in', () => {
    const [cover] = carouselize(openTag, inner, recipe);
    assert.match(cover, /split-feat-h">Heading/);
    assert.match(cover, /split-feat-eye">Scope eyebrow/);
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
