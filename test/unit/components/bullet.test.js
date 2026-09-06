/**
 * Unit: lib/components/chart/bullet/bullet.transform.js — kernel for the
 * `bullet` chart-family member (Stephen Few's bullet graph).
 *
 * Section dispatch and the chart-frame wrap live in the family dispatcher; this
 * kernel produces the figure HTML, so the arms here cover what it owns:
 *
 *   1. The authoring contract — two trailing pills for the dense form, a named
 *      nested sublist for the explicit form, and the rule that decides which
 *      nested bullets are DATA and which are mark detail.
 *   2. The two scale modes — one shared value axis when the rows can honestly
 *      share one, per-row normalization when they cannot, and the single
 *      normalization constant that lands every target marker on one x.
 *   3. The marks — zones tile the track contiguously, the measure is
 *      proportional, the target is a tick, and nothing carries a color.
 *   4. The CSS mirror — the kernel's `FS` table against the stylesheets that
 *      actually paint those labels.
 *
 * The shared substrate (`_chart-family/cartesian.js`) has its own suite; nothing
 * here re-tests scales, ticks or affix formatting.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseBullet, buildBullet, transformSection,
  FS, ROW, GUT, BAND_FRACTIONS, PLAN_HEADROOM, MAGNITUDE_SPREAD,
} = require('../../../lib/components/chart/bullet/bullet.transform');

const COMPONENT_DIR = path.join(__dirname, '../../../lib/components/chart/bullet');
const STYLES = fs.readFileSync(path.join(COMPONENT_DIR, 'bullet.styles.css'), 'utf8');
const FAMILY_STYLES = fs.readFileSync(
  path.join(__dirname, '../../../lib/components/chart/_chart-family/chart-family.css'), 'utf8',
);

/** The <ul> inner HTML the dispatcher hands the kernel, for the flat form. */
function ul(rows) {
  return rows.map(([label, measure, target]) => '<li>' + label
    + (measure != null ? ` <code>${measure}</code>` : '')
    + (target != null ? ` <code>${target}</code>` : '')
    + '</li>').join('');
}

/** One row with a nested sublist of raw <li> bodies. */
function nested(lead, children) {
  return `<li>${lead}<ul>${children.map((c) => `<li>${c}</li>`).join('')}</ul></li>`;
}

/** Every `<rect class="bullet-band …">` in emitted order, as numbers. */
function zones(html) {
  // Match each tag ONCE, then read its attributes. Several `[^<>]*` runs in one
  // pattern backtrack polynomially on a long tag (CodeQL js/polynomial-redos).
  return [...html.matchAll(/<rect class="bullet-band bullet-zone-\d+"[^<>]*>/g)]
    .map((m) => ({
      z: +(/bullet-zone-(\d+)/.exec(m[0]) || [])[1],
      x: +(/\sx="([-\d.]+)"/.exec(m[0]) || [])[1],
      w: +(/\swidth="([-\d.]+)"/.exec(m[0]) || [])[1],
    }));
}

function measures(html) {
  return [...html.matchAll(/<rect class="bullet-measure"[^<>]*>/g)]
    .map((m) => ({
      x: +(/\sx="([-\d.]+)"/.exec(m[0]) || [])[1],
      w: +(/\swidth="([-\d.]+)"/.exec(m[0]) || [])[1],
    }));
}

function targets(html) {
  return [...html.matchAll(/class="bullet-target"[^<>]*x1="([-\d.]+)"/g)].map((m) => +m[1]);
}

describe('bullet kernel', () => {
  describe('parseBullet — the authoring contract', () => {
    test('the flat form reads measure then target from two trailing pills', () => {
      const m = parseBullet(ul([['New ARR', '4.2M', '5.0M'], ['Expansion ARR', '3.6M', '3.0M']]));
      assert.deepEqual(m.rows.map((r) => r.label), ['New ARR', 'Expansion ARR']);
      assert.deepEqual(m.rows.map((r) => r.measure), [4200000, 3600000]);
      assert.deepEqual(m.rows.map((r) => r.target), [5000000, 3000000]);
      // The raw pills survive for the readout, magnitude suffix and all.
      assert.deepEqual(m.rows.map((r) => r.measureRaw), ['4.2M', '3.6M']);
    });

    test('one pill is a measure with no target — the degenerate bare bar', () => {
      const m = parseBullet(ul([['Headcount', '184']]));
      assert.equal(m.rows[0].measure, 184);
      assert.ok(Number.isNaN(m.rows[0].target), 'no target parsed');
      assert.deepEqual(m.rows[0].cuts, [], 'and therefore no qualitative range');
    });

    test('the nested form names its values, and a Target there overrides the second pill', () => {
      const m = parseBullet(nested('Uptime <code>99.4%</code> <code>98.0%</code>', [
        'Target <code>99.9%</code>',
        'Floor <code>99.0%</code>',
        'Band <code>99.5%</code>',
      ]));
      assert.equal(m.rows[0].measure, 99.4);
      assert.equal(m.rows[0].target, 99.9, 'the named Target wins over the trailing pill');
      assert.equal(m.rows[0].floor, 99);
      assert.deepEqual(m.rows[0].bands, [99.5]);
    });

    test('an `Actual` child overrides the measure pill too', () => {
      const m = parseBullet(nested('Uptime <code>1</code>', ['Actual <code>99.4%</code>', 'Target <code>99.9%</code>']));
      assert.equal(m.rows[0].measure, 99.4);
    });

    test('DETAIL vs DATA — only a KEYWORD + numeric pill is structural', () => {
      const m = parseBullet(nested('New ARR <code>4.2M</code> <code>5.0M</code>', [
        'Band <code>3.0M</code>',        // data
        'Closed two weeks early',        // detail: no pill
        'Best quarter in <code>EMEA</code>', // detail: pill, not a number
        'Organic <code>60%</code>',      // detail: numeric pill, unrecognized name
      ]));
      assert.deepEqual(m.rows[0].bands, [3000000], 'only the named Band is a boundary');
      assert.match(m.rows[0].detail, /Closed two weeks early/);
      assert.match(m.rows[0].detail, /EMEA/);
      assert.match(m.rows[0].detail, /Organic/,
        'a numeric pill under an unrecognized name stays detail — it is not a phantom band');
    });

    test('band keywords are case-insensitive and accept the documented synonyms', () => {
      const m = parseBullet(nested('KPI <code>50</code>', [
        'PLAN <code>80</code>', 'range <code>40</code>', 'base <code>10</code>',
      ]));
      assert.equal(m.rows[0].target, 80);
      assert.deepEqual(m.rows[0].bands, [40]);
      assert.equal(m.rows[0].floor, 10);
    });

    test('explicit bands sort ascending however they were authored', () => {
      const m = parseBullet(nested('KPI <code>50</code> <code>80</code>', [
        'Band <code>70</code>', 'Band <code>30</code>', 'Band <code>50</code>',
      ]));
      assert.deepEqual(m.rows[0].bands, [30, 50, 70]);
    });

    test('an empty list, and a list with no numbers at all, return null', () => {
      assert.equal(parseBullet(''), null);
      assert.equal(parseBullet('<li>Just a label</li>'), null);
      assert.equal(parseBullet('<li>Region <code>EMEA</code></li>'), null,
        'a non-numeric pill is not a measure');
    });

    test('a malformed value pill drops that row rather than plotting it at zero', () => {
      const m = parseBullet('<li>Good <code>40</code> <code>50</code></li><li>Bad <code>n/a</code></li>');
      assert.equal(m.rows.length, 2, 'the row survives so its name still appears');
      assert.ok(Number.isNaN(m.rows[1].measure), 'but it carries no measure');
      assert.doesNotMatch(buildBullet(m, {}), /NaN/, 'and no NaN reaches the SVG');
    });

    test('the top-level walk is depth-aware — a nested list adds no row', () => {
      const m = parseBullet(nested('Top <code>10</code> <code>12</code>', ['child']) + '<li>Bottom <code>5</code> <code>6</code></li>');
      assert.equal(m.rows.length, 2);
    });
  });

  describe('parseBullet — which scale the rows get', () => {
    test('same affix and comparable magnitudes share ONE value axis', () => {
      const m = parseBullet(ul([['A', '4.2M', '5.0M'], ['B', '3.6M', '3.0M'], ['C', '2.8M', '2.6M']]));
      assert.equal(m.shared, true);
    });

    test('a percentage row beside a currency row does NOT — the axis would be a lie', () => {
      const m = parseBullet(ul([['ARR', '$4.2M', '$5.0M'], ['NRR', '118%', '112%']]));
      assert.equal(m.shared, false);
    });

    test('magnitudes further apart than the spread cap do not share an axis either', () => {
      const near = parseBullet(ul([['A', '4.0M', '5.0M'], ['B', '1.6M', '2.0M']]));
      assert.equal(near.shared, true, 'within the cap');
      const far = parseBullet(ul([['A', '4.0M', '5.0M'], ['B', '0.05M', '0.06M']]));
      assert.equal(far.shared, false, `past ${MAGNITUDE_SPREAD}x the small row would be an unreadable stub`);
    });

    test('a single row never claims a shared axis', () => {
      assert.equal(parseBullet(ul([['Only', '4.2M', '5.0M']])).shared, false);
    });

    test('one declared Floor puts the WHOLE chart on per-row scales', () => {
      const m = parseBullet(
        ul([['A', '91%', '94%']]) + nested('B <code>99.4%</code> <code>99.9%</code>', ['Floor <code>99.0%</code>']),
      );
      assert.equal(m.floored, true);
      assert.equal(m.shared, false, 'a floored row and a zero-based row are not the same ruler');
    });
  });

  describe('buildBullet — the figure scaffold', () => {
    const model = parseBullet(ul([['New ARR', '4.2M', '5.0M'], ['Expansion ARR', '3.6M', '3.0M']]));

    test('emits the figure class the manifest declares, carrying the row count', () => {
      const html = buildBullet(model, {});
      assert.match(html, /<div class="bullet-figure" style="--bullet-rows:2">/);
      const manifest = JSON.parse(fs.readFileSync(path.join(COMPONENT_DIR, 'bullet.manifest.json'), 'utf8'));
      assert.match(html, new RegExp(`class="${manifest.kernel.figureClass}"`),
        'checkChartKernels text-matches this pair — a runtime-assembled class fails');
    });

    test('the SVG carries a viewBox, the meet aspect, and stays in the a11y tree', () => {
      const html = buildBullet(model, {});
      assert.match(html, /<svg[^<>]*viewBox="0 0 320 180"/);
      assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
      assert.match(html, /<svg[^<>]*role="img"/);
      assert.doesNotMatch(html, /aria-hidden="true"/);
      assert.match(html, /<title>Bullet graph — actual against target<\/title>/);
    });

    test('portrait takes the taller shared viewBox; landscape and square do not', () => {
      assert.match(buildBullet(model, { orientation: 'portrait' }), /viewBox="0 0 320 300"/);
      const base = buildBullet(model, {});
      assert.equal(buildBullet(model, { orientation: 'landscape' }), base);
      assert.equal(buildBullet(model, { orientation: 'square' }), base, 'square keeps the landscape box');
    });

    test('the <desc> carries the RELATIONSHIP, not just the two numbers', () => {
      // `role="img"` prunes the subtree, so every <text> above is unreachable and
      // this string is the only route to the data. A bullet graph exists to say
      // whether the bar cleared the tick, so attainment and the verdict are in it.
      const html = buildBullet(model, {});
      assert.match(html, /<desc>New ARR 4\.2M, 84% of the 5M target — below plan; Expansion ARR 3\.6M, 120% of the 3M target — at or above plan<\/desc>/);
    });

    test('printed values go through the substrate formatter, so one chart speaks one unit', () => {
      // Authored `900k` beside `1.2M` used to print two magnitudes for one
      // quantity, and the reader re-scaled between a measure and the target it
      // is being compared with.
      const html = buildBullet(parseBullet(ul([['A', '900k', '1.2M'], ['B', '1.4M', '1.3M']])), {});
      const valueTag = html.split('class="cart-value bullet-value"')[1] || '';
      assert.match(valueTag.slice(0, 200), /0\.9M</);
      assert.doesNotMatch(html, />900k</);
      // The AUTHORED pill still rides `data-value`, which is the datum tooling
      // and the reveal popover read.
      assert.match(html, /data-value="900k"/);
    });

    test('the per-row formatter keeps the author\'s magnitude — a nice step, not extent/4', () => {
      // `axisUnit` steps DOWN a magnitude rung when the step would need more
      // than two decimals under it, and a raw extent/4 almost never lands on a
      // round number: a 5.3M row stepping by 1.325M was billed as needing three
      // decimals under `M` and printed `$4200k` for an authored `$4.2M`.
      const m = parseBullet(ul([['ARR', '$4.2M', '$5.0M'], ['NRR', '118%', '112%']]));
      assert.equal(m.shared, false, 'mixed affixes, so each row formats itself');
      const html = buildBullet(m, {});
      assert.match(html, /<desc>ARR \$4\.2M,/);
      assert.doesNotMatch(html, /4200k/);
    });

    test('a floored row says so in the <desc>, because its bar length is not its value', () => {
      const m = parseBullet(nested('Uptime <code>99.4%</code> <code>99.9%</code>', ['Floor <code>99.0%</code>']));
      assert.match(buildBullet(m, {}), /on a scale from 99%/);
    });

    test('NO color literal of any kind reaches the output (HARD RULE #3)', () => {
      const html = buildBullet(parseBullet(ul([['A', '4.2M', '5.0M'], ['B', '0', '1.4M']])), {});
      assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/, 'no hex literal');
      assert.doesNotMatch(html, /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\s*\(/, 'no color function');
      assert.doesNotMatch(html, /\b(?:fill|stroke)="(?!none)[a-z#]/, 'no named color on a paint attribute');
    });

    test('marks carry the a11y/print texture hooks, and they do not paint', () => {
      const html = buildBullet(model, {});
      assert.match(html, /class="bullet-measure"[^<>]*data-cat="0"/, 'categorical slot, as the legend swatches use');
      assert.match(html, /class="bullet-target"[^<>]*data-marker="target"/);
      assert.match(html, /class="bullet-band bullet-zone-0"[^<>]*data-zone="0"/);
      assert.match(html, /class="bullet-measure"[^<>]*data-anima-role="bar"/);
      assert.match(html, /class="bullet-band[^"]*"[^<>]*data-anima-role="region"/);
      assert.match(html, /class="bullet-target"[^<>]*data-anima-role="point"/);
      assert.doesNotMatch(html, /\bid="bullet-/, 'no non-unique bullet-* ids baked into the export');
    });
  });

  describe('buildBullet — geometry invariants', () => {
    test('the zones TILE the track: contiguous, no gap, no overlap', () => {
      const html = buildBullet(parseBullet(ul([['A', '4.2M', '5.0M']])), {});
      const z = zones(html);
      assert.equal(z.length, BAND_FRACTIONS.length + 1, 'N cut points make N+1 zones');
      for (let i = 1; i < z.length; i++) {
        assert.ok(Math.abs((z[i - 1].x + z[i - 1].w) - z[i].x) < 0.02,
          `zone ${i} starts where zone ${i - 1} ends`);
      }
      const plotW = 320 - GUT.left - GUT.right;
      assert.ok(Math.abs((z[0].x + z.reduce((s, r) => s + r.w, 0)) - (GUT.left + plotW)) < 0.05,
        'and the last one runs to the plot edge — no rail that stops short');
    });

    test('the last zone runs to the top of the scale, not to a cut of its own', () => {
      // 0.85 x target is the last CUT; the zone above it must not end there.
      const m = parseBullet(ul([['A', '4.2M', '5.0M']]));
      const z = zones(buildBullet(m, {}));
      const scaleTop = m.rows[0].domainTop;
      const perUnit = (320 - GUT.left - GUT.right) / scaleTop;
      const lastCut = GUT.left + BAND_FRACTIONS[1] * 5000000 * perUnit;
      assert.ok(z[2].x - lastCut < 0.05 && z[2].w > 1, 'the top zone starts at the last cut and is real');
    });

    test('the measure is proportional to its value and starts at the plot origin', () => {
      const html = buildBullet(parseBullet(ul([['A', '4.0M', '5.0M'], ['B', '2.0M', '5.0M']])), {});
      const [a, b] = measures(html);
      assert.equal(a.x, GUT.left);
      assert.equal(b.x, GUT.left, 'every bar shares one origin');
      assert.ok(Math.abs(a.w - b.w * 2) < 0.05, 'half the value is half the bar');
    });

    test('a zero measure draws no bar, and a missing one draws none either', () => {
      const html = buildBullet(parseBullet(ul([['Zero', '0', '12'], ['Absent', null, null]])), {});
      const m = measures(html);
      assert.equal(m.length, 1, 'only the row with a finite measure gets a bar');
      assert.equal(m[0].w, 0, 'and at zero it has no width — never a stub of phantom progress');
    });

    test('a measure past every zone is drawn PAST them, on bare track, never clamped', () => {
      const html = buildBullet(parseBullet(ul([['Runaway', '94%', '62%'], ['Normal', '58%', '80%']])), {});
      const [runaway] = measures(html);
      const z = zones(html).filter((r) => r.z === 2);
      const bandEnd = z[0].x + z[0].w;
      assert.ok(runaway.x + runaway.w > targets(html)[0], 'the bar clears its own target marker');
      assert.ok(runaway.w > 0 && runaway.x + runaway.w <= bandEnd + 0.05,
        'and stays inside the plot, because the scale grew to hold it');
      assert.match(html, /class="bullet-measure"[^<>]*data-over="1"/, 'and is flagged over-target');
    });

    test('a measure at or under target carries no over-target flag', () => {
      const html = buildBullet(parseBullet(ul([['A', '4.2M', '5.0M']])), {});
      assert.doesNotMatch(html, /data-over/);
    });

    test('per-row mode lands EVERY target marker on the same x — the plan line', () => {
      // The whole point of one shared normalization constant: with mixed units
      // there is no common ruler, so the plan itself becomes the reference.
      const m = parseBullet(ul([['ARR', '$4.2M', '$5.0M'], ['NRR', '118%', '112%'], ['Cost', '0.25M', '0.30M']]));
      assert.equal(m.shared, false);
      const xs = targets(buildBullet(m, {}));
      assert.equal(xs.length, 3);
      assert.ok(Math.max(...xs) - Math.min(...xs) < 0.02, `targets aligned, got ${xs}`);
    });

    test('shared-axis mode scales to each row\'s OWN reach, not to k x the target', () => {
      // Scaling a shared axis by the plan headroom would pad the top of the plot
      // with empty track on every row at once.
      const m = parseBullet(ul([['A', '4.2M', '5.0M'], ['B', '3.6M', '3.0M']]));
      assert.equal(m.shared, true);
      assert.ok(m.rows[0].extent < 5000000 * PLAN_HEADROOM * 1.001);
      const html = buildBullet(m, {});
      const xs = targets(html);
      assert.ok(Math.max(...xs) - Math.min(...xs) > 1, 'and the markers sit where the values put them');
    });

    test('the class tokens force either mode', () => {
      const mixed = parseBullet(ul([['ARR', '$4.2M', '$5.0M'], ['NRR', '118%', '112%']]));
      assert.match(buildBullet(mixed, { classTokens: ['shared-axis'] }), /class="cart-tick"/,
        'forcing a shared axis draws its ticks');
      const same = parseBullet(ul([['A', '4.2M', '5.0M'], ['B', '3.6M', '3.0M']]));
      assert.doesNotMatch(buildBullet(same, { classTokens: ['own-axis'] }), /class="cart-tick"/,
        'forcing per-row scales removes the axis there is no longer one of');
    });

    test('the target tick never reaches the name line above it', () => {
      // It struck through the readout at seven rows before the overshoot was
      // bounded by the clearance instead of chosen freely.
      const rows = Array.from({ length: 7 }, (_, i) => [`KPI ${i}`, '90', '100']);
      const html = buildBullet(parseBullet(ul(rows)), {});
      const tops = [...html.matchAll(/class="bullet-target"[^<>]*y1="([-\d.]+)"/g)].map((m) => +m[1]);
      const trackTops = [...html.matchAll(/class="bullet-band bullet-zone-0"[^<>]*y="([-\d.]+)"/g)].map((m) => +m[1]);
      tops.forEach((t, i) => {
        const nameBaseline = trackTops[i] - ROW.nameGap;
        assert.ok(t > nameBaseline, `tick ${i} starts below the name baseline (${t} > ${nameBaseline})`);
      });
    });

    test('a floored row draws its origin edge; a zero-based row does not', () => {
      const floored = buildBullet(parseBullet(nested('U <code>99.4%</code> <code>99.9%</code>', ['Floor <code>99.0%</code>'])), {});
      assert.match(floored, /class="bullet-floor"[^<>]*data-marker="floor"/);
      assert.doesNotMatch(buildBullet(parseBullet(ul([['A', '4.2M', '5.0M']])), {}), /bullet-floor/);
    });

    test('portrait caps the track height so a roomier pitch spaces rows instead of inflating them', () => {
      const model = parseBullet(ul([['A', '4.2M', '5.0M'], ['B', '3.6M', '3.0M'], ['C', '2.8M', '2.6M']]));
      const h = (html) => +/class="bullet-band bullet-zone-0"[^<>]*height="([\d.]+)"/.exec(html)[1];
      assert.ok(h(buildBullet(model, { orientation: 'portrait' })) <= ROW.trackMax + 0.01);
      assert.ok(h(buildBullet(model, {})) <= ROW.trackMax + 0.01);
    });
  });

  describe('buildBullet — per-mark detail and the section entrypoint', () => {
    test('a plain bullet emits no detail payload and no speaker note', () => {
      const html = buildBullet(parseBullet(ul([['A', '4.2M', '5.0M']])), {});
      assert.doesNotMatch(html, /chart-details/);
      assert.doesNotMatch(html, /<!--/);
    });

    test('a detailed row emits an inert template keyed by data-mark, plus the note', () => {
      const html = buildBullet(parseBullet(
        nested('New ARR <code>4.2M</code> <code>5.0M</code>', ['Two enterprise renewals slipped'])
        + '<li>Expansion ARR <code>3.6M</code> <code>3.0M</code></li>',
      ), {});
      assert.match(html, /<template class="chart-detail" data-mark="0">/);
      assert.equal((html.match(/class="chart-detail"/g) || []).length, 1);
      assert.match(html, /<!-- New ARR \(4\.2M\): Two enterprise renewals slipped -->/);
      assert.doesNotMatch(html, /<t(?:ext|span)[^<>]*>Two enterprise renewals/,
        'detail rides the template only — never a painted <text>');
    });

    test('transformSection splices the first list, and passes the html through when there is nothing to draw', () => {
      const html = '<h2>Are we on plan.</h2><ul>' + ul([['A', '4.2M', '5.0M']]) + '</ul>';
      assert.match(transformSection(html, { orientation: 'landscape' }), /bullet-figure/);
      const empty = '<h2>Are we on plan.</h2><ul><li>Just a label</li></ul>';
      assert.equal(transformSection(empty, {}), empty, 'null model leaves the section untouched');
      assert.equal(transformSection('<h2>No list</h2>', {}), '<h2>No list</h2>');
    });
  });

  describe('buildBullet — escaping and the stress case', () => {
    test('author text with &, <, > survives escaped', () => {
      // markdown-it hands the kernel entity-encoded text; the kernel decodes it
      // to plain text and the SVG emitter re-escapes it. A round trip that
      // dropped either half printed the literal `&amp;` on the slide.
      const html = buildBullet(parseBullet(
        ul([['R&amp;D spend &lt;ceiling&gt;', '4.2M', '5.0M']]),
      ), {});
      assert.match(html, /R&amp;D spend &lt;ceiling&gt;/);
      assert.doesNotMatch(html, /R&D spend <ceiling>/);
      assert.doesNotMatch(html, /&amp;amp;/, 'and is not double-escaped');
    });

    test('the manifest stress sample renders without throwing, at every orientation', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(COMPONENT_DIR, 'bullet.manifest.json'), 'utf8'));
      // Turn the sample's markdown list into the <li> HTML the dispatcher hands us.
      const lis = manifest.stressDoc.sample.split('\n')
        .filter((l) => /^\s*- /.test(l))
        .map((l) => {
          const depth = /^\s{2,}- /.test(l) ? 1 : 0;
          const body = l.replace(/^\s*- /, '').replace(/`([^`]*)`/g, '<code>$1</code>');
          return { depth, body };
        });
      let html = '';
      for (const { depth, body } of lis) {
        if (depth === 0) html += `<li>${body}</li>`;
        else html = html.replace(/<\/li>$/, `<ul><li>${body}</li></ul></li>`);
      }
      const model = parseBullet(html);
      assert.ok(model, 'the stress sample parses');
      for (const orientation of ['landscape', 'portrait', 'square']) {
        const out = buildBullet(model, { orientation });
        assert.match(out, /bullet-figure/);
        assert.doesNotMatch(out, /NaN|Infinity|undefined/);
      }
    });

    test('the stress sample sits at the row ceiling the docs state', () => {
      // The ceiling is stated in `dataShapeGuidance`, not in a `capacity` block.
      // `capacity.axis` is what ENROLS a component in splitting (split-facts.js
      // splitFactsFor), and a chart is a `graphic`: it never paginates, it rings
      // the overflow warning. All twenty-one charts declare none, so the number
      // lives where an author reads it instead.
      const manifest = JSON.parse(fs.readFileSync(path.join(COMPONENT_DIR, 'bullet.manifest.json'), 'utf8'));
      assert.equal(manifest.capacity, undefined, 'a chart must not enrol in splitting');
      const rows = manifest.stressDoc.sample.split('\n').filter((l) => /^- /.test(l)).length;
      const guidance = (manifest.dataShapeGuidance || []).join(' ');
      const stated = /seven the ceiling/.test(guidance) ? 7 : null;
      assert.ok(stated, `the row ceiling is not stated in dataShapeGuidance: ${guidance}`);
      assert.equal(rows, stated, 'the stress slide sits at the stated ceiling');
    });
  });

  describe('the CSS mirror — the kernel wraps to what the stylesheets paint', () => {
    // The kernel breaks lines in units of the font size, so a size it does not
    // share with CSS wraps text to a width the glyphs do not occupy.
    const sizeOf = (css, selectorFragment) => {
      const re = new RegExp(`${selectorFragment}[^{]*\\{[^}]*?font-size:\\s*([\\d.]+)px`, 's');
      const m = re.exec(css);
      assert.ok(m, `no font-size found for ${selectorFragment}`);
      return Number(m[1]);
    };

    test('FS.name matches the family category register the name wears', () => {
      assert.equal(FS.name, sizeOf(FAMILY_STYLES, 'chart-frame\\) \\.cart-cat'));
    });

    test('FS.value matches the family value register the readout wears', () => {
      assert.equal(FS.value, sizeOf(FAMILY_STYLES, 'chart-frame\\) \\.cart-value'));
    });

    test('FS.target matches .bullet-plan in this component\'s own stylesheet', () => {
      assert.equal(FS.target, sizeOf(STYLES, '\\.bullet-plan'));
    });

    test('every zone index the kernel can emit has a paint rule', () => {
      // MAX_ZONES caps the count; zone 0 is the base rule, 1..N-1 are overrides.
      const html = buildBullet(parseBullet(nested('KPI <code>50</code> <code>80</code>', [
        'Band <code>20</code>', 'Band <code>40</code>', 'Band <code>60</code>',
      ])), {});
      const emitted = new Set(zones(html).map((z) => z.z));
      assert.ok(emitted.size > 1, 'the explicit form really does emit several zones');
      for (const z of emitted) {
        const rule = z === 0 ? '.bullet-band {' : `.bullet-zone-${z} {`;
        assert.ok(STYLES.includes(rule), `zone ${z} has a paint rule (${rule})`);
      }
    });

    test('the stylesheet stays palette-blind and margin-free', () => {
      assert.doesNotMatch(STYLES, /#[0-9a-fA-F]{3,8}\b/, 'HARD RULE #3 — no hex literal');
      assert.doesNotMatch(STYLES, /^\s*margin(?:-\w+)?:\s*(?!0;)/m, 'HARD RULE #20 — no margin');
      assert.doesNotMatch(STYLES, /@layer/, 'unlayered — a layered rule loses to an unlayered base rule');
    });
  });
});
