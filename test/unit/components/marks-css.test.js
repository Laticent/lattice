/**
 * The generated marks rules (tools/build-marks-css.js). Pins the properties the
 * generator's header argues for, so a later edit cannot quietly undo one:
 *
 *   - every rule is `section|figure.marks-X :where(…)` — (0,1,1) — so an a11y theme's
 *     texture fill, which is `!important` at (0,3,1) and loads later, always wins;
 *   - the status table agrees with the manifests on which marks carry text;
 *   - a ramp mixes toward its OWN member's empty end, never through a fallback chain;
 *   - no percentage sits inside light-dark(), which takes colors only.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { build, F, STATUS_MARKS, KEY_FOLLOWS } = require('../../../tools/build-marks-css');
const { loadAll } = require('../../../lib/components');

const OUT = path.join(__dirname, '../../../lib/components/chart/_chart-family/marks.generated.css');
const css = build();

/** Every rule's selector list, one entry per selector. */
const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@supports[^{]*\{/g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)]
  .flatMap((m) => m[1].split(/,\n/).map((s) => s.trim()).filter(Boolean));

describe('marks.generated.css', () => {
  test('the committed file is what the generator writes', () => {
    assert.equal(fs.readFileSync(OUT, 'utf8'), css, 'run `node tools/build-marks-css.js`');
  });

  test('every selector is a finish head over a :where() mark — specificity (0,1,1)', () => {
    assert.ok(selectors.length > 100);
    for (const s of selectors) {
      assert.match(s, /^(section|figure)\.marks-(pigment|etch|tone) :where\(.+\)$/, s);
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

  test('pigment paints every mark with its solid, and text on a solid is --chart-on-mark; etch and tone use --text-heading', () => {
    // chart-solids.test.js holds --chart-on-mark at 7:1 on every solid; chart-contrast.test.js holds --text-heading
    // on the family's -fill tier, which etch's and tone's text tiers are paler than. No text ink is ever picked per
    // body: that read as mud and changed the text color from chart to chart (engineering/chart-styling.md §3).
    for (let n = 1; n <= 8; n++) {
      const re = (finish, bg, ink) => new RegExp(`marks-${finish} :where\\(:is\\([^{]*\\):is\\(\\[data-hue="${n}"\\], \\[data-key-hue="${n}"\\]\\)\\[data-encodes="hue"\\]\\[data-paint="bg"\\]\\)[^{]*\\{[^}]*background: ${bg}[^}]*color: ${ink}`);
      assert.match(css, re('pigment', `var\\(--chart-cat-${n}-hue\\)`, 'var\\(--chart-on-mark\\)'), `pigment slot ${n}`);
      assert.match(css, re('etch', '[^;]*', 'var\\(--text-heading\\)'), `etch slot ${n}`);
    }
    const picked = css.split('\n}').filter((b) => /(?:^|\s)(?:color|fill|--tower-ink|--state-node-ink|--state-index-ink):\s*(?:light-dark\()?color\(from/.test(b));
    for (const b of picked) assert.match(b, /heatmap-value|hub-spoke-icon|lat-pill/, b.slice(0, 160));
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
    for (const f of ['pigment', 'etch', 'tone']) {
      for (const enc of ['hue', 'ramp', 'layered']) {
        assert.match(css, new RegExp(`marks-${f} :where\\(.*data-encodes="${enc}"`), `${f} × ${enc}`);
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

  // TEXT WAITS. No fixed ink clears every theme once a finish moves the ground under the text:
  // measured in WebKit with relative color removed, --text-body read 3.54:1 on concrete's status
  // pill and --text-heading 3.34:1 on an a11y heatmap step. So a mark that carries text (and a
  // key that follows one) moves only where the engine can pick its ink, and keeps the shipped
  // paint and ink elsewhere; a mark with no text moves everywhere.
  test('a mark that carries text moves only behind @supports; every other mark moves everywhere', () => {
    const blocks = css.match(/@supports[^{]*\{[\s\S]*?\n\}\n\}/g) || [];
    // The guard tests the ink's own expression, channel math included, so an engine that parsed
    // relative color but not a clamp on a channel cannot pass it and then drop the ink.
    for (const b of blocks) assert.ok(b.startsWith('@supports (color: color(from red xyz-d65 calc(0.95047 * clamp(0, (0.1791 - y) * 1000000, 1))'), b.slice(0, 100));
    assert.equal(blocks.filter((b) => b.includes('.heatmap-value')).length, 10, 'one per step for etch and tone; pigment is the member\'s own span and emits none');
    const outside = css.replace(/@supports[\s\S]*?\n\}\n\}/g, '');
    assert.doesNotMatch(outside, /(?:oklch|color)\(from/, 'every relative color is behind the guard');
    // Read each selector with its `:not(...)` exclusions removed: the plain rule NAMES the
    // text-bearing classes there precisely to skip them. Checker finding: a list that left out
    // the heatmap cells and the SVG-fill text marks could not catch either one moving.
    const reached = outside.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
    for (const cls of [
      '.heatmap-value', '.heatmap-cell', '.fc-shape', '.fc-node', '.radar-sector', '.quadrant-bubble', '.cell-filled',
      '.gantt-bar[data-s]', '.chart-status[data-s]', '.state-node-shape[data-s]', '.gantt-legend-swatch[data-s]',
      '.roadmap', '.quadrant-tint', '.kanban-column', '.fc-group', '--cell-ink',
    ]) {
      assert.ok(!reached.includes(cls), `${cls} is reached only behind @supports`);
    }
    // The ONE fixed ink outside the guard is the radar's scale tick, and it is outside on purpose: the
    // layered polygons it sits on are finished on EVERY engine (they carry no text), so the tick must
    // take the strongest ink on every engine too. It does not depend on relative color.
    const withoutTicks = outside.replace(/[^}]*\.radar-tick[^}]*\}/g, '');
    assert.doesNotMatch(withoutTicks, /var\(--text-(body|heading)\)/, 'no fixed-ink fallback is left');
    assert.match(outside, /\.radar-tick[^}]*fill: var\(--text-heading\)/, 'the radar tick takes the heading ink under every finish');
    // The plain categorical rule skips the text-bearing marks, or they would take its full body.
    assert.match(outside, /marks-pigment :where\(:is\(\[data-hue="1"\], \[data-key-hue="1"\]\)\[data-encodes="hue"\]\[data-paint="bg"\]:not\([^)]*\.cell-filled/);
    // A mark with no text still moves on every engine.
    assert.match(outside, /\.gantt-milestone\[data-s\]/);
    assert.match(outside, /\.waterfall-bar\[data-s="up"\]/);
  });

  test('every status mark\'s member declares the hue and ink the status table reads', () => {
    const cssOf = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    const chart = path.join(__dirname, '../../../lib/components/chart');
    const all = fs.readdirSync(chart).map((d) => path.join(chart, d)).filter((d) => fs.statSync(d).isDirectory()).map(cssOf).join('\n')
      + fs.readFileSync(path.join(__dirname, '../../../lib/plugins/chart-family/chart-family.styles.css'), 'utf8');
    for (const s of STATUS_MARKS) {
      for (const v of [s.hue, s.ink]) {
        const name = /var\((--[a-z0-9-]+)\)/.exec(v)[1];
        assert.match(all, new RegExp(`${name}:`), `${s.sel} reads ${name}, which no chart stylesheet declares`);
      }
    }
  });

  // A finish OWNS the body. Under it an unstated gantt bar, milestone or key chip, a progress bar and a
  // state tile would otherwise keep the member's own gradient beside flat, stated siblings: two looks in
  // one chart (tools/chart-finish-reach.mjs, KEPT). Each is the neutral channel its member declares.
  test('an unstated mark wears the finish: the status table carries a companion for every stated one', () => {
    const unstated = ['.gantt-bar:not([data-s])', '.gantt-milestone:not([data-s])', '.gantt-legend-swatch:not([data-s])',
      '.progress-fill:not([data-s])', ':is(.state-node, .state-node-row):not([data-s])'];
    for (const finish of ['pigment', 'etch', 'tone']) {
      for (const sel of unstated) assert.match(statusBody(finish, sel), /var\(--fill-hue\)/, `${finish} reaches ${sel}`);
    }
    // The state chart's KEY has no unstated row: its only status-less swatches are SVG edge-style
    // lines, and a `bg` rule would paint a box behind a line.
    assert.ok(!STATUS_MARKS.some((m) => m.sel.includes('.fc-key-swatch') && m.sel.endsWith(':not([data-s])')));
    // The channel each companion reads is declared by the member, not borrowed from a theme token.
    const gantt = fs.readFileSync(path.join(__dirname, '../../../lib/components/chart/gantt/gantt.styles.css'), 'utf8');
    assert.match(gantt, /--fill-hue: var\(--state-mute-hue\)/);
  });

  test('a progress fill is not a text-bearing mark: its readout sits on the slide past its end, so pigment gives it a full body', () => {
    const rows = STATUS_MARKS.filter((m) => m.sel.startsWith('.progress-fill'));
    assert.equal(rows.length, 2, 'stated and unstated');
    for (const r of rows) assert.equal(r.bears, false, r.sel);
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../lib/components/chart/progress/progress.manifest.json'), 'utf8'));
    assert.equal(manifest.kernel.marks.find((m) => m.class === 'progress-fill').bears, false, 'the manifest agrees with the status table');
    // At bears:true pigment took the 40%/46% text level, which in dark mode is near-black on the slide.
    // Pigment paints every body with its concept's SOLID at full strength: the member's hue channel itself.
    assert.equal(statusBody('pigment', '.progress-fill[data-s]'), 'var(--fill-hue)', 'pigment\'s body is the solid');
  });

  test('the ink switches on luminance: black above Y 0.1791, white below, in the generated guard and rules', () => {
    // OKLCH lightness is not luminance for a saturated hue: a red at L 0.571 took black at 4.31:1 where
    // white gives 4.87:1, and the 999-slope blend zone returned a mid-grey of about the cell's own
    // lightness (1.003:1 on rgb(210 40 70)). Measured over a 52-per-channel sRGB grid, the luminance
    // switch is never worse than 4.58:1 (the measurement is recorded beside `inkOn` in the generator).
    assert.doesNotMatch(css, /oklch\(from/, 'no OKLCH-lightness ink is left');
    assert.match(css, /color\(from [^)]*xyz-d65 calc\(0\.95047 \* clamp\(0, \(0\.1791 - y\) \* 1000000, 1\)\)/);
  });

  // Pigment is the DEFAULT and carries a ramp's own span, so it changes nothing about a heatmap: no cell
  // rule, and no value-ink rule that would replace the ink a theme solved for that cell.
  test('pigment leaves a heatmap exactly as shipped: no cell rule and no value-ink rule', () => {
    assert.doesNotMatch(css, /marks-pigment :where\([^)]*heatmap-cell[^)]*\)/, 'no pigment rule for a heatmap cell');
    assert.doesNotMatch(css, /marks-pigment :where\(\.heatmap-value/, 'no pigment rule for a heatmap value');
    assert.match(css, /marks-etch :where\(\.heatmap-value\[data-step="1"\]\)/, 'etch still moves them');
    assert.match(css, /marks-tone :where\(\.heatmap-value\[data-step="1"\]\)/, 'tone still moves them');
  });

  test('a key follows the level of the text-bearing mark it keys', () => {
    // The text-level rules are the :is() lists of text-bearing classes. A key swatch rides in
    // the one for its own paint (an HTML key is `bg`, an SVG mark `fill`), beside its mark's peers.
    const textLists = [...css.matchAll(/marks-tone :where\(:is\(([^{]*?)\):is\(\[data-hue="1"\], \[data-key-hue="1"\]\)\[data-encodes="hue"\]/g)].map((m) => m[1]);
    for (const [key, mark] of Object.entries(KEY_FOLLOWS)) {
      assert.ok(textLists.some((l) => l.includes(`.${mark}`)), `${mark} has a text-level rule`);
      assert.ok(textLists.some((l) => l.includes(`.${key}`)), `${key} takes the text level of ${mark}`);
    }
    // The family's shared key follows its member only where every hue body it keys carries text: the tower's
    // shares do, a radar's or a quadrant's dots do not.
    assert.ok(textLists.some((l) => l.includes('.tower-figure .chart-key-swatch')), 'the tower key takes its shares\' tier');
    assert.ok(!textLists.some((l) => /\.(?:radar|quadrant)-figure \.chart-key-swatch/.test(l)), 'a key that also keys solid dots stays solid');
  });

  test('a shared key class is scoped to its member, so map\'s ramp rule cannot reach a heatmap key', () => {
    assert.doesNotMatch(css, /:is\([^)]*(?<![\w-] )\.chart-key-swatch[^)]*\)\[data-encodes="ramp"\]/);
    assert.match(css, /\.map-figure \.chart-key-swatch/);
  });

  // Tone's one hue is for BODIES; an edge and a name keep their category ink (tone-is-the-third-finish.md). A series
  // stroke is all edge, so tone leaves line, ep-curve and slope whole, their dots and bands too (a tonal dot on a
  // line that kept its hue no longer matches its series), and their names and the word cloud keep their inks.
  // #2887 once stepped the strokes and names into the one ink: the names collapsed from three colors to one.
  test('tone leaves a series stroke, its dots and its name in the category ink; etch draws the line heavier', () => {
    const toneHue = css.match(/section\.marks-tone :where\(:is\(\[data-hue="1"\][^{]*/)[0];
    for (const c of ['slope-dot', 'line-dot', 'line-band', 'line-area', 'ep-dot']) assert.ok(toneHue.includes(`.${c}`), `${c} is excluded from tone's body rule`);
    // A selector's `:not(...)` NAMES the classes it skips, so read each tone selector with those removed.
    const dropNots = (sel) => { let out = ''; for (let i = 0; i < sel.length; i++) {
      if (sel.startsWith(':not(', i)) { let d = 0; for (i += 4; i < sel.length; i++) { if (sel[i] === '(') d++; else if (sel[i] === ')' && --d === 0) break; } continue; }
      out += sel[i]; } return out; };
    const toneSelectors = css.split('\n}').map((blk) => blk.split('{').slice(-2, -1)[0] || '').filter((sel) => /marks-tone /.test(sel)).map(dropNots);
    for (const c of ['line-path', 'ep-path', 'line-dot', 'ep-dot', 'line-area', 'cart-series', 'wc-word']) {
      assert.ok(!toneSelectors.some((sel) => new RegExp(`\\.${c}\\b`).test(sel)), `no tone rule repaints .${c}`);
    }
    assert.match(css, /marks-etch :where\(:is\(\.line-path, \.ep-path\)\)[^}]*stroke-width: 2\.6/, 'etch draws the series line heavier');
    const pigmentHue = css.match(/section\.marks-pigment :where\(:is\(\[data-hue="1"\][^{]*/)[0];
    for (const c of ['line-dot', 'line-band', 'line-area', 'slope-dot']) {
      assert.ok(!pigmentHue.includes(`.${c}`), `pigment keeps ${c} in its own hue, so it may repaint it`);
    }
  });

  // "Nothing else rings" reads only if an exception's ring is the HEAVIER line. The ring replaces the mark's edge,
  // so wherever a finish widens a status mark's edge (etch 2-3x, tone 2.5x on a text-bearing mark) the ring widens
  // by the same factor. Fixed at 1.3 hairlines it sat under those edges, and a done bar outlined louder than an
  // at-risk one (#2887; measured on the render, before and after, in tools/ and the PR body).
  test('a status mark\'s signal ring is 1.3x its finished edge, in every finish', () => {
    // Each rule's own selector list, read exactly: a block whose FIRST selector is this finish over this mark.
    const rules = [...css.matchAll(/(?:^|\n)([^{}@\n][^{}]*)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
    const ruleFor = (name, mark) => rules.filter((r) => r.sel.startsWith(`section.marks-${name} :where(${mark}),`));
    for (const [name, f] of Object.entries(F)) {
      for (const s of STATUS_MARKS) {
        const k = s.bears ? f.edgeBackdrop : f.edge;
        const own = ruleFor(name, s.sel).filter((r) => /(?:box-shadow|stroke-width):/.test(r.body));
        assert.equal(own.length, 1, `${name} paints ${s.sel} once`);
        const scaled = k !== 1 && s.paint === 'bg';
        if (scaled) assert.match(own[0].body, new RegExp(`--chart-ring: calc\\(var\\(--state-signal-w\\) \\* ${k}\\) !important`), `${name} ${s.sel}: ring scales with its ${k}x edge`);
        else assert.doesNotMatch(own[0].body, /--chart-ring:/, `${name} ${s.sel}: no ring width where nothing reads it`);
      }
      // A gantt bar's ring is its own SVG element, set by name, behind the same guard as the bar's wider edge.
      const svgRing = ruleFor(name, '.chart-signal-ring');
      if (f.edgeBackdrop === 1) assert.equal(svgRing.length, 0, `${name}: the shared ring`);
      else {
        assert.match(svgRing[0]?.body || '', new RegExp(`--chart-ring: calc\\(var\\(--state-signal-w\\) \\* ${f.edgeBackdrop}\\)`), `${name}: the SVG ring follows its bar`);
        assert.match(css, new RegExp(`@supports[^{]*\\{\\s*section\\.marks-${name} :where\\(\\.chart-signal-ring\\)`), `${name}: the SVG ring waits behind the guard`);
      }
    }
    // Etch draws each risk cell's edge in its band's ink at its 2x edge, so the critical ring follows it.
    const risk = ruleFor('etch', ':is(.risk-band-ring, .risk-key-marker[data-band="critical"])');
    assert.match(risk[0]?.body || '', new RegExp(`--chart-ring: calc\\(var\\(--state-signal-w\\) \\* ${F.etch.edge}\\)`), 'etch: the critical band ring scales with the cell edge');
  });

  test('a container is re-pointed under tone, never repainted, and a status lane keeps its hue', () => {
    assert.match(css, /marks-tone :where\(\.kanban-column:not\(\[data-done\]\)\)[^{]*\{\s*--col-hue:/);
    assert.match(css, /marks-tone :where\(:is\(\.fc-group, \.fc-key-swatch\[data-kind="group"\]\)\[data-slot\]\)/);
    assert.doesNotMatch(css, /\.fc-group[^-][^{]*\{[^}]*\bfill:/, 'no rule paints a group as a mark');
  });

  // A roadmap's phase color (column, lane, horizon card) is a container color that its pill,
  // stripe and card rule all read. Under tone it joins the one hue, scoped to the roadmap so no
  // other table on the slide moves, and the pill picks its ink from its new ground: its shipped
  // `--cat-on-mark` read 1.54:1 on the one hue on the a11y themes' dark faces.
  test('a roadmap phase is re-pointed under tone, and its pill picks its own ink', () => {
    const head = 'section.marks-tone :where(:is(.roadmap thead th:not(:first-child), .roadmap td:first-child, .roadmap .horizon-card))';
    const at = css.indexOf(head);
    assert.ok(at >= 0, 'a tone rule for the roadmap phase containers');
    const body = css.slice(at, css.indexOf('}', at));
    assert.match(body, /--phase-accent: var\(--chart-cat-1-hue\)/);
    assert.match(body, /--phase-ink: var\(--chart-cat-1-ink\)/);
    assert.doesNotMatch(css, /marks-etch :where\([^)]*\.roadmap/, 'etch leaves a roadmap alone');
    // Pigment reaches ONE roadmap surface: the workstream row header goes to the neutral ground (REGIONS), and
    // nothing else of the roadmap moves under it.
    const pigmentRoadmap = [...css.matchAll(/section\.marks-pigment :where\(([^)]*\.roadmap[^)]*)\)[^{]*\{([^}]*)\}/g)];
    assert.deepEqual(pigmentRoadmap.map((m) => [m[1].trim(), m[2].trim()]), [['.roadmap td:first-child', 'background: var(--bg-alt) !important;']]);
    // The re-point and the pill's ink share one @supports block: without relative color the
    // pill could not pick its ink, so the roadmap keeps its shipped phases there.
    // Checker finding: `lastIndexOf('@supports')` alone always finds SOME earlier block, so the
    // re-point must sit between that block's opening and its closing, with no close in between.
    const open = css.lastIndexOf('@supports', at);
    assert.ok(open >= 0 && !css.slice(open, at).includes('\n}\n}'), 'the re-point sits inside @supports');
    const block = css.slice(open, css.indexOf('\n}\n}', at));
    assert.match(block, /:where\(:is\(\.roadmap \.horizon-head > \.lat-pill[^{]*\{\s*--lat-pill-ink: color\(from var\(--chart-cat-1-hue\)/);
  });

  // The body a finish gives the status mark selected by `sel` (its first paint declaration).
  const statusBody = (finish, sel) => {
    const at = css.indexOf(`section.marks-${finish} :where(${sel})`);
    assert.ok(at >= 0, `a ${finish} rule for ${sel}`);
    return /(?:fill|background): ([^;]*) !important/.exec(css.slice(at, css.indexOf('}', at)))[1];
  };

  // The finish paints the state chart's key swatch from `--fill-hue`, so the state chart's status
  // table must set it there too. Without it the rule resolved to nothing and, under tone, the key
  // went hollow beside filled tiles (seen on a rendered page; the CSS rule itself was present).
  test('the state chart sets its status hue on the key swatch a finish repaints', () => {
    const sc = fs.readFileSync(path.join(__dirname, '../../../lib/components/chart/state-chart/state-chart.styles.css'), 'utf8');
    for (const s of ['on-track', 'at-risk', 'blocked', 'live', 'deferred']) {
      assert.match(sc, new RegExp(`section\\.state-chart :is\\([^)]*\\.fc-key-swatch\\)[^{]*data-s="${s}"`), s);
    }
  });

  // A status key carries no text, but it keys marks that do, so it takes their level: under
  // tone the gantt key sat at the middle step beside bars at the text step.
  test('a status key takes the level of the text-bearing marks it keys', () => {
    for (const finish of ['pigment', 'etch', 'tone']) {
      assert.equal(statusBody(finish, '.gantt-legend-swatch[data-s]'), statusBody(finish, '.gantt-bar[data-s]'), `gantt, ${finish}`);
      assert.equal(
        statusBody(finish, '[data-chart="state-chart"] .fc-key-swatch[data-s]:not([data-s="deferred"])'),
        statusBody(finish, '.state-node-shape[data-s]'),
        `state-chart, ${finish}`,
      );
    }
  });

  // The state chart's statuses were outside the table, so a tone deck quieted a gantt's
  // statuses and left a state chart's loud. A deferred HTML tile keeps its hollow background.
  test('a state chart status is in the status table, and a deferred tile stays hollow', () => {
    for (const finish of ['pigment', 'etch', 'tone']) {
      assert.match(statusBody(finish, '.state-node-shape[data-s]'), /var\(--fill-hue\)/);
      assert.match(statusBody(finish, ':is(.state-node, .state-node-row)[data-s]:not([data-s="deferred"])'), /var\(--fill-hue\)/);
    }
    assert.doesNotMatch(css, /:where\(:is\(\.state-node, \.state-node-row\)\[data-s\]\)/, 'no bg rule reaches a deferred tile');
    // The key's row skips a deferred swatch too: it keeps the hollow look of the tile it keys.
    const key = STATUS_MARKS.find((m) => m.sel.includes('.fc-key-swatch') && m.sel.includes('[data-s="deferred"]'));
    assert.match(key.sel, /:not\(\[data-s="deferred"\]\)$/);
  });

  // The rebase checker's finding: the row was scoped to `[data-sc-model]`, which only the
  // default variant's figure carries. The `inline` variant writes its key AFTER its figure, so
  // a finish repainted its rows and left its key at the plain status paint. The row now keys on
  // the key's own `data-chart`, which both variants write.
  test('the state chart key row reaches the key of both variants', () => {
    const { transformSection } = require('../../../lib/components/chart/state-chart/state-chart.transform');
    const inner = '<h2>T</h2><ul><li>A <code>AT-RISK</code><ul><li>-&gt; B</li></ul></li><li>B</li></ul>';
    // One row per chart that uses the shared graph key, scoped by the key's `data-chart`, because each chart names its
    // status hue in its own channel (`--fill-*` on the state chart, `--fc-*` on the flowchart).
    const rows = STATUS_MARKS.filter((m) => m.sel.includes('.fc-key-swatch'));
    assert.deepEqual(rows.map((m) => /^\[data-chart="([a-z-]+)"\] /.exec(m.sel)?.[1]).sort(), ['flowchart', 'state-chart']);
    for (const variant of [[], ['inline']]) {
      const html = transformSection(inner, { classTokens: ['state-chart', ...variant] });
      assert.match(html, /<ol class="fc-key" data-chart="state-chart">.*class="fc-key-swatch"[^>]*data-s="at-risk"/, variant.join() || 'default');
    }
  });
});
