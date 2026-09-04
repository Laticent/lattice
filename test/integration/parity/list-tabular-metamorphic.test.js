/**
 * METAMORPHIC TESTS for the list-tabular marks cell.
 *
 * WHY THIS FILE EXISTS. Five rounds of example-based tests failed to hold this
 * feature, and they failed the same way each time: to write one, I have to know
 * what the right answer LOOKS like for a particular deck, and I kept picking
 * fixtures that happened to sit in the one arrangement where the bug does not
 * show. The flagship defect of round four — the marks cell painting over the row's
 * meta — shipped past an arm written to catch it, because that arm's fixture had
 * no meta. Round five's `grid-row:1` fix shipped with two guards that could not
 * fail: one fixture had no slide where the fix mattered, and the other's regex
 * matched the word `grid-row:1` inside a COMMENT.
 *
 * That is the oracle problem, and it does not get better by writing more examples.
 *
 * A metamorphic test does not need to know the right answer. It asserts a RELATION
 * between the outputs of two related inputs, and a relation is checkable over
 * generated decks without anyone deciding in advance what each should look like.
 *
 * THE CENTRAL RELATION: adding a status to a row must not move the row.
 *
 * Every one of the twenty-five defects this feature shipped is a violation of it:
 *
 *   · the row name jumped to the trailing column          (name.x moved)
 *   · the inline meta was painted over                    (meta box moved onto the cell)
 *   · a 24px counter track grew to 972px                  (track 1 moved)
 *   · the legacy meta vanished under the pill             (its box moved)
 *   · `def`'s clause changed baseline on marked rows      (clause.y moved)
 *   · `spec fixed` collapsed two tracks to zero           (tracks moved)
 *
 * None of those needed an oracle. Each needed only: render the row, render it again
 * with a status attached, and check that nothing else moved.
 *
 * THE SECOND RELATION: where the status sits in the sublist must not matter. The
 * component's own docs promise "it can follow any sublist element", so a deck with
 * the marker bullet first must lay out identically to the same deck with it last.
 * That is a promise the component makes, so it is a relation, not an opinion — and
 * it is exactly what round five broke.
 *
 * Needs Chromium + the emulator: these are facts about laid-out boxes.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, '.scratch', 'marks-metamorphic');

function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

// ── The input space ────────────────────────────────────────────────────────────
// Deliberately the axes that re-point columns, because that is where the defects
// lived: each variant sends its `code` somewhere different, and each column
// modifier changes which track is flexible.
const VARIANTS = ['', 'def', 'spec', 'spec stacked', 'metric', 'register'];
const MODIFIERS = ['', 'fit-name', 'fit-body', 'fit-meta', 'flex-name', 'flex-meta', 'fixed'];
const MARKS = '   - [x] `tracked`\n';

/** One row, with the pieces each axis turns on or off. */
function row(n, { meta, legacy, marks, marksFirst }) {
  const name = `Rowname${n}` + (meta ? ' `META`' : '');
  const sub = [];
  if (marks && marksFirst) sub.push(MARKS);
  sub.push(`   - The clause for row ${n}.\n`);
  if (legacy) sub.push('   - _Q3 2019_\n');
  if (marks && !marksFirst) sub.push(MARKS);
  return `${n}. ${name}\n${sub.join('')}`;
}

function slide(cls, body, key) {
  return `\n<!-- _class: ${['list-tabular', cls].filter(Boolean).join(' ')} -->\n<!-- _footer: "${key}" -->\n\n## ${key}\n\n${body}\n---\n`;
}

function render(key, markdown) {
  fs.mkdirSync(OUT, { recursive: true });
  const md = path.join(OUT, `${key}.md`);
  const pdf = path.join(OUT, `${key}.pdf`);
  fs.writeFileSync(md, markdown);
  execFileSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), md, pdf, '-q'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 900000,
  });
  const html = pdf.replace(/\.pdf$/, '.html');
  if (!fs.existsSync(html)) throw new Error(`no HTML sidecar for ${key}`);
  return html;
}

/**
 * A slide's layout signature: the ol's tracks, and every piece of the FIRST row
 * with its box. Positions are relative to the list, so a slide that simply sits
 * lower on the page does not read as a difference.
 */
const PROBE = () =>
  [...document.querySelectorAll('section.list-tabular')].map((s) => {
    const ol = s.querySelector('ol');
    if (!ol) return null;
    const o = ol.getBoundingClientRect();
    const rel = (r) => ({ x: Math.round((r.x - o.x) * 10) / 10, y: Math.round((r.y - o.y) * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
    const li = ol.querySelector(':scope > li');
    const pieces = { name: null, codes: [], subs: [] };
    if (li) {
      for (const n of li.childNodes) {
        if (n.nodeType === 3 && n.nodeValue.trim()) {
          const rg = document.createRange();
          rg.selectNodeContents(n);
          const rr = rg.getBoundingClientRect();
          if (rr.width > 0 && pieces.name === null) pieces.name = rel(rr);
        }
      }
      for (const c of li.querySelectorAll(':scope > code')) pieces.codes.push(rel(c.getBoundingClientRect()));
      for (const sub of li.querySelectorAll(':scope > ul > li')) {
        pieces.subs.push({ marks: sub.classList.contains('marks'), t: (sub.textContent || '').trim().slice(0, 18), ...rel(sub.getBoundingClientRect()) });
      }
    }
    return {
      key: (s.querySelector('.lat-footer, .cell-footer')?.textContent || '').trim(),
      cls: s.className,
      cols: getComputedStyle(ol).gridTemplateColumns.split(' ').map((v) => Math.round(parseFloat(v) * 10) / 10),
      olW: Math.round(o.width),
      ...pieces,
    };
  }).filter(Boolean);

/** Boxes that must not intersect: nothing may be painted over. */
function overlaps(sig) {
  const boxes = [...sig.codes.map((b, i) => ({ t: `code${i}`, ...b })), ...sig.subs.map((b) => ({ t: b.t, ...b }))];
  const hit = [];
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a];
      const B = boxes[b];
      if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) hit.push(`${A.t} × ${B.t}`);
    }
  }
  return hit;
}


/**
 * INHERITED VIOLATIONS — measured, attributed, and pinned so they cannot grow.
 *
 * The relations below are absolute: they say what a correct ledger looks like, not
 * what this branch changed. Some of what they catch predates the branch, and the
 * attribution is not a judgment call — the same generated deck rendered with the
 * stylesheet at the merge-base and at HEAD gives:
 *
 *     504 slides compared
 *     NEW name-in-trailing-column   0
 *     NEW overlaps                  0
 *     FIXED name displacement      20
 *     FIXED overlaps              154
 *
 * So every entry here is something the component already did. Two families:
 *
 * · `spec` / `spec stacked` with a BARE NAME beside a `code`. spec's contract is
 *   two codes (`` `KEY` `type` ``) and no bare name — the generator emits the
 *   off-contract shape on purpose, to see what happens. The name has no element to
 *   select, so it auto-places into whatever cell is free, which on spec is the
 *   trailing one.
 * · the inline meta `code` and the legacy three-line meta, which have both been
 *   `grid-column:4; grid-row:1` since before this branch and so paint over each
 *   other on a row carrying both.
 *
 * BOTH WERE TRIED AND REVERTED, which is why they are pinned rather than fixed.
 * Giving the legacy meta the marks cell's auto-row treatment frees column 4 row 1,
 * and the row name immediately takes it: I1 went 29 → 44 and R2 0 → 7 on that one
 * change. Fixing these properly means giving the row name a real element to sit in,
 * which is a markup change across both render paths — off this change's path
 * (HARD RULE #18), and now with a measurement saying why.
 *
 * The list is EXACT, not a budget: a new violation fails, and so does a stale entry
 * once one of these is fixed for real.
 */
const INHERITED = {
  R1: new Set([
  "spec stacked|-|meta|legacy: track 1 974.7 \u2192 927.7",
  "spec stacked|-|meta|nolegacy: track 1 974.7 \u2192 927.7",
  "spec stacked|-|nometa|legacy: track 1 1060.7 \u2192 927.7",
  "spec stacked|-|nometa|nolegacy: track 1 1060.7 \u2192 927.7",
  "spec stacked|fit-meta|meta|legacy: track 1 974.7 \u2192 927.7",
  "spec stacked|fit-meta|meta|nolegacy: track 1 974.7 \u2192 927.7",
  "spec stacked|fit-meta|nometa|legacy: track 1 1060.7 \u2192 927.7",
  "spec stacked|fit-meta|nometa|nolegacy: track 1 1060.7 \u2192 927.7",
  "spec stacked|fit-name|meta|legacy: track 1 974.7 \u2192 927.7",
  "spec stacked|fit-name|meta|nolegacy: track 1 974.7 \u2192 927.7",
  "spec stacked|fit-name|nometa|legacy: track 1 1060.7 \u2192 927.7",
  "spec stacked|fit-name|nometa|nolegacy: track 1 1060.7 \u2192 927.7",
  "spec|-|meta|nolegacy: clause x 112.4 \u2192 174.7",
  "spec|-|meta|nolegacy: code0 right edge 88.30000000000001 \u2192 150.7",
  "spec|-|meta|nolegacy: track 0 23.6 \u2192 86",
  "spec|fit-body|meta|nolegacy: clause x 112.4 \u2192 174.7",
  "spec|fit-body|meta|nolegacy: code0 right edge 88.30000000000001 \u2192 150.7",
  "spec|fit-body|meta|nolegacy: track 0 23.6 \u2192 86",
  "spec|fit-meta|meta|nolegacy: clause x 112.4 \u2192 174.7",
  "spec|fit-meta|meta|nolegacy: code0 right edge 88.30000000000001 \u2192 150.7",
  "spec|fit-meta|meta|nolegacy: track 0 23.6 \u2192 86",
  "spec|fit-name|meta|nolegacy: clause x 112.4 \u2192 174.7",
  "spec|fit-name|meta|nolegacy: code0 right edge 88.30000000000001 \u2192 150.7",
  "spec|fit-name|meta|nolegacy: track 0 23.6 \u2192 86",
  "spec|flex-meta|meta|nolegacy: clause x 112.4 \u2192 174.7",
  "spec|flex-meta|meta|nolegacy: code0 right edge 88.30000000000001 \u2192 150.7",
  "spec|flex-meta|meta|nolegacy: track 0 23.6 \u2192 86",
  "spec|flex-name|meta|nolegacy: code0 right edge 88.30000000000001 \u2192 150.7"
]),
  I1: new Set([
  "A:spec stacked|-|meta|legacy name at 1066 of 1152",
  "A:spec stacked|-|meta|nolegacy name at 1066 of 1152",
  "A:spec stacked|fit-meta|meta|legacy name at 1066 of 1152",
  "A:spec stacked|fit-meta|meta|nolegacy name at 1066 of 1152",
  "A:spec stacked|fit-name|meta|legacy name at 1066 of 1152",
  "A:spec stacked|fit-name|meta|nolegacy name at 1066 of 1152",
  "A:spec stacked|fixed|meta|legacy name at 972 of 1152",
  "A:spec stacked|fixed|meta|nolegacy name at 972 of 1152",
  "A:spec|-|meta|nolegacy name at 1066 of 1152",
  "A:spec|fit-meta|meta|nolegacy name at 1066 of 1152",
  "A:spec|fit-name|meta|nolegacy name at 1066 of 1152",
  "A:spec|fixed|meta|nolegacy name at 972 of 1152",
  "A:spec|flex-name|meta|nolegacy name at 1066 of 1152",
  "B:spec stacked|-|meta|legacy name at 1019 of 1152",
  "B:spec stacked|-|meta|nolegacy name at 1019 of 1152",
  "B:spec stacked|fit-meta|meta|legacy name at 1019 of 1152",
  "B:spec stacked|fit-meta|meta|nolegacy name at 1019 of 1152",
  "B:spec stacked|fit-name|meta|legacy name at 1019 of 1152",
  "B:spec stacked|fit-name|meta|nolegacy name at 1019 of 1152",
  "B:spec stacked|fixed|meta|legacy name at 972 of 1152",
  "B:spec stacked|fixed|meta|nolegacy name at 972 of 1152",
  "C:spec stacked|-|meta|legacy name at 1019 of 1152",
  "C:spec stacked|-|meta|nolegacy name at 1019 of 1152",
  "C:spec stacked|fit-meta|meta|legacy name at 1019 of 1152",
  "C:spec stacked|fit-meta|meta|nolegacy name at 1019 of 1152",
  "C:spec stacked|fit-name|meta|legacy name at 1019 of 1152",
  "C:spec stacked|fit-name|meta|nolegacy name at 1019 of 1152",
  "C:spec stacked|fixed|meta|legacy name at 972 of 1152",
  "C:spec stacked|fixed|meta|nolegacy name at 972 of 1152"
]),
  R3: new Set([
  "B:base|-|meta|legacy code0 \u00d7 Q3 2019",
  "B:base|fit-body|meta|legacy code0 \u00d7 Q3 2019",
  "B:base|fit-meta|meta|legacy code0 \u00d7 Q3 2019",
  "B:base|fit-name|meta|legacy code0 \u00d7 Q3 2019",
  "B:base|fixed|meta|legacy code0 \u00d7 Q3 2019",
  "B:base|flex-meta|meta|legacy code0 \u00d7 Q3 2019",
  "B:base|flex-name|meta|legacy code0 \u00d7 Q3 2019",
  "B:def|-|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:def|-|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:def|fit-body|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:def|fit-body|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:def|fit-meta|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:def|fit-meta|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:def|fit-name|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:def|fit-name|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:def|fixed|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:def|fixed|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:def|flex-meta|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:def|flex-meta|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:def|flex-name|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:def|flex-name|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:metric|-|meta|legacy code0 \u00d7 Q3 2019",
  "B:metric|fit-body|meta|legacy code0 \u00d7 Q3 2019",
  "B:metric|fit-meta|meta|legacy code0 \u00d7 Q3 2019",
  "B:metric|fit-name|meta|legacy code0 \u00d7 Q3 2019",
  "B:metric|fixed|meta|legacy code0 \u00d7 Q3 2019",
  "B:metric|flex-meta|meta|legacy code0 \u00d7 Q3 2019",
  "B:metric|flex-name|meta|legacy code0 \u00d7 Q3 2019",
  "B:register|-|meta|legacy code0 \u00d7 Q3 2019",
  "B:register|fit-body|meta|legacy code0 \u00d7 Q3 2019",
  "B:register|fit-meta|meta|legacy code0 \u00d7 Q3 2019",
  "B:register|fit-name|meta|legacy code0 \u00d7 Q3 2019",
  "B:register|fixed|meta|legacy code0 \u00d7 Q3 2019",
  "B:register|flex-meta|meta|legacy code0 \u00d7 Q3 2019",
  "B:register|flex-name|meta|legacy code0 \u00d7 Q3 2019",
  "B:spec stacked|-|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|-|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|fit-body|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|fit-body|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|fit-meta|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|fit-meta|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|fit-name|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|fit-name|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|fixed|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|fixed|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|flex-meta|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|flex-meta|nometa|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|flex-name|meta|legacy The clause for row \u00d7 Q3 2019",
  "B:spec stacked|flex-name|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:base|-|meta|legacy code0 \u00d7 Q3 2019",
  "C:base|fit-body|meta|legacy code0 \u00d7 Q3 2019",
  "C:base|fit-meta|meta|legacy code0 \u00d7 Q3 2019",
  "C:base|fit-name|meta|legacy code0 \u00d7 Q3 2019",
  "C:base|fixed|meta|legacy code0 \u00d7 Q3 2019",
  "C:base|flex-meta|meta|legacy code0 \u00d7 Q3 2019",
  "C:base|flex-name|meta|legacy code0 \u00d7 Q3 2019",
  "C:def|-|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:def|-|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:def|fit-body|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:def|fit-body|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:def|fit-meta|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:def|fit-meta|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:def|fit-name|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:def|fit-name|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:def|fixed|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:def|fixed|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:def|flex-meta|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:def|flex-meta|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:def|flex-name|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:def|flex-name|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:metric|-|meta|legacy code0 \u00d7 Q3 2019",
  "C:metric|fit-body|meta|legacy code0 \u00d7 Q3 2019",
  "C:metric|fit-meta|meta|legacy code0 \u00d7 Q3 2019",
  "C:metric|fit-name|meta|legacy code0 \u00d7 Q3 2019",
  "C:metric|fixed|meta|legacy code0 \u00d7 Q3 2019",
  "C:metric|flex-meta|meta|legacy code0 \u00d7 Q3 2019",
  "C:metric|flex-name|meta|legacy code0 \u00d7 Q3 2019",
  "C:register|-|meta|legacy code0 \u00d7 Q3 2019",
  "C:register|fit-body|meta|legacy code0 \u00d7 Q3 2019",
  "C:register|fit-meta|meta|legacy code0 \u00d7 Q3 2019",
  "C:register|fit-name|meta|legacy code0 \u00d7 Q3 2019",
  "C:register|fixed|meta|legacy code0 \u00d7 Q3 2019",
  "C:register|flex-meta|meta|legacy code0 \u00d7 Q3 2019",
  "C:register|flex-name|meta|legacy code0 \u00d7 Q3 2019",
  "C:spec stacked|-|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|-|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|fit-body|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|fit-body|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|fit-meta|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|fit-meta|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|fit-name|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|fit-name|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|fixed|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|fixed|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|flex-meta|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|flex-meta|nometa|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|flex-name|meta|legacy The clause for row \u00d7 Q3 2019",
  "C:spec stacked|flex-name|nometa|legacy The clause for row \u00d7 Q3 2019"
]),
};

/** Everything the relation found that is not already on the inherited list. */
function regressions(found, key) {
  return found.filter((f) => !INHERITED[key].has(f));
}

/** Inherited entries that no longer reproduce — the list must not rot. */
function stale(found, key) {
  return [...INHERITED[key]].filter((f) => !found.includes(f));
}

describe('list-tabular marks cell — metamorphic relations', () => {
  let browser;
  let byKey;
  const cases = [];

  before(async () => {
    // R1 pairs: the SAME row, with and without a status attached.
    let deck = '---\nmarp: true\ntheme: indaco\n---\n';
    for (const v of VARIANTS) {
      for (const m of MODIFIERS) {
        for (const meta of [true, false]) {
          for (const legacy of [true, false]) {
            const cls = [v, m].filter(Boolean).join(' ');
            const id = `${v || 'base'}|${m || '-'}|${meta ? 'meta' : 'nometa'}|${legacy ? 'legacy' : 'nolegacy'}`;
            const opts = { meta, legacy };
            deck += slide(cls, [1, 2].map((n) => row(n, opts)).join(''), `A:${id}`);
            deck += slide(cls, [1, 2].map((n) => row(n, { ...opts, marks: true })).join(''), `B:${id}`);
            // R2: the same row again with the status FIRST in the sublist.
            deck += slide(cls, [1, 2].map((n) => row(n, { ...opts, marks: true, marksFirst: true })).join(''), `C:${id}`);
            cases.push(id);
          }
        }
      }
    }
    const html = render('pairs', deck);
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    const sigs = await page.evaluate(PROBE);
    byKey = new Map(sigs.map((s) => [s.key, s]));
  });

  after(async () => { if (browser) await browser.close(); });

  test('the fixture is real — every case rendered all three of its slides', () => {
    // ANTI-VACUITY, and the one this file's predecessors kept getting wrong: every
    // relation below is a loop over cases, so a lookup that silently misses turns
    // the whole suite green over nothing.
    assert.ok(cases.length >= 150, `only ${cases.length} cases generated`);
    for (const id of cases) {
      for (const phase of ['A', 'B', 'C']) {
        assert.ok(byKey.get(`${phase}:${id}`), `slide ${phase}:${id} did not render`);
      }
    }
    // And the status must actually be decoding, or "nothing moved" is trivially true.
    const withMarks = cases.filter((id) => (byKey.get(`B:${id}`).subs || []).some((s) => s.marks));
    assert.equal(withMarks.length, cases.length, 'some B slides produced no marks cell at all');
  });

  test('R1 — attaching a status does not move the row, where no track can reallocate', () => {
    // SCOPED, and the scope is the point. A first cut asserted "nothing moves at all"
    // and flagged two behaviors that are correct: the trailing track WIDENS to fit a
    // wider cell (so a right-aligned meta's left edge legitimately moves left, while
    // its right edge does not), and under `flex-name` the label track is explicitly
    // the one that gives up space to the trailing column. A relation that fires on
    // correct behavior gets switched off, so it is worth less than no relation.
    //
    // What survives is the honest core: on a row whose upstream tracks are content-
    // sized, attaching a status must not move the counter track, the name, or the
    // clause — and on ANY row the trailing column's RIGHT edge must not move, because
    // flush-right is this column's whole contract.
    const moved = [];
    for (const id of cases) {
      const a = byKey.get(`A:${id}`);
      const b = byKey.get(`B:${id}`);
      const reallocates = /flex-name/.test(id);
      if (!reallocates) {
        for (const i of [0, 1]) {
          if (Math.abs((a.cols[i] ?? 0) - (b.cols[i] ?? 0)) > 1) moved.push(`${id}: track ${i} ${a.cols[i]} → ${b.cols[i]}`);
        }
        const ac = a.subs.find((s) => !s.marks);
        const bc = b.subs.find((s) => !s.marks);
        if (ac && bc && Math.abs(ac.x - bc.x) > 1) moved.push(`${id}: clause x ${ac.x} → ${bc.x}`);
      }
      // The right edge, always. A meta that was flush before must be flush after.
      for (let i = 0; i < Math.min(a.codes.length, b.codes.length); i++) {
        const ar = a.codes[i].x + a.codes[i].w;
        const br = b.codes[i].x + b.codes[i].w;
        if (Math.abs(ar - br) > 1.5) moved.push(`${id}: code${i} right edge ${ar} → ${br}`);
      }
    }
    assert.deepEqual(regressions(moved, 'R1'), [], 'attaching a status moved something new');
    assert.deepEqual(stale(moved, 'R1'), [], 'an inherited R1 entry no longer reproduces — remove it');
  });

  test('I1 — the row name is in the label column, in every render', () => {
    // An INVARIANT, not a relation: a name in the trailing column is wrong whether or
    // not a status is attached. Stated this way it also catches the shape a pair-wise
    // relation cannot — one where BOTH renders are wrong in the same way.
    const bad = [];
    for (const id of cases) {
      for (const phase of ['A', 'B', 'C']) {
        const s = byKey.get(`${phase}:${id}`);
        if (s.name && s.name.x > s.olW * 0.6) bad.push(`${phase}:${id} name at ${s.name.x} of ${s.olW}`);
      }
    }
    assert.deepEqual(regressions(bad, 'I1'), [], 'a new row puts its name in the trailing column');
    assert.deepEqual(stale(bad, 'I1'), [], 'an inherited I1 entry no longer reproduces — remove it');
  });

  test('I2 — the counter track never absorbs the row', () => {
    // The 972px counter and the 86px counter were both this: an `auto` track taking
    // free space no other track claimed. A counter holds two or three digits.
    const bad = [];
    for (const id of cases) {
      for (const phase of ['A', 'B', 'C']) {
        const s = byKey.get(`${phase}:${id}`);
        if (s.cols[0] > s.olW * 0.12) bad.push(`${phase}:${id} counter track ${s.cols[0]} of ${s.olW}`);
      }
    }
    assert.deepEqual(bad, [], `${bad.length} rows let the counter absorb the row`);
  });

  test('R2 — where the status sits in the sublist does not change the layout', () => {
    // The component's docs promise the marker bullet "can follow any sublist
    // element". That is a promise, so it is a relation: first and last must render
    // the same. Round five broke exactly this on `def`.
    const differs = [];
    for (const id of cases) {
      const last = byKey.get(`B:${id}`);
      const first = byKey.get(`C:${id}`);
      const lm = last.subs.find((s) => s.marks);
      const fm = first.subs.find((s) => s.marks);
      if (!lm || !fm) { differs.push(`${id}: a marks cell is missing`); continue; }
      if (Math.abs(lm.x - fm.x) > 1 || Math.abs(lm.w - fm.w) > 1) {
        differs.push(`${id}: marks cell ${lm.x}/${lm.w} → ${fm.x}/${fm.w}`);
      }
      const lc = last.subs.find((s) => !s.marks);
      const fc = first.subs.find((s) => !s.marks);
      if (lc && fc && (Math.abs(lc.x - fc.x) > 1 || Math.abs(lc.y - fc.y) > 1)) {
        differs.push(`${id}: clause ${lc.x},${lc.y} → ${fc.x},${fc.y}`);
      }
    }
    assert.deepEqual(differs, [], `${differs.length} cases lay out differently by marker position`);
  });

  test('R3 — nothing in a marked row is painted over, at any marker position', () => {
    const hit = [];
    for (const id of cases) {
      for (const phase of ['B', 'C']) {
        const o = overlaps(byKey.get(`${phase}:${id}`));
        if (o.length) hit.push(`${phase}:${id} ${o.join(', ')}`);
      }
    }
    assert.deepEqual(regressions(hit, 'R3'), [], 'a marked row paints one box over another');
    assert.deepEqual(stale(hit, 'R3'), [], 'an inherited R3 entry no longer reproduces — remove it');
  });

  test('R4 — nothing escapes the list box', () => {
    const out = [];
    for (const id of cases) {
      for (const phase of ['A', 'B', 'C']) {
        const s = byKey.get(`${phase}:${id}`);
        for (const b of [...s.codes, ...s.subs]) {
          if (b.x < -1.5 || b.x + b.w > s.olW + 1.5) out.push(`${phase}:${id} ${b.t || 'code'} at ${b.x}+${b.w} of ${s.olW}`);
        }
      }
    }
    assert.deepEqual(out, [], `${out.length} boxes leave the list`);
  });
});
