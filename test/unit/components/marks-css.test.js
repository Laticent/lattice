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

const { build, F, STATUS_MARKS, KEY_FOLLOWS, TONE, TONE_D } = require('../../../tools/build-marks-css');
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
      // A rule may add a slide-level GUARD (`:not(:has(...))`, `:not(.keyline)`) after the head, so a first-hue neutral mark waits for a
      // slide whose own markup does not already use that hue for a category.
      const guard = '(?::(?:not|has)\\((?:[^()]|\\((?:[^()]|\\([^()]*\\))*\\))*\\))*';
      // A kanban board guard names the board element itself: the slide (`section.marks-X.kanban:not(.keyline)`), or a figure.
      assert.match(s, new RegExp(`^(section|figure)${head}(?:\\.kanban)?${guard} :where\\(.+\\)$`), s);
    }
    // One token block per finish (the slide, the re-hosted figure, the chart frame inside a pane), plus tone's guarded base block.
    assert.equal(tokenHeads.length, 12, 'one token block per finish, plus tone\'s guarded light base');
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

  // ONE STATUS LEVEL (#2908). A status chart is one class, so a text-free status mark (a progress bar) takes the same level as a
  // text-bearing one (a gantt bar): the paler level exists for the text, and nothing about a bar without text earns more.
  test('every status mark in a finish takes one level, mixed toward the plain canvas', () => {
    for (const f of FINISHES) {
      const t = tokens(f);
      assert.equal(t['--finish-status'], t['--finish-status-text'], `${f}: plain status level is the text level`);
      assert.equal(t['--finish-status-d'], t['--finish-status-text-d'], `${f}: dark plain status level is the dark text level`);
    }
    assert.equal(tokens('tone')['--finish-status-base'], 'var(--bg)');
    assert.equal(tokens('etch')['--finish-status-base'], 'var(--bg)');
  });

  // A ROADMAP is a status chart, so its filled status discs take the finish's one status level, like a gantt bar
  // (#2908's P2 follow-up: they stayed solid under etch and tone). The discs are pseudo-elements, so the finish sets the
  // member's disc channel on the cell and key item; pigment's level is the solid, so it emits nothing.
  test('a roadmap status disc takes the one status level under etch and tone', () => {
    const at = css.indexOf('section:is(.marks-etch, .marks-tone) :where(:is(.roadmap :is(td.cell-state');
    assert.ok(at >= 0, 'one etch+tone rule for the roadmap discs');
    const head = css.slice(at, css.indexOf('{', at));
    for (const st of ['shipped', 'wip', 'missed', 'skipped']) assert.match(head, new RegExp(`\\.state-${st}\\b`));
    assert.match(head, /\.roadmap\.heat :is\([^)]*\)\.state-planned/, 'heat\'s green planned disc moves too');
    assert.doesNotMatch(head, /state-unknown/, 'a hollow ring has no body to move');
    assert.match(head, /\.roadmap-legend-item/, 'the key follows its discs');
    const body = css.slice(at, css.indexOf('}', at));
    assert.match(body, /--state-fill: light-dark\(color-mix\(in oklab, var\(--state-color\) var\(--finish-status-text\), var\(--finish-status-base\)\)/);
    assert.match(body, /--state-glyph-mark: var\(--finish-ink\)/);
    assert.doesNotMatch(css, /marks-pigment[^{]*state-shipped/, 'pigment leaves the solid disc alone');
    const member = fs.readFileSync(path.join(__dirname, '../../../lib/components/chart/roadmap/roadmap.styles.css'), 'utf8');
    assert.equal((member.match(/background-color:var\(--state-fill, var\(--state-color/g) || []).length, 3, 'all three disc recipes read --state-fill');
  });

  // THE TONE LADDER (#2908 audit). Dark slides take their own ladder with a floor, so a low step never sinks into the navy
  // canvas; the light ladder mixes toward the tone hue lifted to near-white, behind the relative-color guard.
  test('tone has a dark ladder with a floor and a guarded tinted light base', () => {
    const t = tokens('tone');
    for (let n = 1; n <= 8; n++) {
      assert.equal(t[`--finish-body-${n}`], `${TONE[n - 1]}%`);
      assert.equal(t[`--finish-body-d-${n}`], `${TONE_D[n - 1]}%`);
    }
    assert.ok(Math.min(...TONE_D) >= 29, 'the dark ladder keeps its floor');
    assert.equal(t['--finish-base'], 'var(--bg)', 'unguarded, the light base is the canvas');
    assert.equal(t['--finish-base-d'], 'var(--bg)');
    assert.match(css, /@supports \(color: color\(from red[^{]*\{\nsection\.marks-tone,\nfigure\.marks-tone,\n:is\(section, figure\)\.marks-tone \.chart-frame \{\n {2}--finish-base: oklab\(from var\(--chart-cat-1-hue\) /);
    assert.doesNotMatch(css, /--cat-1-fill/, 'the tone base comes from the tone hue, never the palette slot fill');
  });

  test('tone gives journey personas eight distinct, spaced ladder steps', () => {
    const steps = [];
    for (let n = 1; n <= 8; n++) {
      const r = headed('tone').find((x) => x.sel.includes(`.journey-actor-dot[data-hue="${n}"]`));
      const m = new RegExp(`--finish-body-${n}: (\\d+)%`).exec(r?.body || '');
      assert.ok(m, `slot ${n} has a body override`);
      steps.push(m[1]);
    }
    assert.equal(new Set(steps).size, 8, `persona steps are distinct: ${steps}`);
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
    // Tone's text-bearing marks also pick their ink from their own body (one ladder, any shade): the finish's text-level colors.
    // The risk key's number is one too: its disc is a wash or a tamed solid, which the shipped ink was not solved for (1 to 3.4:1 measured).
    for (const b of picked) assert.match(b, /heatmap-value|hub-spoke-icon|lat-pill|finish-mark-text|risk-key-number/, b.slice(0, 160));
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

  // Two treatments moved out of member stylesheets into the generator, and a deleted rule failed nothing (checker finding).
  test('the rules relocated from member stylesheets are present, and the border value differs by finish', () => {
    const pig = rules.find((r) => r.sel.startsWith('section.marks-pigment :where(.quadrant-bubble-value[data-pos="inside"])'));
    assert.match(pig?.body || '', /fill: var\(--chart-on-mark\) !important/, 'pigment prints a bubble value inside its deep fill in the one ink');
    assert.ok(!serving('etch').concat(serving('tone')).some((r) => r.sel.includes('quadrant-bubble-value')), 'etch and tone keep the heading ink');
    assert.deepEqual(FINISHES.map((f) => tokens(f)['--finish-border']), ['1', '0', '0'], 'pigment keeps a border, etch and tone drop it');
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
    // Another is tone's word-cloud words, whose ink is a mix toward the heading ink (text on the slide, not on a body).
    // The other is tone's hub-spoke HUB, a disc body (not text on a body) that goes back to the full heading ink beside group discs.
    // The finish's text ink is a VALUE in its token block, which paints nothing; what matters is that no rule outside the guard reads it.
    assert.doesNotMatch(outside, /var\(--finish-ink\)/, 'every rule that reads the finish\'s text ink waits behind the guard');
    const withoutTicks = outside.replace(/--finish-ink:[^;]*;/g, '').replace(/[^}]*\.radar-tick[^}]*\}/g, '').replace(/[^}]*\.hub-spoke-hub[^}]*\}/g, '').replace(/[^}]*\.wc-word[^}]*\}/g, '').replace(/[^}]*\.chart-status-mark[^}]*\}/g, '');
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

  // A series stroke is all edge (paint `none`), so no body rule reaches it. Tone's one-hue rule still has to hold for the
  // three stroke charts, so tone draws each series in a step of the one ink, tells neighbors apart by a dash pattern, and
  // paints the series' dots and its end label in the same color. A slope's status lines (direction signal) keep their
  // status color. Pigment and etch keep the category hue per series, and etch draws the line heavier.
  test('tone draws a series stroke in steps of the one ink with a dash; pigment and etch keep the category hue', () => {
    const stroke = (n) => headed('tone').find((r) => r.sel.includes(`.line-path, .ep-path)[data-hue="${n}"]`));
    assert.match(stroke(1)?.body || '', /stroke: color-mix\(in oklab, var\(--chart-cat-1-ink\) 100%, var\(--bg\)\) !important/);
    assert.match(stroke(1)?.body || '', /stroke-dasharray: none !important/);
    assert.match(stroke(2)?.body || '', /stroke-dasharray: 7 3\.5 !important/);
    assert.match(stroke(3)?.body || '', /stroke-dasharray: 1\.8 3\.2 !important/);
    const dot = headed('tone').find((r) => r.sel.includes('.line-dot, .ep-dot)[data-hue="2"]'));
    assert.match(dot?.body || '', /fill: color-mix\(in oklab, var\(--chart-cat-1-ink\) 88%, var\(--bg\)\)/, 'a dot matches its stroke');
    const name = headed('tone').find((r) => r.sel.includes('.cart-series'));
    assert.match(name?.body || '', /fill: var\(--chart-cat-1-ink\) !important/);
    const quiet = headed('tone').find((r) => r.sel.includes('.slope-svg:not(.slope-signal) .slope-line:not([data-s])'));
    assert.ok(quiet, 'tone quiets the slope lines that carry no status');
    for (const f of ['pigment', 'etch']) assert.ok(!serving(f).some((r) => r.body.includes('stroke-dasharray: 7 3.5')), `${f} does not dash a series`);
    assert.match(css, /marks-etch :where\(:is\(\.line-path, \.ep-path\)\)[^}]*stroke-width: 2\.6/, 'etch draws the series line heavier');
  });

  // A word cloud's color is arbitrary by default (categorical inks in rank order) while its size already carries the weight.
  // Tone makes color repeat the weight, on the palette's own contrast-gated ramp (`spectrum`'s stops), tier by tier.
  test('tone and etch color a word by its weight tier in the first hue; pigment leaves the words alone', () => {
    const want = { 5: /fill: light-dark\(var\(--chart-cat-1-ink\), color-mix\(in oklab, var\(--chart-cat-1-ink\) 65%, var\(--text-heading\)\)\) !important/, 4: /\) 75%, var\(--text-muted\)\)/, 3: /\) 50%, var\(--text-muted\)\)/, 2: /\) 25%, var\(--text-muted\)\)/, 1: /fill: var\(--text-muted\) !important/ };
    for (const [tier, re] of Object.entries(want)) {
      const r = headed('tone').find((x) => x.sel.startsWith(`section.marks-tone :where(.wc-word[data-tier="${tier}"])`));
      assert.match(r?.body || '', re, `tier ${tier}`);
    }
    // No word may reach for the palette's sequential ramp: its deepest step is near-black on a light slide.
    assert.ok(!headed('tone').some((x) => x.sel.includes('wc-word') && /--seq-/.test(x.body)), 'no --seq-* step');
    assert.ok(headed('etch').some((x) => x.sel.includes('wc-word[data-tier="5"]')), 'etch steps the words too');
    assert.ok(!serving('pigment').some((r) => r.sel.includes('wc-word')), 'pigment does not repaint a word');
    const { tierOf } = require('../../../lib/components/chart/word-cloud/word-cloud.transform');
    assert.deepEqual([5, 4.5, 4.49, 3.5, 2.5, 1.5, 1.49, 1].map(tierOf), [5, 5, 4, 4, 3, 2, 1, 1]);
  });

  // A node with no category or status is the chart's neutral tile, and a waterfall's Plan / Actual anchors are neutral columns.
  // Grey or slate read as a second color beside the other marks, so every finish takes the first hue (the owner's call, and
  // an unstated mark is told from a live one by the live status's dot, lib/core/status-marks.js).
  test('every finish gives the neutral tile and the waterfall anchors the first hue', () => {
    for (const f of ['pigment', 'etch', 'tone']) {
      const tile = serving(f).find((x) => x.sel.includes('.fc-node-group)') && x.body.includes('--fc-hue'));
      assert.match(tile?.body || '', /--fc-hue: var\(--chart-cat-1-hue\) !important/, `${f} re-points the neutral tile`);
      const wf = headed(f).find((x) => x.sel.includes('.waterfall-bar[data-s="total"]'));
      assert.match(wf?.body || '', /var\(--chart-cat-1-hue\)/, `${f} paints the anchors from the first hue`);
    }
  });

  // The matrix grid colors a row's label and its empty cells' outlines from `--row-hue` / `--row-ink`, which no finish paints
  // (they are the member's own properties). Tone re-points them, so a tone grid is one hue like the heatmap and the tower.
  test('tone re-points a matrix grid row to the one hue; the other finishes leave rows alone', () => {
    const r = headed('tone').find((x) => x.sel.startsWith('section.marks-tone :where(.matrix-grid-figure tbody tr)'));
    assert.match(r?.body || '', /--row-hue: var\(--chart-cat-1-hue\) !important/);
    assert.match(r?.body || '', /--row-ink: var\(--chart-cat-1-ink\) !important/);
    for (const f of ['pigment', 'etch']) assert.ok(!serving(f).some((x) => x.sel.includes('matrix-grid-figure')), `${f} leaves rows alone`);
    const cell = headed('tone').find((x) => x.sel.includes('.cell-filled') && x.body.includes('background-color'));
    // Ladder step 6 in both modes: the light ladder over tone's base (`--finish-base`), the dark ladder over the canvas.
    assert.match(cell?.body || '', /background-color: light-dark\(color-mix\(in oklab, var\(--chart-cat-1-hue\) 22%, var\(--finish-base\)\), color-mix\(in oklab, var\(--chart-cat-1-hue\) 40%, var\(--bg\)\)\) !important/);
    assert.match(cell?.body || '', /color: var\(--text-heading\) !important/);
  });

  // THE EDGE RULE. Pigment and etch outline a mark in its own category ink. Tone has ONE ladder of shades that already tells
  // the categories apart by depth, so its outline is one ink (category 1's) on every mark: a tone chart is one color plus
  // status. (Until 2026-10-26 tone's edges carried the category hue, because the shades did not tell categories apart on a
  // text-bearing mark; the one ladder below is what makes the one-ink edge safe.)
  test('pigment and etch outline a mark in its category ink; tone outlines every mark in one ink', () => {
    for (let n = 1; n <= 8; n++) {
      const slot = rules.find((r) => r.sel.startsWith(`section:is(.marks-pigment, .marks-etch, .marks-tone) :where(:is([data-hue="${n}"], [data-key-hue="${n}"]))`));
      assert.match(slot.body, new RegExp(`--finish-mark-edge: var\\(--chart-cat-${n}-ink\\);`), `slot ${n}`);
    }
    const toneEdge = headed('tone').find((r) => /^section\.marks-tone :where\(:is\(\[data-hue="1"\], \[data-key-hue="1"\], /.test(r.sel) && r.body.includes('--finish-mark-edge'));
    assert.match(toneEdge?.body || '', /--finish-mark-edge: var\(--chart-cat-1-ink\)/, 'tone re-points every slot\'s edge to the one ink');
    // The tone rule is a plain declaration like the slot rules and comes AFTER them, so at equal specificity it wins.
    const slot8 = rules.findIndex((r) => r.sel.startsWith('section:is(.marks-pigment, .marks-etch, .marks-tone) :where(:is([data-hue="8"], [data-key-hue="8"]))'));
    assert.ok(rules.indexOf(toneEdge) > slot8, 'after the slot rules');
  });

  // ONE LADDER. A text-bearing mark used a second, paler ladder so a fixed text ink could stay readable, which gave category N
  // a different shade on a tower than on a pie (closest pair of tower bodies 0.017 OKLab, pie 0.072). Each text-bearing
  // mark now picks black or white from its own body, so tone's text levels ARE its body levels.
  test('tone has one ladder: its text-bearing levels equal its body levels, and the text ink is picked per mark', () => {
    const t = tokens('tone');
    for (let n = 1; n <= 8; n++) {
      assert.equal(t[`--finish-text-${n}`], t[`--finish-body-${n}`], `slot ${n}, light`);
      assert.equal(t[`--finish-text-d-${n}`], t[`--finish-body-d-${n}`], `slot ${n}, dark`);
    }
    const pick = rules.filter((r) => serving('tone').includes(r) && /color\(from var\(--finish-mark-text-l\)/.test(r.body));
    assert.ok(pick.some((r) => /^\s*color: light-dark\(/m.test(r.body)), 'a text-bearing HTML mark picks its ink from its own body');
    assert.ok(pick.some((r) => /^\s*fill: light-dark\(/m.test(r.body) && r.sel.includes('tower-share-value')), 'a tower share figure does too');
    // Pigment and etch keep their curated pairs: their text levels stay a second, paler tier.
    for (const f of ['pigment', 'etch']) assert.ok(!pick.some((r) => serving(f).includes(r)), `${f} does not pick per mark`);
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
    // Etch reaches a roadmap's status discs only (the next test); its phases keep their colors.
    assert.doesNotMatch(css, /marks-etch :where\([^)]*\.roadmap (thead|td:first-child|\.horizon)/, 'etch leaves a roadmap phase alone');
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
