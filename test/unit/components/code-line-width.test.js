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

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const core = require('../../../lib/authoring/lint-core');

const ROOT = path.resolve(__dirname, '../../..');
const vocab = { names: new Set(['compare-code', 'code', 'content']), modifiers: new Set(['dark']) };

const deck = (body, size) =>
  `---\nmarp: true\ntheme: indaco\n${size ? `size: ${size}\n` : ''}---\n\n${body}`;
const codeSlide = (token, lines, size) =>
  deck(`<!-- _class: ${token} -->\n\n\`\`\`js\n${lines.join('\n')}\n\`\`\`\n`, size);
const clipFinding = (src) => core.lintTextWith(src, vocab).find((f) => f.rule === 'code-line-clipped');

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
  const WIDE = core.CODE_LINE_BUDGET['compare-code'].wide;

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
    assert.match(f.message, new RegExp(`${WIDE + 11} columns wide`));
    assert.match(f.message, /the last 11 columns are clipped/);
    // The escape hatch names the full-width budget, so the advice is actionable.
    assert.match(f.fix, new RegExp(`about ${core.CODE_LINE_BUDGET.code.wide}`));
  });

  test('is silent exactly AT the budget, and speaks one column past it', () => {
    assert.equal(clipFinding(codeSlide('compare-code', ['x'.repeat(WIDE)])), undefined);
    const f = clipFinding(codeSlide('compare-code', ['x'.repeat(WIDE + 1)]));
    assert.ok(f, 'one column past the budget must warn');
    assert.match(f.message, /the last 1 column is clipped/, 'singular, not "1 columns"');
  });

  test('one finding per slide, reporting the WORST line', () => {
    const out = core.lintTextWith(
      codeSlide('compare-code', ['x'.repeat(WIDE + 3), 'x'.repeat(WIDE + 40), 'x'.repeat(WIDE + 5)]),
      vocab,
    ).filter((f) => f.rule === 'code-line-clipped');
    assert.equal(out.length, 1, 'three bad lines must not print three warnings');
    assert.match(out[0].message, new RegExp(`${WIDE + 40} columns wide`));
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
    for (const [size, family] of [[undefined, 'wide'], ['square', 'square'], ['portrait', 'tall'], ['mobile', 'strip']]) {
      const budget = core.CODE_LINE_BUDGET.code[family];
      assert.equal(
        clipFinding(codeSlide('code', ['x'.repeat(budget)], size)), undefined,
        `${family}: a line exactly at the budget fits`,
      );
      const f = clipFinding(codeSlide('code', ['x'.repeat(budget + 1)], size));
      assert.ok(f, `${family}: one past the budget must warn`);
      assert.match(f.message, new RegExp(`the ${family} pane fits about ${budget}`));
      seen.push(budget);
    }
    // A smaller box shows fewer columns — a table that ever inverted this would
    // be reporting a measurement nobody took.
    assert.deepEqual(seen, [...seen].sort((a, b) => b - a), `budgets must not widen as the box narrows: ${seen}`);
  });

  test('says nothing about layouts that wrap, or slides with no code', () => {
    assert.equal(clipFinding(codeSlide('content', ['x'.repeat(300)])), undefined);
    assert.equal(clipFinding(deck('<!-- _class: code -->\n\nNo fenced block here.\n')), undefined);
  });
});

// Every case below is an adversarial finding against the first cut of this rule.
// Each one was either a FALSE ALARM on a slide that renders correctly, or SILENCE
// on a line that really is cut off. They are kept as tests because both directions
// are how a rule like this dies: the first gets it switched off, the second makes
// it decorative.
describe('code-line-clipped — measuring the line as it RENDERS, not as it reads', () => {
  const WIDE = core.CODE_LINE_BUDGET['compare-code'].wide;

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

describe('code-line-clipped — when the pane is not the pane the table measured', () => {
  test('a stage-resizing modifier silences the rule rather than judging the wrong box', () => {
    // MEASURED at wide: bare code 1104px/122 cols, claim-hero and claim-bleed
    // 1172px/130, compact 1116px/124. Judging these against 122 told the author
    // that 8 columns were "clipped off the rendered slide" when they were on it —
    // and examples/claim.md and two galleries ship exactly these combinations.
    for (const mod of ['claim-hero', 'claim-bleed', 'compact']) {
      assert.equal(
        clipFinding(codeSlide(`code ${mod}`, ['x'.repeat(130)])), undefined,
        `code ${mod}: the pane is wider than the table's, so the rule must stay quiet`,
      );
    }
    // The bare slide is still checked — the skip is scoped, not a blanket exit.
    assert.ok(clipFinding(codeSlide('code', ['x'.repeat(130)])));
  });

  test('the TIGHTEST budget wins, so the verdict does not depend on _class word order', () => {
    const a = clipFinding(codeSlide('code compare-code', ['x'.repeat(80)]));
    const b = clipFinding(codeSlide('compare-code code', ['x'.repeat(80)]));
    assert.ok(a && b, '80 columns is past compare-code’s 57 either way round');
    assert.equal(a.message, b.message, 'same slide, same verdict, whichever token is typed first');
  });
});

// ── Tier 2: the budgets, re-measured in the browser that does the clipping ────

describe('code-line-clipped — the budgets, as the browser resolves them', () => {
  // The ONE shared probe (tools/lib/resolve-chrome.js). It returns undefined
  // rather than throwing, so this suite keeps its own policy: skip, never fail,
  // when there is no Chromium — `npm test` must stay render-free.
  const { resolveChrome: chrome } = require('../../../tools/lib/resolve-chrome');

  // One render per box, reused by both assertions below.
  const BOXES = [
    { size: undefined, family: 'wide' },
    { size: 'square', family: 'square' },
    { size: 'portrait', family: 'tall' },
    { size: 'mobile', family: 'strip' },
  ];
  const measured = new Map();
  let browser;
  const exe = chrome();

  before(async () => {
    if (!exe) return;
    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    // A ruler line long enough to overflow every box, in both layouts.
    const ruler = Array.from({ length: 200 }, (_, i) => String((i + 1) % 10)).join('');
    for (const box of BOXES) {
      const src = path.join(os.tmpdir(), `codewidth-${box.family}-${process.pid}.md`);
      fs.writeFileSync(src, `---\nmarp: true\ntheme: indaco\n${box.size ? `size: ${box.size}\n` : ''}---\n\n`
        + `<!-- _class: compare-code -->\n\n\`L\`\n\n\`\`\`js\n${ruler}\n\`\`\`\n\n\`R\`\n\n\`\`\`js\n${ruler}\n\`\`\`\n\n`
        + `---\n\n<!-- _class: code -->\n\n\`\`\`js\n${ruler}\n\`\`\`\n`);
      const base = path.join(os.tmpdir(), `codewidth-${box.family}-${process.pid}`);
      execFileSync(process.execPath, [path.join(ROOT, 'dist/lattice-emulator.js'), src, `${base}.pdf`, 'indaco', '-q'],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
      const page = await browser.newPage();
      await page.setViewport({ width: 1600, height: 1000 });
      await page.goto(`file://${base}.html`, { waitUntil: 'networkidle0', timeout: 120000 });
      measured.set(box.family, await page.evaluate(() => {
        const read = (sel) => {
          const sec = document.querySelector(sel);
          if (!sec) return null;
          const pre = sec.querySelector('pre');
          const code = pre.querySelector('code');
          const cs = getComputedStyle(pre);
          const content = pre.getBoundingClientRect().width
            - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
            - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
          // The real advance of the real font, measured by laying out real glyphs.
          const ccs = getComputedStyle(code);
          const probe = document.createElement('span');
          probe.style.font = ccs.font;
          probe.style.letterSpacing = ccs.letterSpacing;
          probe.style.whiteSpace = 'pre';
          probe.style.position = 'absolute';
          probe.style.visibility = 'hidden';
          probe.textContent = 'M'.repeat(100);
          code.appendChild(probe);
          const advance = probe.getBoundingClientRect().width / 100;
          probe.remove();
          return { fits: Math.floor(content / advance), whiteSpace: ccs.whiteSpace, overflow: cs.overflow };
        };
        return { 'compare-code': read('section.compare-code'), code: read('section.code') };
      }));
      await page.close();
    }
  });

  after(async () => { if (browser) await browser.close(); });

  test('every budget in CODE_LINE_BUDGET is what Chromium actually fits', (t) => {
    if (!exe) return t.skip('no Chromium — set CHROME_PATH (the SessionStart hook exports it)');
    for (const [layout, byFamily] of Object.entries(core.CODE_LINE_BUDGET)) {
      for (const [family, budget] of Object.entries(byFamily)) {
        const m = measured.get(family)?.[layout];
        assert.ok(m, `no measurement for ${layout}@${family}`);
        assert.equal(
          m.fits, budget,
          `${layout}@${family}: the table says ${budget} columns, the browser fits ${m.fits}. `
          + 'Re-measure and update CODE_LINE_BUDGET (and its derivation comment) — do not edit the test to match.',
        );
      }
    }
  });

  test('the rule stays scoped to panes that really CLIP — wrapping ones are excluded', (t) => {
    if (!exe) return t.skip('no Chromium — set CHROME_PATH');
    for (const { family } of BOXES) {
      const m = measured.get(family);
      // `code` never wraps in any box, so it must carry a budget everywhere.
      assert.equal(m.code.whiteSpace, 'pre', `code@${family} is expected not to wrap`);
      assert.match(m.code.overflow, /hidden|clip/, `code@${family} is expected to clip`);
      assert.ok(core.CODE_LINE_BUDGET.code[family], `code@${family} must carry a budget`);
      // compare-code carries one ONLY where it does not wrap. If a future change
      // makes landscape wrap (or stops the stacked families wrapping), this flips
      // and the table must follow — silence would be the rule warning about a
      // clip that no longer happens, or missing one that just started.
      const wraps = m['compare-code'].whiteSpace !== 'pre';
      assert.equal(
        !!core.CODE_LINE_BUDGET['compare-code'][family], !wraps,
        `compare-code@${family}: white-space is '${m['compare-code'].whiteSpace}', so a budget `
        + `${wraps ? 'must NOT' : 'MUST'} be declared for it`,
      );
    }
  });
});
