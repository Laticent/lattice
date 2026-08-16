/**
 * Unit tests for the chart-family transformer's applyToDom (DOM-walk path).
 *
 * applyToDom delegates to engine.transformChartSection — same kernel
 * lattice-emulator.js (via lib/engine) uses. These tests cover three
 * of the seven layouts (progress, piechart, radar) with the simplest
 * input that exercises each one's branch. The HTML-string kernel is
 * covered separately in registry.test.js and the integration suite.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const chartFamily = require('../../../lib/transformers/chart-family');
const engine = require('../../../lib/components/chart/_chart-family/chart-family');
const notesCore = require('../../../lib/authoring/notes-core');

function makeDoc(bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

describe('chart-family.applyToDom', () => {
  test('progress: wraps in chart-frame + emits .progress-bars', () => {
    const doc = makeDoc(`
      <section class="progress">
        <h2>Q3 status</h2>
        <ul>
          <li>API <code>72</code> <code>on-track</code></li>
          <li>UI  <code>40</code> <code>at-risk</code></li>
        </ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.progress');
    assert.ok(sec.classList.contains('chart-frame'),
      'chart-frame class added to section.progress');
    // .viz-frame merge: the chrome (eyebrow/h2/subtitle) is emitted TOP-LEVEL, not in a
    // `.chart-header` wrapper, so the masthead transform (run later in the real pipeline)
    // hoists it into the masthead band. This transform-only output therefore has NO
    // `.chart-header` and a top-level <h2>.
    assert.ok(!sec.querySelector('.chart-header'), 'no .chart-header wrapper (chrome is top-level)');
    assert.ok(sec.querySelector('h2'), 'h2 emitted (top-level chrome)');
    assert.ok(sec.querySelector('.chart-body .progress-bars'),
      'progress-bars container in chart-body');
  });

  test('progress: a row with a nested sublist still renders every bar (depth-aware extraction)', () => {
    // Regression for #452.3 — the old naive /<ul>…<\/ul>/ stopped at the row's
    // NESTED </ul>, truncating the outer list to ZERO parseable bars. With the
    // depth-aware extractFirstList both rows survive and the sublist becomes the
    // row's progress-note.
    const doc = makeDoc(`
      <section class="progress">
        <h2>Q3 status</h2>
        <ul>
          <li>API <code>72</code> <code>on-track</code>
            <ul><li>Shipped the v2 gateway.</li></ul>
          </li>
          <li>UI <code>40</code> <code>at-risk</code></li>
        </ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.progress');
    const rows = sec.querySelectorAll('.progress-bars .progress-row');
    assert.equal(rows.length, 2, 'both rows render despite the nested sublist');
    const labels = [...sec.querySelectorAll('.progress-label')].map(n => n.textContent.trim());
    assert.deepEqual(labels, ['API', 'UI'], `clean labels, got ${labels.join('|')}`);
    const note = sec.querySelector('.progress-row .progress-note');
    assert.ok(note, 'the sublist surfaces as a progress-note');
    assert.match(note.textContent, /Shipped the v2 gateway\./, 'note content captured');
  });

  test('timeline-list: a nested <ul> body renders cleanly (already-correct path stays correct)', () => {
    // The intended authoring — a bullet sublist as the item body — was never
    // broken by the old /<ol>…<\/ol>/ regex (a nested </ul> does not terminate
    // an </ol> match). This guards that the extractFirstList switch keeps it
    // byte-equivalent: both items, clean titles, and the sublist as timeline-body.
    const doc = makeDoc(`
      <section class="timeline-list">
        <h2>Roadmap</h2>
        <ol>
          <li><code>2026 Q1</code> Discovery <code>done</code>
            <ul><li>Interviewed 30 teams.</li></ul>
          </li>
          <li><code>2026 Q2</code> Build</li>
        </ol>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.timeline-list');
    const items = sec.querySelectorAll('.timeline-spine .timeline-item');
    assert.equal(items.length, 2, 'both timeline items render');
    const titles = [...sec.querySelectorAll('.timeline-title')].map(n => n.textContent.trim());
    assert.deepEqual(titles, ['Discovery', 'Build'], `clean titles, got ${titles.join('|')}`);
    const body = sec.querySelector('.timeline-item .timeline-body');
    assert.ok(body, 'the bullet sublist surfaces as a timeline-body');
    assert.match(body.textContent, /Interviewed 30 teams\./, 'body content captured');
  });

  test('timeline-list: a nested <ol> no longer truncates the whole spine (depth-aware extraction)', () => {
    // Regression for #452.3 — the old naive /<ol>…<\/ol>/ stopped at an item's
    // NESTED </ol>, truncating the spine to ZERO items. The depth-aware
    // extractFirstList matches the outer list by depth, so both items survive.
    // (A nested <ol> is not a recognised body type, so it doesn't become a clean
    // timeline-body — the fix is about not losing the whole list, not styling it.)
    const doc = makeDoc(`
      <section class="timeline-list">
        <h2>Roadmap</h2>
        <ol>
          <li><code>2026 Q1</code> Discovery
            <ol><li>Sub-step.</li></ol>
          </li>
          <li><code>2026 Q2</code> Build</li>
        </ol>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.timeline-list');
    const items = sec.querySelectorAll('.timeline-spine .timeline-item');
    assert.equal(items.length, 2, 'both items survive the nested <ol> (was 0 before the fix)');
    const pills = [...sec.querySelectorAll('.timeline-pill')].map(n => n.textContent.trim());
    assert.deepEqual(pills, ['2026 Q1', '2026 Q2'], `both date pills parsed, got ${pills.join('|')}`);
  });

  test('piechart: builds SVG wedges + legend', () => {
    const doc = makeDoc(`
      <section class="piechart">
        <h2>Mix</h2>
        <ul>
          <li>A <code>40</code></li>
          <li>B <code>35</code></li>
          <li>C <code>25</code></li>
        </ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.piechart');
    assert.ok(sec.classList.contains('chart-frame'));
    assert.ok(sec.querySelector('.piechart-figure svg.piechart-svg'),
      'piechart SVG emitted');
    // SVG-native legend (2026-06-13-svg-native-legend.md): the key is now inside
    // the diagram's <svg> as a swatch <rect> + label/value <text> per series,
    // not an HTML <ol>. Three series → three labels, values and swatches.
    assert.equal(sec.querySelectorAll('.piechart-svg .chart-key-label').length, 3,
      'three legend labels');
    assert.equal(sec.querySelectorAll('.piechart-svg .chart-key-value').length, 3,
      'three legend values');
    assert.equal(sec.querySelectorAll('.piechart-svg .chart-key-swatch').length, 3,
      'three legend swatches');
  });

  test('piechart: wedges carry data-mark; a nested sublist becomes an inert detail template (shared substrate)', () => {
    const doc = makeDoc(`
      <section class="piechart">
        <h2>Mix</h2>
        <ul>
          <li>A <code>60</code>
            <ul><li>The bulk of it.</li><li>120 hrs</li></ul>
          </li>
          <li>B <code>40</code></li>
        </ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.piechart');
    // every wedge is index-tagged for present-mode binding — the SAME data-mark
    // vocabulary as funnel/map/quadrant/radar (no more bespoke data-slice).
    const wedges = sec.querySelectorAll('.piechart-svg .wedge[data-mark]');
    assert.equal(wedges.length, 2, 'both wedges tagged with data-mark');
    // the label is clean — the nested sublist did NOT pollute it
    const labels = [...sec.querySelectorAll('.chart-key-label')].map(n => n.textContent.trim());
    assert.ok(labels.includes('A') && labels.includes('B'), `clean labels, got ${labels.join('|')}`);
    // detail payload rides the shared inert substrate (renders nothing → PDF byte-identical)
    const tpl = sec.querySelector('.chart-details[hidden] template.chart-detail[data-mark="0"]');
    assert.ok(tpl, 'detail template emitted for the slice with a sublist');
    assert.match(tpl.innerHTML, /120 hrs/, 'sublist content captured in the template');
    assert.equal(sec.querySelectorAll('template.chart-detail').length, 1,
      'only the slice with a sublist gets a detail template');
  });

  test('piechart: portrait section → legend-below (diagram offset by a non-zero dx, taller viewBox)', () => {
    // The preview/export parity guard for §9: applyToDom is the runtime/preview
    // path, and it must read data-orientation and emit the SAME portrait
    // composition the export path bakes (the §7 runtime-ordering footgun). A
    // landscape pie centers its diagram at translate(0 …); portrait shifts it.
    const make = (orientation) => {
      const doc = makeDoc(`
        <section class="piechart"${orientation ? ` data-orientation="${orientation}"` : ''}>
          <h2>Mix</h2>
          <ul><li>A <code>40</code></li><li>B <code>35</code></li><li>C <code>25</code></li></ul>
        </section>
      `);
      chartFamily.applyToDom(doc);
      return doc.querySelector('section.piechart .piechart-svg');
    };
    const land = make();
    const port = make('portrait');
    const vb = (svg) => svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const [, , lW, lH] = vb(land);
    const [, , pW, pH] = vb(port);
    assert.ok(lW > lH, `landscape pie is wide (${lW}×${lH})`);
    assert.ok(pH > pW, `portrait pie is tall (${pW}×${pH})`);
    // Landscape diagram group sits at the left (dx 0); portrait centers it (dx > 0).
    assert.match(land.querySelector('g').getAttribute('transform'), /^translate\(0 /,
      'landscape diagram group at translate(0 …)');
    const pdx = +port.querySelector('g').getAttribute('transform').match(/translate\(([\d.]+) /)[1];
    assert.ok(pdx > 0, `portrait diagram group is centered (dx=${pdx})`);
  });

  test('radar: builds polygons with per-series colours from the chart spectrum (--catN-hue)', () => {
    const doc = makeDoc(`
      <section class="radar">
        <h2>Skills</h2>
        <ul>
          <li>Teacher
            <ul>
              <li>Calculus <code>9</code></li>
              <li>Geometry <code>7</code></li>
              <li>Algebra  <code>8</code></li>
            </ul>
          </li>
          <li>Student
            <ul>
              <li>Calculus <code>7</code></li>
              <li>Geometry <code>8</code></li>
              <li>Algebra  <code>9</code></li>
            </ul>
          </li>
        </ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.radar');
    assert.ok(sec.classList.contains('chart-frame'));
    const polys = sec.querySelectorAll('polygon.radar-poly');
    assert.equal(polys.length, 2, 'two series → two polygons');
    // Radar now draws from the chart-family's own Apple-inspired spectrum
    // (--catN-hue), decoupled from the engine-wide cN accents — same token the
    // quadrant/pie/progress members consume. Guard against a regression back to
    // the raw cN scale (or an undefined --cat-<name> token).
    const styles = [...polys].map(p => p.getAttribute('style') || '');
    for (const s of styles) {
      assert.match(s, /--series-color:\s*var\(--chart-cat-\d-hue\)/,
        `series-color resolves through the chart spectrum (--chart-cat-N-hue); got "${s}"`);
    }
    // Each default-variant polygon also carries the area-fade gradient.
    for (const s of styles) {
      assert.match(s, /fill:url\(#radar-area-\d+\)/,
        `radar-poly fills with its per-series area gradient; got "${s}"`);
    }
  });

  test('funnel: reads the section data-orientation → portrait emits the TALL viewBox', () => {
    const doc = makeDoc(`
      <section class="funnel" data-orientation="portrait">
        <h2>Drop-off</h2>
        <ul><li>A <code>1000</code></li><li>B <code>600</code></li><li>C <code>200</code></li></ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const svg = doc.querySelector('section.funnel .funnel-svg');
    assert.ok(svg, 'funnel SVG emitted');
    assert.equal(svg.getAttribute('viewBox'), '0 0 320 420', 'portrait → tall viewBox');
  });

  test('funnel: a landscape section (no data-orientation) keeps the original viewBox', () => {
    const doc = makeDoc(`
      <section class="funnel">
        <h2>Drop-off</h2>
        <ul><li>A <code>1000</code></li><li>B <code>600</code></li><li>C <code>200</code></li></ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    assert.equal(doc.querySelector('section.funnel .funnel-svg').getAttribute('viewBox'),
      '0 0 320 180', 'landscape → original viewBox (byte-identical)');
  });

  test('roadmap: portrait auto-selects the horizons card form (section class + .horizons grid)', () => {
    const table = `<table><thead><tr><th>WS</th><th>Q1</th><th>Q2</th></tr></thead>` +
      `<tbody><tr><td>Intake</td><td>Taxonomy [x]</td><td>Scoring [/]</td></tr></tbody></table>`;
    const doc = makeDoc(`<section class="roadmap" data-orientation="portrait"><h2>Plan</h2>${table}</section>`);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.roadmap');
    assert.ok(sec.classList.contains('horizons'), 'section gains the horizons class (so the card CSS applies)');
    assert.ok(sec.querySelector('.horizons'), 'table transposed to the .horizons card grid');
    assert.ok(sec.querySelector('.horizon-card'), 'phase cards emitted');
  });

  test('roadmap: landscape / square / no-stamp keep the table (only portrait transposes)', () => {
    const table = `<table><thead><tr><th>WS</th><th>Q1</th><th>Q2</th></tr></thead>` +
      `<tbody><tr><td>Intake</td><td>Taxonomy [x]</td><td>Scoring [/]</td></tr></tbody></table>`;
    // 'square' is a non-portrait orientation (1:1-ish) — it must NOT trigger horizons.
    for (const o of [undefined, 'landscape', 'square']) {
      const doc = makeDoc(`<section class="roadmap"${o ? ` data-orientation="${o}"` : ''}><h2>Plan</h2>${table}</section>`);
      chartFamily.applyToDom(doc);
      const sec = doc.querySelector('section.roadmap');
      assert.ok(!sec.classList.contains('horizons'), `${o ?? 'none'}: stays the table form`);
      assert.ok(!sec.querySelector('.horizons'), `${o ?? 'none'}: no horizons transpose`);
      assert.ok(sec.querySelector('table'), `${o ?? 'none'}: table preserved`);
    }
  });

  test('passes through non-chart sections', () => {
    const doc = makeDoc(`
      <section class="content"><h2>plain</h2><p>nothing.</p></section>
    `);
    const before = doc.querySelector('section.content').outerHTML;
    chartFamily.applyToDom(doc);
    const after = doc.querySelector('section.content').outerHTML;
    assert.equal(after, before);
  });

  test('idempotent: a second pass is a no-op', () => {
    const doc = makeDoc(`
      <section class="progress">
        <h2>Test</h2>
        <ul><li>A <code>50</code></li></ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const once = doc.querySelector('section.progress').innerHTML;
    const onceCls = doc.querySelector('section.progress').className;
    chartFamily.applyToDom(doc);
    const twice = doc.querySelector('section.progress').innerHTML;
    const twiceCls = doc.querySelector('section.progress').className;
    assert.equal(twice, once);
    assert.equal(twiceCls, onceCls, 'chart-frame should not double-append');
  });

  test('safely returns on null / non-DOM root', () => {
    assert.doesNotThrow(() => chartFamily.applyToDom(null));
    assert.doesNotThrow(() => chartFamily.applyToDom(undefined));
    assert.doesNotThrow(() => chartFamily.applyToDom({}));
  });
});

// Per-slice pie detail → speaker note in the static PDF (#452.1). The same
// authored sublist powers the Present-mode <template> popover AND, folded into a
// Marp-faithful comment, the slide's speaker note (PDF annotation + hidden aside)
// — so a PDF reader gets the detail without the chart pixels changing. The note
// builder itself (detailNote) is unit-tested in mark-detail.test.js; here we
// assert the pie wires it through transformChartSection on the SHARED substrate
// (chart-detail / data-mark), the same as the other SVG charts.
/**
 * The rebuild guard (#1673). `transformChartSection` early-returns on a section
 * already carrying `chart-frame`, and this adapter replaced `innerHTML` on the
 * first pass — so the authored list was gone and no later pass could rebuild a
 * chart, whatever changed about it. The adapter now keeps the source, which
 * makes a rebuild possible; these tests pin BOTH halves of when it happens,
 * because either one being wrong is a defect:
 *
 *   - it must NOT rebuild when nothing that affects the build moved. The runtime
 *     runs this pass repeatedly and cheaply on purpose (every transform is an
 *     idempotent no-op), and a chart that rebuilt every pass would throw away
 *     its own `data-mark` popover targets and anima nodes on each one.
 *   - it MUST rebuild when the class list changes, which is how a deck-wide
 *     register landing late (the fetch fallback) reaches a chart whose geometry
 *     keys on it.
 */
describe('chart-family.applyToDom — the rebuild guard', () => {
  const GANTT = `
    <section class="gantt">
      <h2>Plan</h2>
      <p><code>2026-01-01 .. 2027-03-31</code></p>
      <ul><li>Framework<ul>
        <li>Taxonomy <code>2026-01-01..2026-04-30</code> <code>done</code></li>
        <li>Weighting <code>2026-10-01..2027-02-28</code> <code>at-risk</code></li>
      </ul></li></ul>
    </section>`;
  const ticks = (sec) => sec.querySelectorAll('text.gantt-tick').length;

  test('a second pass with an unchanged class list does not rebuild', () => {
    const doc = makeDoc(GANTT);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.gantt');
    // A sentinel a rebuild would destroy — standing in for the popover targets
    // and anima nodes a real slide carries by this point.
    sec.querySelector('svg').setAttribute('data-sentinel', 'kept');
    chartFamily.applyToDom(doc);
    chartFamily.applyToDom(doc);
    assert.equal(sec.querySelector('svg').getAttribute('data-sentinel'), 'kept',
      'the chart was rebuilt on a pass where nothing about it had changed');
  });

  test('a deck-wide token landing late DOES rebuild, with the new face\'s geometry', () => {
    const doc = makeDoc(GANTT);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.gantt');
    const mono = ticks(sec);
    // What the fetch fallback does once the source `.md` resolves.
    sec.classList.add('sketch');
    chartFamily.applyToDom(doc);
    assert.notEqual(ticks(sec), mono,
      'the axis kept its mono tick count while the CSS moved to the hand face');
    assert.equal(ticks(sec), engine.buildGanttChart(
      engine.extractFirstList(GANTT.match(/<ul>[\s\S]*<\/ul>/)[0]).inner,
      '<p><code>2026-01-01 .. 2027-03-31</code></p>', undefined, true,
    ).match(/class="gantt-tick"/g).length, 'the rebuild must match what the engine builds');
  });

  test('the rebuild replaces the figure rather than stacking a second one', () => {
    const doc = makeDoc(GANTT);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.gantt');
    sec.classList.add('sketch');
    chartFamily.applyToDom(doc);
    assert.equal(sec.querySelectorAll('.chart-body').length, 1);
    assert.equal(sec.querySelectorAll('svg').length, 1);
  });

  test('rebuilding twice settles — the source survives its own rebuild', () => {
    // The rebuild feeds `transformChartSection` the STORED source, not the built
    // DOM, so a second class change must still find an authored list. Storing
    // the post-build HTML instead would work exactly once.
    const doc = makeDoc(GANTT);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.gantt');
    sec.classList.add('sketch');
    chartFamily.applyToDom(doc);
    const hand = ticks(sec);
    sec.classList.remove('sketch');
    chartFamily.applyToDom(doc);
    assert.notEqual(ticks(sec), hand, 'dropping the token must return the mono geometry');
    assert.ok(ticks(sec) > 0, 'the source list was consumed — a rebuild found nothing to build');
  });

  test('an engine diagnostic class flipping is NOT a change', () => {
    // The overflow / fit / legibility watchers toggle these onto and off top-level
    // sections as live state, and they land on chart sections for real — the
    // type-floor alarm's own note records it firing on 7 of 11 slides of the
    // state-chart gallery, and state-chart is a chart layout. No builder reads
    // them, so a flip must not buy a destructive rebuild: the output would be
    // identical and the chart would lose its popover and motion targets for
    // nothing. Found by the checker on this diff (#1673).
    const doc = makeDoc(GANTT);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.gantt');
    for (const cls of ['overflow', 'clip-marked', 'illegible', 'fit-marked']) {
      sec.querySelector('svg').setAttribute('data-sentinel', 'kept');
      sec.classList.add(cls);
      chartFamily.applyToDom(doc);
      assert.equal(sec.querySelector('svg').getAttribute('data-sentinel'), 'kept',
        `adding \`${cls}\` rebuilt the chart`);
      sec.classList.remove(cls);
      chartFamily.applyToDom(doc);
      assert.equal(sec.querySelector('svg').getAttribute('data-sentinel'), 'kept',
        `removing \`${cls}\` rebuilt the chart`);
    }
  });

  test('a diagnostic class alongside a REAL change still rebuilds', () => {
    // The filter must not swallow a genuine trigger that happens to arrive in the
    // same pass as a watcher flip.
    const doc = makeDoc(GANTT);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.gantt');
    const mono = ticks(sec);
    sec.classList.add('overflow');
    sec.classList.add('sketch');
    chartFamily.applyToDom(doc);
    assert.notEqual(ticks(sec), mono, 'the deck token was ignored because a watcher class rode with it');
  });

  test('re-authored content wins over the stored source — the map cannot go stale', () => {
    // A previewer that reuses the same <section> across an edit rewrites the
    // content AND re-stamps the class list from `_class:`, dropping chart-frame.
    // Without a check for that marker, the rebuild ran from the stored source and
    // resurrected the OLD chart over the new authoring — a regression against the
    // pre-change code, which had no memory and so could not be stale. #1673.
    const doc = makeDoc(GANTT);
    const sec = doc.querySelector('section.gantt');
    chartFamily.applyToDom(doc);
    sec.innerHTML = '<h2>New deck.</h2><ul><li>Zulu<ul>'
      + '<li>New work <code>2030-01-01..2030-06-30</code></li></ul></li></ul>';
    sec.className = 'gantt';
    chartFamily.applyToDom(doc);
    assert.match(sec.innerHTML, /Zulu/, 'the newly authored lane is missing');
    assert.doesNotMatch(sec.innerHTML, /Framework/, 'the previous deck was resurrected');
  });

  test('a changed data-orientation rebuilds — the class list is not the only build input', () => {
    // transformChartSection takes (source, cls, orientation). Keying only on the
    // class list left a chart built for landscape sitting on a section the
    // runtime had since re-stamped portrait. #1673, found by the inversion lens.
    const doc = makeDoc(GANTT);
    const sec = doc.querySelector('section.gantt');
    sec.setAttribute('data-orientation', 'landscape');
    chartFamily.applyToDom(doc);
    const landscape = sec.innerHTML;
    sec.setAttribute('data-orientation', 'portrait');
    chartFamily.applyToDom(doc);
    assert.notEqual(sec.innerHTML, landscape,
      'the section became portrait and the chart kept its landscape geometry');
  });

  test('class order alone is not a change', () => {
    const doc = makeDoc(GANTT);
    chartFamily.applyToDom(doc);
    const sec = doc.querySelector('section.gantt');
    sec.querySelector('svg').setAttribute('data-sentinel', 'kept');
    sec.className = sec.className.split(/\s+/).reverse().join(' ');
    chartFamily.applyToDom(doc);
    assert.equal(sec.querySelector('svg').getAttribute('data-sentinel'), 'kept',
      'a reordered class list is the same list — rebuilding on it is pure churn');
  });
});

describe('piechart per-slice detail → speaker-note comment', () => {
  test('a pie with NO detail emits no comment (byte-identical export preserved)', () => {
    const html = engine.transformChartSection(
      '<h2>Mix</h2><ul><li>A <code>60%</code></li><li>B <code>40%</code></li></ul>', 'piechart').html;
    assert.ok(!/<!--/.test(html), 'plain pie stays comment-free');
  });

  test('transformChartSection emits the note comment AND keeps the figure + templates', () => {
    const html = engine.transformChartSection(
      '<h2>Mix</h2><ul><li>A <code>60%</code><ul><li>the bulk</li></ul></li><li>B <code>40%</code></li></ul>',
      'piechart').html;
    assert.match(html, /<!-- A \(60%\): the bulk -->/);
    assert.match(html, /class="piechart-figure"/, 'figure still rendered');
    assert.match(html, /template class="chart-detail" data-mark="0"/, 'present-mode template intact');
  });

  test('notes-core lifts the synthesized comment as the slide note (the boundary that ships it)', () => {
    const section = engine.transformChartSection(
      '<h2>Mix</h2><ul><li>A <code>60%</code><ul><li>the detail</li></ul></li></ul>', 'piechart').html;
    const note = notesCore.notesFromHtml(`<section>${section}</section>`);
    assert.match(note, /A \(60%\): the detail/);
    // and the comment is removed from the visible HTML once lifted
    assert.ok(!/<!--/.test(notesCore.stripCommentNodes(section)), 'comment stripped after lift');
  });
});
