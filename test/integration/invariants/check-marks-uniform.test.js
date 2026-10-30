/**
 * Every check is the same size, height and gap as its five siblings, in every container, style and size.
 *
 * The defect (engineering/decisions/2026-10-18-checks.md §21): the two hollow answers, `[ ]` open and `[?]` unknown,
 * drew their ring as a fixed 2.2px shadow OUTSIDE the disc, so in every container and style they painted 4.4px
 * wider than the four solid answers, sat 2.2px nearer their label, and did not grow with a pill's size. The owner
 * found it on the demo deck's `checks-outline` slide. `checks-ringed` drew its rim outside too, so its pill checks
 * reached 1.6px nearer the pill's edge and label than an icon does, and `checks-bold`'s inline disc sat 1.7px high.
 *
 * WHAT THIS GUARDS. A deck of every answer, as a bare disc and as a `@check{…}` pill at `sm`, `md` and `lg`, beside an
 * icon pill of the same size, in all five `checks-*` styles, rendered through the real CLI and measured in Chromium:
 *   - per slide and container, the six answers' painted diameter, vertical offset and gap to the label agree to 0.5px;
 *   - a check pill is the icon pill's height, left padding and lead gap, to 0.5px;
 *   - a check sits on its text or its capsule's centre, to 0.5px.
 * No list here names an answer or a style beyond what the deck writes, so a new answer drawn its own way fails.
 *
 * THE FALSIFIABILITY ARM. The same measurement runs with the old hollow ring put back in the page (a 2.2px outer ring,
 * no inner one), and it must find the 4.4px spread. An instrument that stopped measuring would otherwise pass for
 * the same reason a broken one does.
 *
 * Slow tier (one CLI render and two Chromium pages).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');

const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const TIMEOUT = 300000;
const TOLERANCE = 0.5;
const STYLES = ['', 'checks-ringed', 'checks-bold', 'checks-outline', 'checks-tonal'];
const SIZES = ['sm', 'md', 'lg'];
const ANSWERS = [['pass', 'Pass'], ['warn', 'Warn'], ['fail', 'Fail'], ['unknown', 'Unknown'], ['todo', 'Open'], ['skip', 'Skip']];

function deck() {
  const slides = [];
  for (const style of STYLES) {
    for (const size of SIZES) {
      const pills = ANSWERS.map(([id, word]) => `\`@check{${id}, label=${word}, ${size}}\``).join(' ');
      const bare = ANSWERS.map(([id, word]) => `${word} \`@check{${id}, ${size}}\``).join(' ');
      slides.push(`<!-- _class: content ${style} -->\n\n## ${style || 'default'} ${size}\n\nPills ${pills} \`{Icon, icon=database, ${size}}\`\n\nBare ${bare} end`);
    }
    // The containers a component composes: verdict-grid's pills, pricing's rows, obligation-matrix's cells and pills.
    const items = ANSWERS.map(([, word], i) => `  - [${'x-!? /'[i]}] ${word}`).join('\n');
    const cells = ANSWERS.map((_, i) => `[${'x-!? /'[i]}]`).join(' | ');
    slides.push(`<!-- _class: verdict-grid ${style} -->\n\n## ${style || 'default'} grid\n\n- One\n${items}\n  - Body.\n- Two\n  - [x] Pass\n  - Body.`);
    slides.push(`<!-- _class: pricing ${style} -->\n\n## ${style || 'default'} pricing\n\n- Plan \`$1\`\n${items}\n  - Note.`);
    // The base recipe's two other hosts: checklist rows (an `li::before` disc) and any table with `state-cells`.
    slides.push(`<!-- _class: checklist ${style} -->\n\n## ${style || 'default'} checklist\n\n${ANSWERS.map(([, word], i) => `- [${'x-!? /'[i]}] ${word}`).join('\n')}`);
    slides.push(`<!-- _class: table state-cells ${style} -->\n\n## ${style || 'default'} cells\n\n| R | A | B | C | D | E | F |\n| --- | --- | --- | --- | --- | --- | --- |\n| X | ${cells} |`);
    for (const v of ['', ' pills']) {
      slides.push(`<!-- _class: obligation-matrix${v} ${style} -->\n\n## ${style || 'default'} matrix${v}\n\n| R | A | B | C | D | E | F |\n| --- | :-: | :-: | :-: | :-: | :-: | :-: |\n| X | ${cells} |`);
    }
  }
  return `---\ntheme: indaco\n---\n\n${slides.join('\n\n---\n\n')}\n`;
}

/** Runs in the page: one row per drawn check (and per icon pill), with its geometry. */
function measure() {
  const px = (v) => parseFloat(v) || 0;
  const textRect = (n) => { const r = document.createRange(); r.selectNodeContents(n); return [...r.getClientRects()][0]; };
  const answer = (el) => ['pass', 'warn', 'fail', 'unknown', 'todo', 'skip'].find((a) => el.classList.contains(a));
  // What is PAINTED past the box: the widest outer (non-inset) box-shadow spread. The old hollow ring lived
  // there, so a probe that read the box alone was blind to the very defect it guards.
  const outer = (el) => Math.max(0, ...getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/)
    .filter((s) => s.trim() && s.trim() !== 'none' && !/inset/.test(s))
    .map((s) => { const n = s.replace(/rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]+/gi, '').match(/-?[\d.]+px/g) || []; return px(n[3]); }));
  const rows = [];
  for (const sec of document.querySelectorAll('section')) {
    const slide = sec.querySelector('h2')?.textContent.trim();
    for (const pill of sec.querySelectorAll('.lat-pill')) {
      const lead = pill.querySelector(':scope > .lat-pill-lead > .lat-state, :scope > .lat-pill-icon');
      if (!lead) continue;
      const pr = pill.getBoundingClientRect(); const lr = lead.getBoundingClientRect();
      const o = lead.classList.contains('lat-state') ? outer(lead) : 0;
      // An icon's box carries its own trailing gap as padding; a check's lead carries it on the wrapper.
      const right = lr.right + o - (lead.classList.contains('lat-state') ? 0 : px(getComputedStyle(lead).paddingRight));
      const t = [...pill.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      const tr = t && textRect(t);
      rows.push({ slide, ctx: 'pill', ans: answer(lead) || 'icon', d: lr.height + 2 * o, h: pr.height, padL: lr.left - o - pr.left,
        gap: tr ? tr.left - right : null, dy: (lr.top + lr.height / 2) - (pr.top + pr.height / 2) });
    }
    // A pricing row's check leads its words; a matrix cell's check stands alone, so only its size is compared.
    for (const d of sec.querySelectorAll('li > .lat-state:first-child, td > .state')) {
      const r = d.getBoundingClientRect(); const o = outer(d);
      let n = d.nextSibling; while (n && !n.textContent.trim()) n = n.nextSibling;
      const tr = d.matches('td > .state') || !n ? null : textRect(n);
      rows.push({ slide, ctx: d.matches('td > .state') ? 'cell' : 'row', ans: answer(d), d: r.height + 2 * o,
        dy: tr ? (r.top + r.height / 2) - (tr.top + tr.height / 2) : null, gap: tr ? tr.left - (r.right + o) : null });
    }
    // A checklist row draws its disc as the row's `::before`: its size is the pseudo's box plus its outer rim.
    for (const li of sec.querySelectorAll('li.state')) {
      const ps = getComputedStyle(li, '::before');
      const ring = Math.max(0, ...ps.boxShadow.split(/,(?![^(]*\))/).filter((x) => x.trim() && x.trim() !== 'none' && !/inset/.test(x))
        .map((x) => { const n = x.replace(/rgba?\([^)]*\)|color\([^)]*\)/g, '').match(/-?[\d.]+px/g) || []; return px(n[3]); }));
      rows.push({ slide, ctx: 'list', ans: answer(li), d: px(ps.height) + 2 * ring });
    }
    for (const d of sec.querySelectorAll('p > .lat-state')) {
      const r = d.getBoundingClientRect();
      let n = d.previousSibling; while (n && !n.textContent.trim()) n = n.previousSibling;
      const tr = n && textRect(n);
      rows.push({ slide, ctx: 'bare', ans: answer(d), d: r.height + 2 * outer(d), dy: tr ? (r.top + r.height / 2) - (tr.top + tr.height / 2) : null });
    }
  }
  return rows;
}

/** The outliers in a measurement: every group whose answers disagree, or whose pills differ from the icon pill. */
function outliers(rows) {
  const groups = {};
  for (const r of rows) (groups[`${r.slide} | ${r.ctx}`] ||= []).push(r);
  const out = [];
  for (const [name, rs] of Object.entries(groups)) {
    const checks = rs.filter((r) => r.ans !== 'icon');
    const icon = rs.find((r) => r.ans === 'icon');
    for (const k of ['d', 'dy', 'gap', 'padL', 'h']) {
      const v = checks.map((r) => r[k]).filter((x) => typeof x === 'number');
      if (v.length && Math.max(...v) - Math.min(...v) > TOLERANCE) out.push(`${name}: the six answers' ${k} spans ${(Math.max(...v) - Math.min(...v)).toFixed(2)}px`);
    }
    // A bare disc sits on its text's centre. A pill's lead sits where the pill's own icon sits: a browser rounds a
    // pill's fractional `sm` and `lg` type a little off the capsule's centre (0.6 to 0.9px in one Chrome build,
    // 0.1px in another), and the check's job is to be the icon's sibling, not to second-guess the capsule.
    for (const r of checks) {
      const ref = r.ctx === 'pill' && icon ? icon.dy : 0;
      if (typeof r.dy === 'number' && Math.abs(r.dy - ref) > TOLERANCE) out.push(`${name}: ${r.ans} sits ${(r.dy - ref).toFixed(2)}px off ${r.ctx === 'pill' ? "the icon's centre" : 'its text'}`);
    }
    if (icon) {
      for (const k of ['h', 'padL', 'gap']) {
        const diff = checks[0][k] - icon[k];
        if (Math.abs(diff) > TOLERANCE) out.push(`${name}: a check pill's ${k} is ${diff.toFixed(2)}px off the icon pill's`);
      }
    }
  }
  return out;
}

describe('every check is the same size, height and gap as its siblings', { skip: skipWithoutChrome(resolveChrome()) }, () => {
  const chrome = resolveChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-check-marks-'));
  let browser;
  let html;

  async function rowsWith(css) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      if (css) await page.addStyleTag({ content: css });
      return await page.evaluate(measure);
    } finally {
      await page.close();
    }
  }

  before(async () => {
    const md = path.join(tmp, 'checks.md');
    html = path.join(tmp, 'checks.html');
    fs.writeFileSync(md, deck());
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, html, '-q'], {
      cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, CHROME_PATH: chrome },
    });
    assert.equal(r.status, 0, `render failed: ${r.stderr || r.stdout}`);
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  });
  after(async () => {
    await browser?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('the measurement reached every slide and context (or the assertion below proves nothing)', { timeout: TIMEOUT }, async () => {
    const rows = await rowsWith(null);
    const checks = rows.filter((r) => r.ans !== 'icon');
    // Per style: a pill and a bare disc per answer and size, then a verdict-grid pill, a pricing row, a checklist row,
    // a state-cells cell, a matrix cell and a matrix pill per answer (the grid's second option adds one pill).
    assert.equal(checks.length, STYLES.length * (SIZES.length * ANSWERS.length * 2 + ANSWERS.length * 6 + 1));
    assert.equal(rows.filter((r) => r.ans === 'icon').length, STYLES.length * SIZES.length);
  });

  test('every answer matches its siblings, and every check pill matches the icon pill', { timeout: TIMEOUT }, async () => {
    assert.deepEqual(outliers(await rowsWith(null)), []);
  });

  test('the instrument goes red on the old hollow ring', { timeout: TIMEOUT }, async () => {
    // The old recipe: a fixed box (`--_disc`, no give-back for the rim) and a 2.2px OUTER ring on the hollow answers.
    const old = 'section .state.todo, section .state.unknown { --state-ring-outer-w: 2.2px !important; --state-ring-inner-w: 0px !important; }'
      + ' section .lat-state { width: var(--_disc) !important; height: var(--_disc) !important; }';
    const found = outliers(await rowsWith(old));
    assert.ok(found.some((f) => /answers' d spans 4\.[0-9]/.test(f)), `the old ring went unseen: ${found.slice(0, 4).join('; ')}`);
  });
});
