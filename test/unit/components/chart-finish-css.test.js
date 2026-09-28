/**
 * The generated chart-finish rules (tools/build-chart-finish-css.js). Pins the properties the
 * generator's header argues for, so a later edit cannot quietly undo one:
 *
 *   - every rule is `section|figure.chart-finish-X :where(…)` — (0,1,1) — so an a11y theme's
 *     texture fill, which is `!important` at (0,3,1) and loads later, always wins;
 *   - the status table agrees with the manifests on which marks carry text;
 *   - a ramp mixes toward its OWN member's empty end, never through a fallback chain;
 *   - no percentage sits inside light-dark(), which takes colors only.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { build, STATUS_MARKS, KEY_FOLLOWS } = require('../../../tools/build-chart-finish-css');
const { loadAll } = require('../../../lib/components');

const OUT = path.join(__dirname, '../../../lib/components/chart/_chart-family/chart-finish.generated.css');
const css = build();

/** Every rule's selector list, one entry per selector. */
const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@supports[^{]*\{/g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)]
  .flatMap((m) => m[1].split(/,\n/).map((s) => s.trim()).filter(Boolean));

describe('chart-finish.generated.css', () => {
  test('the committed file is what the generator writes', () => {
    assert.equal(fs.readFileSync(OUT, 'utf8'), css, 'run `node tools/build-chart-finish-css.js`');
  });

  test('every selector is a finish head over a :where() mark — specificity (0,1,1)', () => {
    assert.ok(selectors.length > 100);
    for (const s of selectors) {
      assert.match(s, /^(section|figure)\.chart-finish-(pigment|etching|tone) :where\(.+\)$/, s);
    }
  });

  test('every declaration is !important — member paint arrives as inline url() fills', () => {
    const decls = [...css.matchAll(/^\s+([a-z-]+):[^;]*;$/gm)].map((m) => m[0]);
    assert.ok(decls.length > 100);
    for (const d of decls) assert.match(d, /!important;$/, d);
  });

  test('light-dark() never carries a bare percentage', () => {
    for (const m of css.matchAll(/light-dark\(([^;]*)\)/g)) {
      // Each argument must be a whole color (a color-mix / oklch / var), never "40%".
      assert.doesNotMatch(m[1], /light-dark\(\s*\d/, m[0]);
      assert.doesNotMatch(m[1], /^\s*\d+(\.\d+)?%/, m[0]);
    }
  });

  test('a ramp mixes toward its own member base, never through a var() fallback chain', () => {
    assert.doesNotMatch(css, /var\(--[a-z-]+,\s*var\(/, 'a token-to-token fallback chain');
    assert.match(css, /\.heatmap-cell[^{]*\{[^}]*var\(--heatmap-base\)/);
    assert.match(css, /\.map-region--on[^{]*\{[^}]*var\(--map-base\)/);
  });

  test('the status table agrees with the manifests on which marks carry text', () => {
    const bears = new Map();
    for (const m of loadAll()) for (const r of m.kernel?.marks || []) bears.set(r.class, r.bears);
    for (const s of STATUS_MARKS) {
      const classes = [...s.sel.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
      for (const c of classes) {
        assert.ok(bears.has(c), `${c} is declared in some manifest's kernel.marks`);
        assert.equal(bears.get(c), s.bears, `${c}: STATUS_MARKS says bears=${s.bears}, the manifest says ${bears.get(c)}`);
      }
    }
  });

  test('every finish reaches every encoding it names', () => {
    for (const f of ['pigment', 'etching', 'tone']) {
      for (const enc of ['hue', 'ramp', 'layered']) {
        assert.match(css, new RegExp(`chart-finish-${f} :where\\(.*data-encodes="${enc}"`), `${f} × ${enc}`);
      }
    }
  });

  // Inversion finding: a tone re-point of the family slot table reached line's stroke-painted
  // series path around `paint: "none"`, washing series 5–8 out to near-white.
  test('the family slot table is never re-pointed — a finish reaches marks, not their readers', () => {
    assert.doesNotMatch(css, /--mark-(hue|body|ink)\s*:/);
  });

  test('a ramp has no fallback magnitude — a missing --mix fails visibly, never as a flat 50%', () => {
    assert.doesNotMatch(css, /var\(--mix,/);
  });

  test('the heatmap value steps are the heatmap\'s own --mix defaults', () => {
    const member = fs.readFileSync(path.join(__dirname, '../../../lib/components/chart/heatmap/heatmap.styles.css'), 'utf8');
    const own = [...member.matchAll(/--heatmap-step(\d),\s*([\d.]+%)\)/g)].map((m) => [m[1], m[2]]);
    assert.equal(own.length, 5);
    for (const [step, pct] of own) assert.ok(css.includes(`var(--heatmap-step${step}, ${pct})`), `step ${step} is ${pct} in heatmap.styles.css`);
  });

  test('the relative-color value ink sits behind @supports, with its fallback outside it', () => {
    const blocks = css.match(/@supports \(color: oklch\(from red l c h\)\) \{[\s\S]*?\n\}\n\}/g) || [];
    assert.equal(blocks.filter((b) => b.includes('.heatmap-value')).length, 15, 'one per step per finish');
    // Every relative color anywhere is behind the guard, the text-bearing marks' ink included.
    for (const b of blocks) assert.match(b, /oklch\(from /);
    const outside = css.replace(/@supports[\s\S]*?\n\}\n\}/g, '');
    assert.doesNotMatch(outside, /oklch\(from/);
    assert.match(outside, /\.heatmap-value\[data-step="1"\]\)[^{]*\{\s*fill: var\(--text-heading\)/);
  });

  test('every status mark\'s member declares the hue and ink the status table reads', () => {
    const cssOf = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    const chart = path.join(__dirname, '../../../lib/components/chart');
    const all = fs.readdirSync(chart).map((d) => path.join(chart, d)).filter((d) => fs.statSync(d).isDirectory()).map(cssOf).join('\n')
      + fs.readFileSync(path.join(__dirname, '../../../lib/components/chart/_chart-family/chart-family.css'), 'utf8');
    for (const s of STATUS_MARKS) {
      for (const v of [s.hue, s.ink]) {
        const name = /var\((--[a-z0-9-]+)\)/.exec(v)[1];
        assert.match(all, new RegExp(`${name}:`), `${s.sel} reads ${name}, which no chart stylesheet declares`);
      }
    }
  });

  test('a key follows the level of the text-bearing mark it keys', () => {
    // The text-level rules are the :is() lists of text-bearing classes. A key swatch rides in
    // the one for its own paint (an HTML key is `bg`, an SVG mark `fill`), beside its mark's peers.
    const textLists = [...css.matchAll(/chart-finish-tone :where\(:is\(([^)]*)\)\[data-hue="1"\]\[data-encodes="hue"\]/g)].map((m) => m[1]);
    for (const [key, mark] of Object.entries(KEY_FOLLOWS)) {
      assert.ok(textLists.some((l) => l.includes(`.${mark}`)), `${mark} has a text-level rule`);
      assert.ok(textLists.some((l) => l.includes(`.${key}`)), `${key} takes the text level of ${mark}`);
    }
  });

  test('a shared key class is scoped to its member, so map\'s ramp rule cannot reach a heatmap key', () => {
    assert.doesNotMatch(css, /:is\([^)]*(?<![\w-] )\.chart-key-swatch[^)]*\)\[data-encodes="ramp"\]/);
    assert.match(css, /\.map-figure \.chart-key-swatch/);
  });

  // Checked on the render: a tonal dot on a line that kept its category hue no longer matched
  // its own series. Tone leaves a stroke member whole.
  test('tone leaves every mark of a stroke member alone, dots and bands included', () => {
    const toneHue = css.match(/section\.chart-finish-tone :where\(:is\(\[data-hue="1"\][^{]*/)[0];
    for (const c of ['line-dot', 'line-band', 'line-area', 'slope-dot']) assert.ok(toneHue.includes(`.${c}`), `${c} is excluded under tone`);
    const pigmentHue = css.match(/section\.chart-finish-pigment :where\(:is\(\[data-hue="1"\][^{]*/)[0];
    assert.ok(!pigmentHue.includes(':not('), 'pigment keeps a dot in its own hue, so it may repaint it');
  });

  test('a container is re-pointed under tone, never repainted, and a status lane keeps its hue', () => {
    assert.match(css, /chart-finish-tone :where\(\.kanban-column:not\(\[data-done\]\)\)[^{]*\{\s*--col-hue:/);
    assert.match(css, /chart-finish-tone :where\(:is\(\.fc-group, \.fc-key-swatch\[data-kind="group"\]\)\[data-slot\]\)/);
    assert.doesNotMatch(css, /\.fc-group[^-][^{]*\{[^}]*\bfill:/, 'no rule paints a group as a mark');
  });

  // The body a finish gives the status mark selected by `sel` (its first paint declaration).
  const statusBody = (finish, sel) => {
    const at = css.indexOf(`section.chart-finish-${finish} :where(${sel})`);
    assert.ok(at >= 0, `a ${finish} rule for ${sel}`);
    return /(?:fill|background): ([^;]*) !important/.exec(css.slice(at, css.indexOf('}', at)))[1];
  };

  // A status key carries no text, but it keys marks that do, so it takes their level: under
  // tone the gantt key sat at the middle step beside bars at the text step.
  test('a status key takes the level of the text-bearing marks it keys', () => {
    for (const finish of ['pigment', 'etching', 'tone']) {
      assert.equal(statusBody(finish, '.gantt-legend-swatch[data-s]'), statusBody(finish, '.gantt-bar[data-s]'), `gantt, ${finish}`);
      assert.equal(
        statusBody(finish, '.state-dot[data-s]:not([data-s="deferred"])'),
        statusBody(finish, '.state-node-shape[data-s]'),
        `state-chart, ${finish}`,
      );
    }
  });

  // The state chart's statuses were outside the table, so a tone deck quieted a gantt's
  // statuses and left a state chart's loud. A deferred HTML tile keeps its hollow background.
  test('a state chart status is in the status table, and a deferred tile stays hollow', () => {
    for (const finish of ['pigment', 'etching', 'tone']) {
      assert.match(statusBody(finish, '.state-node-shape[data-s]'), /var\(--fill-hue\)/);
      assert.match(statusBody(finish, ':is(.state-node, .state-node-row)[data-s]:not([data-s="deferred"])'), /var\(--fill-hue\)/);
    }
    assert.doesNotMatch(css, /:where\((?:\.state-dot|:is\(\.state-node, \.state-node-row\))\[data-s\]\)/, 'no bg rule reaches a deferred tile');
  });
});
