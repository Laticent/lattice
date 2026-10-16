/**
 * Unit: the `code-line-clipped` authoring rule (lib/authoring/lint-core.js).
 *
 * TWO TIERS, deliberately, because the rule is a claim about GEOMETRY and a
 * pure test can only ever check the arithmetic it was handed:
 *
 *   1. The pure tier — does the rule fire on the right slides, in the right
 *      boxes, with the right numbers? Runs everywhere, needs no browser.
 *   2. The BEHAVIORAL tier — are `CODE_LINE_BUDGET`'s numbers still what the
 *      real Chromium actually fits? Renders the real bundle and re-measures.
 *      SKIPS (never fails) with no Chromium, so `npm test` stays render-free.
 *
 * Tier 2 is the one that matters. A budget table nobody re-measures is a magic
 * number with a comment on it: the day someone retunes `--sp-md`, changes the
 * type scale, or repoints `--font-mono`, the pure tests all still pass while
 * every warning the rule prints becomes a lie. Asserting what the browser
 * computes is the only version of this test that can catch that.
 */

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');

// The modifiers these tests put on a slide, as the real vocabulary has them.
const vocab = {
  names: new Set(['compare-code', 'code', 'content']),
  modifiers: new Set(['dark', 'claim-hero', 'claim-bleed', 'claim-quiet', 'compact', 'align-center', 'align-left', 'align-right', 'stats',
    'scale-l', 'scale-xl', 'scale-2xl', 'venue-huddle', 'venue-conference', 'venue-hall']),
};

const deck = (body, size) =>
  `---\nmarp: true\ntheme: indaco\n${size ? `size: ${size}\n` : ''}---\n\n${body}`;
const codeSlide = (token, lines, size) =>
  deck(`<!-- _class: ${token} -->\n\n\`\`\`js\n${lines.join('\n')}\n\`\`\`\n`, size);
const clipFinding = (src) => core.lintTextWith(src, vocab).find((f) => f.rule === 'code-line-clipped');
// The measured table, read through the rule's own lookup: a 16:9 deck (the default) is 1280x720.
const HD = '1280x720';
const cols = (group, classes = [], canvas = HD, family = 'wide') => core.codePaneColumns(group, classes, canvas, family);

// ── Tier 1: the pure rule ────────────────────────────────────────────────────

describe('code-line-clipped — the column measure', () => {
  test('counts characters, not UTF-16 units, and expands tabs to the tab stop', () => {
    assert.equal(core.codeLineColumns('abc'), 3);
    assert.equal(core.codeLineColumns(''), 0);
    // A tab advances to the next multiple of 8, so it is not worth one column.
    assert.equal(core.codeLineColumns('\tx'), 9);
    assert.equal(core.codeLineColumns('abc\tx'), 9); // 3 → stop at 8 → 9
    assert.equal(core.codeLineColumns('\t\t'), 16);
    // An astral char is ONE character; it happens to be TWO columns because
    // emoji are double-advance, but never the "2" for the reason `.length` says
    // (two UTF-16 units). A CJK extension-B ideograph is the case that separates
    // them: two units, one character, two columns — not four.
    assert.equal('🙂'.length, 2, 'guard: the naive measure really does differ');
    assert.equal(core.codeLineColumns('🙂'), 2, 'double-advance, not double-counted');
    assert.equal(core.codeLineColumns('\u{20000}'), 2, 'astral CJK: 2 columns, not 4');
  });

  test('widestCodeLine scans EVERY fenced block, not just the first', () => {
    // The long line is in the SECOND block — a compare-code slide's right pane.
    const slide = '```js\nshort\n```\n\n```js\n' + 'x'.repeat(40) + '\n```\n';
    assert.equal(core.widestCodeLine(slide).columns, 40);
    // No fenced block at all → null, so a caller can tell "no code" apart from
    // "code, but every line is empty" (which is a real 0-column measurement).
    assert.equal(core.widestCodeLine('no code here'), null);
    assert.equal(core.widestCodeLine(''), null);
    assert.equal(core.widestCodeLine('```js\n\n```').columns, 0);
  });
});

describe('code-line-clipped — when it fires', () => {
  const WIDE = cols('compare');

  test('fires on a compare-code line past the landscape pane budget', () => {
    const f = clipFinding(codeSlide('compare-code', ['x'.repeat(WIDE + 11)]));
    assert.ok(f, 'expected code-line-clipped');
    // `info`, NOT `warning` — deliberately. `tools/lint-deck.js` fails on any
    // warning under `--strict`, and CI runs `lint:deck:all --strict` over the
    // whole corpus, so `warning` would make this a merge gate on every future PR
    // in the repo, enforced from a browser-measured table whose guard does not
    // run in CI. If this assertion is ever "fixed" to `warning`, read the note
    // above the rule first.
    assert.equal(f.severity, 'info');
    assert.equal(f.classToken, 'compare-code');
    assert.match(f.message, new RegExp(`is ${WIDE + 11} characters`));
    assert.match(f.message, /the last 11 are cut off/);
    // The escape hatch names the full-width budget, so the advice is actionable.
    assert.match(f.fix, new RegExp(`about ${core.CODE_LINE_BUDGET.code.wide}`));
  });

  test('is silent exactly AT the budget, and speaks one column past it', () => {
    assert.equal(clipFinding(codeSlide('compare-code', ['x'.repeat(WIDE)])), undefined);
    const f = clipFinding(codeSlide('compare-code', ['x'.repeat(WIDE + 1)]));
    assert.ok(f, 'one column past the budget must warn');
    assert.match(f.message, /the last 1 is cut off/, 'singular, not "1 are"');
  });

  test('one finding per slide, reporting the WORST line', () => {
    const out = core.lintTextWith(
      codeSlide('compare-code', ['x'.repeat(WIDE + 3), 'x'.repeat(WIDE + 40), 'x'.repeat(WIDE + 5)]),
      vocab,
    ).filter((f) => f.rule === 'code-line-clipped');
    assert.equal(out.length, 1, 'three bad lines must not print three warnings');
    assert.match(out[0].message, new RegExp(`is ${WIDE + 40} characters`));
  });

  test('a stress specimen is silent — the marker means "I know"', () => {
    const src = deck(
      `<!-- _class: compare-code -->\n<!-- stress-slide -->\n\n\`\`\`js\n${'x'.repeat(WIDE + 40)}\n\`\`\`\n`,
    );
    assert.equal(clipFinding(src), undefined);
  });
});

describe('code-line-clipped — the box decides', () => {
  test('compare-code warns at wide only: the stacked families WRAP, so nothing clips', () => {
    const long = ['x'.repeat(200)];
    assert.ok(clipFinding(codeSlide('compare-code', long)), 'wide clips');
    for (const size of ['square', 'portrait', 'mobile']) {
      assert.equal(
        clipFinding(codeSlide('compare-code', long, size)), undefined,
        `${size}: compare-code stacks to one column and switches to pre-wrap — no clip to report`,
      );
    }
  });

  test('code warns in EVERY box, because it never wraps — and the budget tightens', () => {
    const seen = [];
    for (const [size, family, canvas] of [[undefined, 'wide', HD], ['square', 'square', '1080x1080'], ['portrait', 'tall', '1080x1350'], ['mobile', 'strip', '1080x2340']]) {
      const budget = cols('pane', [], canvas, family);
      assert.equal(
        clipFinding(codeSlide('code', ['x'.repeat(budget)], size)), undefined,
        `${family}: a line exactly at the budget fits`,
      );
      const f = clipFinding(codeSlide('code', ['x'.repeat(budget + 1)], size));
      assert.ok(f, `${family}: one past the budget must warn`);
      assert.match(f.message, new RegExp(`this pane fits about ${budget}`), family);
      seen.push(budget);
    }
    // A smaller box shows fewer columns — a table that ever inverted this would
    // be reporting a measurement nobody took.
    assert.deepEqual(seen, [...seen].sort((a, b) => b - a), `budgets must not widen as the box narrows: ${seen}`);
  });

  test('says nothing about slides with no code', () => {
    assert.equal(clipFinding(deck('<!-- _class: code -->\n\nNo fenced block here.\n')), undefined);
  });
});

// A plain slide's fence takes the code panel since #2710, and the panel clips: this used to read
// "content wraps", which stopped being true when every fence got the panel (measured, Tier 2).
describe('code-line-clipped — a plain slide, and the record', () => {
  const PLAIN = cols('pane');
  const plain = (body, fm = '') => `---\nmarp: true\ntheme: indaco\n${fm}---\n\n# Title\n\n${body}`;
  const fence = (lines, lang = 'js') => `\`\`\`${lang}\n${lines.join('\n')}\n\`\`\`\n`;

  test('a slide with no _class is judged against the content pane, and quotes the line', () => {
    assert.equal(clipFinding(plain(fence(['x'.repeat(PLAIN)]))), undefined);
    const f = clipFinding(plain(fence(['y'.repeat(PLAIN + 4)])));
    assert.ok(f, 'a plain slide clips like any panel');
    assert.equal(f.classToken, 'content');
    assert.match(f.line, /^y+$/, 'with no class directive, the finding quotes the long line');
    assert.match(f.fix, /@code\{wrap\}/);
    assert.ok(clipFinding(codeSlide('content', ['x'.repeat(PLAIN + 1)])), '`_class: content` is the same pane');
    assert.ok(clipFinding(codeSlide('dark', ['x'.repeat(PLAIN + 1)])), 'a class of modifiers only is a content slide');
  });

  test('a tab after the numbers or diff gutter lands on the stop it would without one (measured)', () => {
    const rec = (r, line) => plain(`\`@code{${r}}\`\n` + fence([line], 'go'));
    // Chromium: `\tfoo` with numbers ends at 11ch, not 8 + 3 + 3 = 14 — the tab swallows the gutter.
    assert.equal(clipFinding(rec('numbers', `\t${'x'.repeat(PLAIN - 10)}`)), undefined);
    assert.equal(clipFinding(rec('diff', `\t${'y'.repeat(PLAIN - 9)}`)), undefined);
    assert.equal(clipFinding(rec('diff', `+\t${'y'.repeat(PLAIN - 9)}`)), undefined);
    assert.ok(clipFinding(rec('numbers', `\t${'x'.repeat(PLAIN - 7)}`)), 'past the panel, it is still named');
  });

  test('a fence another plugin draws is a picture, not a panel: never measured on a plain slide', () => {
    assert.equal(clipFinding(plain(fence(['A-->'.repeat(60)], 'mermaid'))), undefined);
    assert.ok(clipFinding(plain(fence(['x'.repeat(PLAIN + 1)], ''))), 'an untagged fence is a panel');
    assert.ok(clipFinding(plain(fence(['x'.repeat(PLAIN + 1)], 'text'))));
  });

  test('the checker\'s cases: notes, unknown tags, a deck-wide class, an indented fence', () => {
    const long = 'x'.repeat(PLAIN + 8);
    // A fence inside an HTML comment (speaker notes) renders nothing.
    assert.equal(clipFinding(plain(`<!--\n${fence([long])}-->\n`)), undefined);
    assert.equal(clipFinding(plain(`<!-- note -->\n\n${fence([long])}`)) !== undefined, true, 'a closed comment above does not hide the fence');
    // A tag no grammar knows is still a plain panel, and it clips.
    assert.ok(clipFinding(plain(fence([long], 'output'))));
    // `class: compact` in the front matter widens the stage: the deck's classes count, measured.
    const compact = cols('pane', ['compact']);
    assert.ok(compact > PLAIN, 'guard: compact is wider');
    assert.equal(clipFinding(plain(fence(['x'.repeat(compact)]), 'class: compact\n')), undefined);
    assert.ok(clipFinding(plain(fence(['x'.repeat(compact + 1)]), 'class: compact\n')));
    // A record attaches only to a fence at its own indentation, as the engine reads it.
    assert.ok(clipFinding(plain(`\`@code{wrap}\`\n  \`\`\`js\n  ${long}\n  \`\`\`\n`)));
  });

  test('a `wrap` block never clips, from its record or the deck default', () => {
    const long = fence(['x'.repeat(PLAIN + 40)]);
    assert.equal(clipFinding(plain(`\`@code{wrap}\`\n${long}`)), undefined);
    assert.equal(clipFinding(plain(`\`@code{wrap}\`\n\n${long}`)), undefined, 'a blank line between is still its record');
    assert.equal(clipFinding(plain(long, 'code: wrap\n')), undefined);
    assert.ok(clipFinding(plain(`\`@code{numbers}\`\n${long}`, 'code: numbers\n')), 'a record without wrap still clips');
    assert.ok(clipFinding(codeSlide('code', ['x'.repeat(cols('pane') + 1)])), 'guard: code clips unwrapped');
    assert.equal(clipFinding(deck(`<!-- _class: code -->\n\n\`@code{wrap}\`\n${fence(['x'.repeat(200)])}`)), undefined);
    // A record written under a sentence continues it, so it configures nothing (the render's reading).
    assert.ok(clipFinding(plain(`Some words.\n\`@code{wrap}\`\n${long}`)));
  });

  test('a tab takes the record\'s indent: 4 columns for `tab` or 4, 2 for 2, 8 when unset', () => {
    assert.equal(core.codeLineColumns('\tx', 4), 5);
    assert.equal(core.codeLineColumns('\tx', 2), 3);
    const tabbed = (n) => fence([`${'\t'.repeat(n)}x`]);
    // 13 tabs + x: 105 columns at 8 (clips at 102), 53 at 4 (fits).
    assert.ok(clipFinding(plain(tabbed(13))));
    assert.equal(clipFinding(plain(`\`@code{indent=tab}\`\n${tabbed(13)}`)), undefined);
    assert.equal(clipFinding(plain(tabbed(13), 'code: indent=2\n')), undefined);
  });
});

// Every case below is an adversarial finding against the first cut of this rule.
// Each one was either a FALSE ALARM on a slide that renders correctly, or SILENCE
// on a line that really is cut off. They are kept as tests because both directions
// are how a rule like this dies: the first gets it switched off, the second makes
// it decorative.
describe('code-line-clipped — measuring the line as it RENDERS, not as it reads', () => {
  const WIDE = cols('compare');

  test('a CR does not count as a column — a CRLF deck is not one column over on every line', () => {
    const lf = codeSlide('compare-code', ['x'.repeat(WIDE)]);
    assert.equal(clipFinding(lf), undefined, 'guard: exactly at budget is silent with LF');
    assert.equal(
      clipFinding(lf.replace(/\n/g, '\r\n')), undefined,
      'the same deck saved CRLF must also be silent — counting \\r fired on every fenced line',
    );
  });

  test('trailing whitespace is not clipped content', () => {
    assert.equal(clipFinding(codeSlide('compare-code', [`${'x'.repeat(WIDE - 5)}          `])), undefined);
  });

  test('`~~~` fences are code too', () => {
    const src = deck(`<!-- _class: compare-code -->\n\n~~~js\n${'x'.repeat(300)}\n~~~\n`);
    assert.ok(clipFinding(src), 'markdown-it renders ~~~ as a fenced block; a 300-column line clips');
  });

  test('an unclosed fence still measures — markdown-it closes it at EOF', () => {
    assert.ok(clipFinding(deck(`<!-- _class: compare-code -->\n\n\`\`\`js\n${'x'.repeat(300)}\n`)));
  });

  test("an indented fence is measured after its indent, which markdown-it strips", () => {
    // A block nested in a list item renders 4 columns narrower than it reads.
    const src = deck(`<!-- _class: compare-code -->\n\n- item\n\n    \`\`\`js\n    ${'x'.repeat(WIDE)}\n    \`\`\`\n`);
    assert.equal(clipFinding(src), undefined, 'the indent is not part of the rendered line');
  });

  test('CJK, fullwidth and emoji count as TWO columns — they are double-advance', () => {
    // 50 ideographs render ~100 advance widths: past a 57-column pane, and the
    // first cut counted them as 50 and said nothing.
    assert.ok(clipFinding(codeSlide('compare-code', ['漢'.repeat(50)])), 'CJK must be measured double-width');
    assert.ok(clipFinding(codeSlide('compare-code', ['Ａ'.repeat(50)])), 'fullwidth forms too');
    assert.equal(core.codeLineColumns('漢'), 2);
    assert.equal(core.codeLineColumns('🙂'), 2);
    assert.equal(core.codeLineColumns('a'), 1);
  });
});

describe('code-line-clipped — every class that moves the pane is measured, not skipped', () => {
  test('a stage class is judged against its own measured pane, never the bare one', () => {
    // These used to silence the rule (no number for their pane). Now each has one, so a line inside
    // it is quiet and one past it is named, on a code slide and a plain slide alike.
    for (const mod of ['claim-hero', 'claim-bleed', 'claim-quiet', 'compact']) {
      const n = cols('pane', [mod]);
      assert.ok(n > cols('pane'), `${mod} widens the pane`);
      for (const layout of ['code', 'content']) {
        assert.equal(clipFinding(codeSlide(`${layout} ${mod}`, ['x'.repeat(n)])), undefined, `${layout} ${mod}: ${n} fits`);
        assert.match(clipFinding(codeSlide(`${layout} ${mod}`, ['x'.repeat(n + 1)]))?.message ?? '', new RegExp(`fits about ${n},`), `${layout} ${mod}`);
      }
    }
  });

  test('a venue or a spot scale narrows a plain pane, and the finding names the size', () => {
    const plain = (fm, body) => `---\nmarp: true\ntheme: indaco\n${fm}---\n\n# T\n\n\`\`\`js\n${body}\n\`\`\`\n`;
    const conf = cols('pane', ['venue-conference']);
    assert.ok(conf < cols('pane'));
    assert.equal(clipFinding(plain('venue: conference\n', 'x'.repeat(conf))), undefined);
    const f = clipFinding(plain('venue: conference\n', 'x'.repeat(conf + 1)));
    // `info` like every finding of this rule: the note above it says why it never blocks.
    assert.equal(f?.severity, 'info');
    assert.match(f.message, /characters; at conference size this pane fits about/);
    // A spot scale is advisory, like every spot-scale finding.
    const xl = cols('pane', ['scale-xl']);
    assert.equal(clipFinding(codeSlide('scale-xl', ['x'.repeat(xl + 1)]))?.severity, 'info');
    // A line past the DESIGNED size clips at every size: one info finding, at this slide's budget.
    assert.equal(clipFinding(plain('venue: conference\n', 'x'.repeat(cols('pane') + 1)))?.severity, 'info');
  });

  test('a spot scale beside a venue replaces its size, as Chromium lays it out', () => {
    // venue-conference alone fits 68 at 16:9; with scale-l beside it the type is set at scale-l,
    // so more fits. Dividing by the venue's factors would call a line that renders whole cut off.
    const both = cols('pane', ['venue-conference', 'scale-l']);
    assert.ok(both > cols('pane', ['venue-conference']));
    const src = `---\nmarp: true\ntheme: indaco\nvenue: conference\n---\n\n<!-- _class: scale-l -->\n\n# T\n\n\`\`\`js\n${'x'.repeat(both)}\n\`\`\`\n`;
    assert.equal(clipFinding(src), undefined);
  });

  test('a shrink-wrapping alignment class lets the panel grow until the slide cuts it', () => {
    for (const [mod, group] of [['align-center', 'centered'], ['stats', 'centered'], ['align-left', 'sided'], ['align-right', 'sided']]) {
      const n = cols(group);
      assert.ok(n > cols('pane'), `${mod}: the slide is wider than the panel was`);
      assert.equal(clipFinding(codeSlide(mod, ['x'.repeat(n)])), undefined, mod);
      assert.ok(clipFinding(codeSlide(mod, ['x'.repeat(n + 1)])), mod);
      assert.equal(core.codeGroupFor('code', [mod]), group, 'a code slide shrink-wraps the same way (measured)');
    }
    assert.equal(core.codeGroupFor('compare-code', ['align-center']), 'compare', 'compare-code does not');
  });

  test('a canvas is judged by its own measurement, an unregistered one by its family\'s narrowest', () => {
    // 16:9 and 4K differ by a column for compare-code; the family minimum would call 48 cut off at 16:9.
    assert.equal(cols('compare', [], HD), 48);
    assert.equal(cols('compare', [], 'nope', 'wide'), 47);
  });

  test('the TIGHTEST budget wins, so the verdict does not depend on _class word order', () => {
    const a = clipFinding(codeSlide('code compare-code', ['x'.repeat(80)]));
    const b = clipFinding(codeSlide('compare-code code', ['x'.repeat(80)]));
    assert.ok(a && b, '80 columns is past compare-code’s pane either way round');
    assert.equal(a.message, b.message, 'same slide, same verdict, whichever token is typed first');
  });
});

// ── Tier 2: the table, re-measured in the browser that does the clipping ──────
//
// The numbers the rule judges by are MEASURED (tools/measure-code-columns.js writes
// lib/authoring/code-pane-columns.js). A table nobody re-measures is a magic number with a
// comment on it: the day someone retunes `--sp-md`, the type scale, the venue lift or
// `--font-mono`, every pure test above still passes while every warning lies. So this tier
// re-measures, through the tool's own measuring function, and compares cell by cell.
//
// A SAMPLE, every canvas: each group bare, each stage, venue and spot scale alone, and one venue
// with a spot scale beside it (the cross term the table exists for), and the bar's cost at two room
// sizes. The whole column matrix, 1,792 cells, and every bar rung,
// is `node tools/measure-code-columns.js --check`, minutes rather than seconds. SKIPS (never
// fails) with no Chromium, so `npm test` stays render-free there.
describe('code-line-clipped — the table, as the browser lays it out', () => {
  const { resolveChrome: chrome } = require('../../../tools/lib/resolve-chrome');
  const measure = require('../../../tools/measure-code-columns.js');
  const table = require('../../../lib/authoring/code-pane-columns.js');
  const SAMPLE = ['||', 'claim-hero||', 'claim-quiet||', 'compact||', '|venue-huddle|', '|venue-conference|', '|venue-hall|',
    '||scale-l', '||scale-xl', '||scale-2xl', '|venue-conference|scale-l'];
  // The bar table (what a title or copy bar costs the pane, lib/authoring/code-pane-columns.js BAR):
  // each group at the designed size and at conference, every canvas.
  const BAR_SAMPLE = ['', 'venue-conference'];
  let measured = null;
  let bars = null;
  const exe = chrome();

  before(async () => {
    if (!exe) return;
    const puppeteer = require('puppeteer-core');
    const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      measured = await measure.measureCodeColumns(browser, { combos: SAMPLE });
      bars = await measure.measureCodeBars(browser, { rungs: BAR_SAMPLE });
    } finally {
      await browser.close();
    }
  });

  test('the tool measures the canvases the table lists, in its order', () => {
    assert.deepEqual(measure.CANVASES.map((c) => c.key), [...table.CANVASES]);
    assert.deepEqual(Object.keys(table.COLUMNS), [...measure.GROUPS]);
    for (const g of measure.GROUPS) assert.equal(Object.keys(table.COLUMNS[g]).length, measure.allCombos().length, g);
  });

  test('every sampled cell is what Chromium fits, on every canvas', (t) => {
    if (!exe) return t.skip('no Chromium — set CHROME_PATH (the SessionStart hook exports it)');
    for (const g of measure.GROUPS) {
      for (const combo of SAMPLE) {
        const want = table.COLUMNS[g][combo];
        const got = table.CANVASES.map((c) => measured[g][combo][c]);
        assert.deepEqual(got, [...want], `${g} ${combo || 'bare'}: the table says ${want}, Chromium fits ${got}. `
          + 'Re-run `node tools/measure-code-columns.js --write` and review the diff; do not edit the test to match.');
      }
    }
  });

  test('every sampled bar cost is what Chromium lays out, on every canvas', (t) => {
    if (!exe) return t.skip('no Chromium — set CHROME_PATH (the SessionStart hook exports it)');
    assert.deepEqual([...table.BAR_FIELDS], [...measure.BAR_FIELDS]);
    for (const g of Object.keys(table.BAR)) {
      assert.deepEqual(Object.keys(table.BAR[g]), [...measure.RUNGS], g);
      for (const rung of BAR_SAMPLE) {
        const want = table.BAR[g][rung];
        const got = measure.CANVASES.map((c) => bars[g][rung][c.key]);
        assert.deepEqual(got, want.map((cell) => [...cell]), `${g} bar ${rung || 'designed'}: the table and Chromium differ. `
          + 'Re-run `node tools/measure-code-columns.js --write` and review the diff; do not edit the test to match.');
      }
    }
  });

  test('a panel that wraps has no number, and only compare-code wraps, off the wide canvases', () => {
    for (const g of measure.GROUPS) {
      for (const [combo, row] of Object.entries(table.COLUMNS[g])) {
        table.CANVASES.forEach((canvas, i) => {
          const wraps = g === 'compare' && table.FAMILY[canvas] !== 'wide';
          assert.equal(row[i] == null, wraps, `${g} ${combo} @${canvas}`);
        });
      }
    }
  });
});
