/**
 * The generated marks rules (tools/build-marks-css.js). Pins the properties the
 * generator's header argues for, so a later edit cannot quietly undo one:
 *
 *   - a finish is a block of `--finish-*` values on the section, and every other rule reads them: the three blocks set
 *     the same names, and no member stylesheet names a finish;
 *   - every rule is `section|figure.marks-X :where(…)` (X one finish, or an `:is()` of several) — (0,1,1) — so an a11y
 *     theme's texture fill, which is `!important` at (0,3,1) and loads later, always wins;
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

/** Every rule of the sheet, comments stripped: its selector list and its body, with @supports wrappers flattened. */
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@supports[^{]*\{/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ sel: m[1].trim(), body: m[2] }));
const FINISHES = ['pigment', 'etch', 'tone'];
/** The rules that paint `finish`: its own head, or an `:is()` head that names it. */
const serving = (finish) => rules.filter((r) => r.sel.startsWith('section') && new RegExp(`marks-${finish}\\b`).test(r.sel.split(' :where(')[0]));
/** The rules whose head is exactly `finishes` (one finish alone, or the named set). */
const headed = (...finishes) => rules.filter((r) => r.sel.startsWith(finishes.length === 1 ? `section.marks-${finishes[0]} :where(` : `section:is(${finishes.map((f) => `.marks-${f}`).join(', ')}) :where(`));
/** The `--finish-*` values one finish sets on its section. */
const tokens = (finish) => {
  const blk = rules.find((r) => r.sel === `section.marks-${finish},\nfigure.marks-${finish},\n:is(section, figure).marks-${finish} .chart-frame`);
  assert.ok(blk, `a token block for ${finish}`);
  return Object.fromEntries([...blk.body.matchAll(/^\s*(--finish-[a-z0-9-]+):\s*(.*);$/gm)].map((m) => [m[1], m[2]]));
};

describe('marks.generated.css', () => {
  test('the committed file is what the generator writes', () => {
    assert.equal(fs.readFileSync(OUT, 'utf8'), css, 'run `node tools/build-marks-css.js`');
  });

  test('every selector is a finish head over a :where() mark — specificity (0,1,1)', () => {
    assert.ok(selectors.length > 100);
    // The head is one finish, or an :is() of several: :is() takes its most specific argument, a class, so (0,1,1) holds.
    const head = '(?:\\.marks-(?:pigment|etch|tone)|:is\\(\\.marks-(?:pigment|etch|tone)(?:, \\.marks-(?:pigment|etch|tone))*\\))';
    const tokenHeads = [];
    for (const s of selectors) {
      if (/^(section|figure)\.marks-(pigment|etch|tone)$|^:is\(section, figure\)\.marks-(pigment|etch|tone) \.chart-frame$/.test(s)) { tokenHeads.push(s); continue; }
      assert.match(s, new RegExp(`^(section|figure)${head} :where\\(.+\\)$`), s);
    }
    assert.equal(tokenHeads.length, 9, 'one token block per finish: the slide, the re-hosted figure, and the chart frame inside a pane');
  });

  test('every painting declaration is !important — member paint arrives as inline url() fills — and every token is plain', () => {
    const decls = [...css.matchAll(/^\s+([a-z-]+):[^;]*;$/gm)].map((m) => ({ text: m[0], prop: m[1] }));
    assert.ok(decls.length > 100);
    for (const d of decls) {
      // A --finish-* value is read, never painted, so it stays plain: `!important` there would stop a deck re-pointing it.
      if (d.prop.startsWith('--finish-')) assert.doesNotMatch(d.text, /!important/, d.text);
      else assert.match(d.text, /!important;$/, d.text);
    }
  });

  // A finish is a block of VALUES, the way `dark` is. If one block forgot a name the shared rules would read an unset
  // variable, which computes to an invalid paint (a black fill) rather than a missing one.
  test('the three finishes set the same --finish-* values, and every value a rule reads is one of them', () => {
    const [a, b, c] = FINISHES.map((f) => Object.keys(tokens(f)));
    assert.ok(a.length > 60);
    assert.deepEqual(b, a, 'etch sets what pigment sets');
    assert.deepEqual(c, a, 'tone sets what pigment sets');
    const read = new Set([...css.matchAll(/var\((--finish-[a-z0-9-]+)/g)].map((m) => m[1]));
    const slotMarks = new Set([...css.matchAll(/^\s+(--finish-mark-[a-z-]+):/gm)].map((m) => m[1]));
    for (const name of read) assert.ok(a.includes(name) || slotMarks.has(name), `${name} is read and never set`);
  });

  // "No member restyles itself per finish": a stylesheet that names a finish class is a per-finish rule written by hand,
  // and it drifts from the other two. What differs between finishes is a value (`--finish-border`) or a rule in the
  // generator, which is the only file that may name one.
  test('no member or plugin stylesheet names a finish class', () => {
    const roots = [path.join(__dirname, '../../../lib/components'), path.join(__dirname, '../../../lib/plugins')];
    const hits = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.css') && e.name !== 'marks.generated.css' && /\.marks-(pigment|etch|tone)\b/.test(fs.readFileSync(full, 'utf8'))) hits.push(path.relative(path.join(__dirname, '../../..'), full));
      }
    };
    for (const r of roots) walk(r);
    assert.deepEqual(hits, [], 'move the rule into tools/build-marks-css.js, or make the difference a --finish-* value');
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
    const t = Object.fromEntries(FINISHES.map((f) => [f, tokens(f)]));
    assert.equal(t.pigment['--finish-ink'], 'var(--chart-on-mark)');
    assert.equal(t.etch['--finish-ink'], 'var(--text-heading)');
    assert.equal(t.tone['--finish-ink'], 'var(--text-heading)');
    for (let n = 1; n <= 8; n++) {
      // Pigment's body, with text on it or not, is the category's curated solid at full strength.
      assert.equal(t.pigment[`--finish-hue-${n}`], `var(--chart-cat-${n}-hue)`, `pigment slot ${n} hue`);
      for (const k of ['body', 'body-d', 'text', 'text-d']) assert.equal(t.pigment[`--finish-${k}-${n}`], '100%', `pigment slot ${n} ${k}`);
      // The slot's edge is the category's own ink under every finish, tone included.
      const slot = rules.find((r) => r.sel.startsWith(`section:is(.marks-pigment, .marks-etch, .marks-tone) :where(:is([data-hue="${n}"], [data-key-hue="${n}"]))`));
      assert.match(slot.body, new RegExp(`--finish-mark-edge: var\\(--chart-cat-${n}-ink\\)`), `slot ${n} edge`);
    }
    // A text-bearing HTML mark takes the finish's one ink for its text, never one picked per body.
    const text = rules.filter((r) => r.body.includes('light-dark(var(--finish-mark-text-l), var(--finish-mark-text-d))') && r.body.includes('background:'));
    assert.equal(text.length, 1);
    assert.match(text[0].body, /color: var\(--finish-ink\) !important/);
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

  // The HTML player's dual-mode pass (lib/export/player-core.mjs `themeDualMode`) hoists a light-dark() in a CUSTOM property
  // to :root, where a mark's own value beats it, so dark mode kept the light level (red-team finding, etch dark 30% not 40%).
  // A light-dark() in a real property is scoped to its own rule and survives. So the slot sets plain colors and the paint
  // property carries the light-dark().
  test('no custom property carries a light-dark() that a mark itself declares', () => {
    for (const r of rules) {
      if (!/\[data-(key-)?hue=/.test(r.sel) || /data-paint=/.test(r.sel)) continue;
      // `--hs-icon-ink` (and the other picked inks) carried a light-dark() before this change too: recorded in followups.d/2887-p3-picked-inks-stay-light-in-player-dark.md.
      for (const m of r.body.matchAll(/^\s*(--(?!hs-icon-ink)[a-z-]+):\s*(.*);$/gm)) assert.doesNotMatch(m[2], /light-dark\(/, `${m[1]} on ${r.sel.slice(0, 60)}`);
    }
  });

  test('every finish reaches every encoding it names', () => {
    for (const f of ['pigment', 'etch', 'tone']) {
      for (const enc of ['hue', 'ramp', 'layered']) {
        assert.ok(serving(f).some((r) => r.sel.includes(`data-encodes="${enc}"`)), `${f} × ${enc}`);
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
    assert.equal(blocks.filter((b) => b.includes('.heatmap-value')).length, 5, 'one per step, shared by etch and tone; pigment is the member\'s own span and emits none');
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
      // Word-bounded: `.quadrant-bubble` is the mark, `.quadrant-bubble-value` the ink printed on it, which pigment sets everywhere.
      assert.ok(!new RegExp(`${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(reached), `${cls} is reached only behind @supports`);
    }
    // The ONE fixed ink outside the guard is the radar's scale tick, and it is outside on purpose: the
    // layered polygons it sits on are finished on EVERY engine (they carry no text), so the tick must
    // take the strongest ink on every engine too. It does not depend on relative color.
    // The other is tone's hub-spoke HUB, a disc body (not text on a body) that goes back to the full heading ink beside group discs.
    // The finish's text ink is a VALUE in its token block, which paints nothing; what matters is that no rule outside the guard reads it.
    assert.doesNotMatch(outside, /var\(--finish-ink\)/, 'every rule that reads the finish\'s text ink waits behind the guard');
    const withoutTicks = outside.replace(/--finish-ink:[^;]*;/g, '').replace(/[^}]*\.radar-tick[^}]*\}/g, '').replace(/[^}]*\.hub-spoke-hub[^}]*\}/g, '');
    assert.doesNotMatch(withoutTicks, /var\(--text-(body|heading)\)/, 'no fixed-ink fallback is left');
    assert.match(outside, /\.radar-tick[^}]*fill: var\(--text-heading\)/, 'the radar tick takes the heading ink under every finish');
    // The plain categorical rule skips the text-bearing marks, or they would take its full body.
    assert.match(outside, /:where\(:is\(\[data-hue="1"\], \[data-key-hue="1"\],[^{]*\)\[data-encodes="hue"\]\[data-paint="bg"\]:not\([^)]*\.cell-filled/);
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
    // Pigment paints every body with its concept's SOLID at full strength: the member's hue channel itself, at the
    // finish's plain level (100%), never the text level.
    const body = statusBody('pigment', '.progress-fill[data-s]');
    assert.match(body, /var\(--fill-hue\) var\(--finish-status\)/, 'the plain level');
    assert.doesNotMatch(body, /finish-status-text/, 'not the text level');
    assert.equal(tokens('pigment')['--finish-status'], '100%');
    assert.equal(tokens('pigment')['--finish-status-d'], '100%');
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
    const pigment = serving('pigment');
    assert.ok(!pigment.some((r) => /heatmap-cell/.test(r.sel)), 'no pigment rule for a heatmap cell');
    assert.ok(!pigment.some((r) => /heatmap-value/.test(r.sel)), 'no pigment rule for a heatmap value');
    for (const f of ['etch', 'tone']) {
      assert.ok(serving(f).some((r) => /\.heatmap-value\[data-step="1"\]/.test(r.sel)), `${f} still moves the values`);
      assert.ok(serving(f).some((r) => /\.heatmap-cell/.test(r.sel)), `${f} still moves the cells`);
    }
  });

  test('a key follows the level of the text-bearing mark it keys', () => {
    // The text-level rules are the :is() lists of text-bearing classes. A key swatch rides in
    // the one for its own paint (an HTML key is `bg`, an SVG mark `fill`), beside its mark's peers.
    const textLists = rules.filter((r) => r.body.includes('light-dark(var(--finish-mark-text-l), var(--finish-mark-text-d))')).map((r) => /:where\(:is\((.*?)\):is\(\[data-hue="1"\]/s.exec(r.sel)?.[1]).filter(Boolean);
    assert.equal(textLists.length, 2, 'one list per paint');
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
    // A selector's `:not(...)` NAMES the classes it skips, so read each tone selector with those removed.
    const dropNots = (sel) => { let out = ''; for (let i = 0; i < sel.length; i++) {
      if (sel.startsWith(':not(', i)) { let d = 0; for (i += 4; i < sel.length; i++) { if (sel[i] === '(') d++; else if (sel[i] === ')' && --d === 0) break; } continue; }
      out += sel[i]; } return out; };
    const bodyRules = (list) => list.filter((r) => /data-encodes="hue"/.test(r.sel) && /data-paint="fill"/.test(r.sel) && r.body.includes('light-dark(var(--finish-mark-body-l), var(--finish-mark-body-d))'));
    // The shared body rule skips the stroke members by name, for every finish it serves...
    const shared = bodyRules(headed('pigment', 'etch', 'tone'));
    assert.equal(shared.length, 1, 'one shared body rule for an SVG fill');
    for (const c of ['slope-dot', 'line-dot', 'line-band', 'line-area', 'ep-dot']) assert.ok(shared[0].sel.includes(`.${c}`), `${c} is excluded from the shared body rule`);
    // ...and pigment and etch take them back in a companion rule that tone is not part of.
    const own = bodyRules(headed('pigment', 'etch'));
    assert.equal(own.length, 1, 'the companion rule');
    for (const c of ['line-dot', 'line-band', 'line-area', 'slope-dot']) assert.ok(own[0].sel.includes(`.${c}`), `pigment and etch keep ${c} in its own hue, so they may repaint it`);
    const toneSelectors = serving('tone').map((r) => dropNots(r.sel));
    for (const c of ['line-path', 'ep-path', 'line-dot', 'ep-dot', 'line-area', 'cart-series', 'wc-word']) {
      assert.ok(!toneSelectors.some((sel) => new RegExp(`\\.${c}\\b`).test(sel)), `no tone rule repaints .${c}`);
    }
    assert.match(css, /marks-etch :where\(:is\(\.line-path, \.ep-path\)\)[^}]*stroke-width: 2\.6/, 'etch draws the series line heavier');
  });

  // THE OWNER'S PICK (2026-10-25): under tone a category's hue survives in its EDGE. #2887 once read every tone edge from
  // the first category's ink, so on a pie, a tower, a stacked bar and a quadrant the edges were one color (closest pair 0 OKLab).
  test('tone\'s edge is the mark\'s own category ink, as in every other finish', () => {
    const edgeRules = rules.filter((r) => /stroke: var\(--finish-mark-edge\)|box-shadow: inset 0 0 0 [^;]* var\(--finish-mark-edge\)/.test(r.body));
    assert.ok(edgeRules.length >= 4, 'plain and text-bearing, fill and bg');
    // Every edge rule serves tone, except the companion that puts a series stroke's dots and bands back under pigment and
    // etch: tone leaves those whole, so its dots keep matching their own series.
    const companion = new Set(headed('pigment', 'etch'));
    for (const r of edgeRules.filter((x) => !companion.has(x))) assert.ok(serving('tone').includes(r), `tone takes the shared edge rule: ${r.sel.slice(0, 80)}`);
    // The edge comes from the slot, once per category, never from category 1.
    for (let n = 1; n <= 8; n++) {
      const slot = rules.find((r) => r.sel.startsWith(`section:is(.marks-pigment, .marks-etch, .marks-tone) :where(:is([data-hue="${n}"], [data-key-hue="${n}"]))`));
      assert.match(slot.body, new RegExp(`--finish-mark-edge: var\\(--chart-cat-${n}-ink\\);`), `slot ${n}`);
    }
    // The one ink survives only where it is not an edge on a hue mark: a container's title, a quadrant cell's name, a roadmap phase.
    // A RAMP's cell gap is etch's own line, not a hue mark's edge.
    assert.deepEqual(rules.filter((x) => !/data-encodes="ramp"/.test(x.sel) && /(?:stroke|box-shadow)[^;]*var\(--chart-cat-1-ink\)/.test(x.body)).map((r) => r.sel.slice(0, 100)), [], 'no hue mark edge reads category 1');
  });

  // "Nothing else rings" reads only if an exception's ring is the HEAVIER line. The ring replaces the mark's edge,
  // so wherever a finish widens a status mark's edge (etch 2-3x, tone 2.5x on a text-bearing mark) the ring widens
  // by the same factor. Fixed at 1.3 hairlines it sat under those edges, and a done bar outlined louder than an
  // at-risk one (#2887; measured on the render, before and after, in tools/ and the PR body).
  test('a status mark\'s signal ring is 1.3x its finished edge, in every finish', () => {
    // The ring reads the same edge token the mark's own edge does, so the two cannot drift: one value per finish, set once.
    const ringTok = (body) => /--chart-ring: calc\(var\(--state-signal-w\) \* var\((--finish-edge(?:-text)?)\)\)/.exec(body)?.[1];
    const edgeTok = (body) => /(?:box-shadow: inset 0 0 0|stroke-width:) calc\(var\(--chart-edge\) \* var\((--finish-edge(?:-text)?)\)\)/.exec(body)?.[1];
    const ALL = 'section:is(.marks-pigment, .marks-etch, .marks-tone) :where(';
    for (const s of STATUS_MARKS) {
      const own = rules.filter((r) => r.sel.startsWith(`${ALL}${s.sel}),`));
      assert.equal(own.length, 1, `${s.sel} is painted once, for every finish`);
      const want = s.bears ? '--finish-edge-text' : '--finish-edge';
      assert.equal(edgeTok(own[0].body), want, `${s.sel}: edge token`);
      // Only an HTML box draws its ring from its own `--chart-ring`; an SVG shape's ring is a sibling element, set by name.
      if (s.paint === 'bg') assert.equal(ringTok(own[0].body), want, `${s.sel}: ring scales with its ${want}`);
      else assert.doesNotMatch(own[0].body, /--chart-ring:/, `${s.sel}: no ring width where nothing reads it`);
    }
    // A gantt bar's ring is its own SVG element, set by name, behind the same guard as the bar's wider edge; a milestone
    // diamond and a key swatch carry no text, so theirs follows the plain edge.
    const svgRing = rules.find((r) => r.sel.startsWith(`${ALL}.chart-signal-ring),`));
    assert.equal(ringTok(svgRing.body), '--finish-edge-text', 'the SVG ring follows its bar');
    assert.match(css, /@supports[^{]*\{\s*section:is\(\.marks-pigment, \.marks-etch, \.marks-tone\) :where\(\.chart-signal-ring\)/, 'the SVG ring waits behind the guard');
    const diamond = rules.find((r) => r.sel.startsWith(`${ALL}:is(polygon.chart-signal-ring`));
    assert.equal(ringTok(diamond.body), '--finish-edge', 'a diamond and a key swatch follow the plain edge');
    // The values: the edge a finish gives a mark; the ring is 1.3x it through the rules above.
    for (const [name, f] of Object.entries(F)) {
      assert.equal(tokens(name)['--finish-edge'], String(f.edge), `${name}: plain edge`);
      assert.equal(tokens(name)['--finish-edge-text'], String(f.edgeBackdrop), `${name}: text-bearing edge`);
    }
    // Etch draws each risk cell's edge in its band's ink at its 2x edge, so the critical ring follows it.
    const risk = headed('etch').find((r) => r.sel.includes('.risk-band-ring'));
    assert.match(risk?.body || '', new RegExp(`--chart-ring: calc\\(var\\(--state-signal-w\\) \\* ${F.etch.edge}\\)`), 'etch: the critical band ring scales with the cell edge');
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

  // The body a finish gives the status mark selected by `sel` (its first paint declaration). The rule is shared, so
  // the body names the finish's LEVEL token, and the finish only sets its value (`tokens(finish)`).
  const statusBody = (finish, sel) => {
    const r = serving(finish).find((x) => x.sel.includes(`:where(${sel})`));
    assert.ok(r, `a ${finish} rule for ${sel}`);
    return /(?:fill|background): ([^;]*) !important/.exec(r.body)[1];
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
