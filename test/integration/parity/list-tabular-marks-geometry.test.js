/**
 * THE MARKS CELL, MEASURED WHERE IT IS PAINTED.
 *
 * Every earlier guard on this feature was a CSS string scan or a DOM-shape assertion,
 * and an adversarial pass found six defects live in the tree with all of them green.
 * They have one thing in common: each is a fact about the LAID-OUT box, which no
 * amount of reading the stylesheet can reach.
 *
 * The worst of them is why this file exists. The marks cell was given `grid-column:4`
 * and, deliberately, no `grid-row` — the commit said auto-placement would then walk
 * the column and stack whatever was already there. It does not: two sibling rules
 * (then `> ul > li:first-child` and `> ul > li:nth-child(2)`, now the identity-based
 * `> ul > li:nth-child(N of :not(.marks))`) were the SAME specificity and came earlier
 * in source, so the cell won its column and inherited their `grid-row:1`.
 * A grid item does not push — it paints over. The component's own documented shape
 * (an inline meta `code`, a clause, a marks bullet) therefore rendered with the meta
 * completely invisible under the pill, on base, register, metric and spec alike. The
 * replacing unit test scanned rules whose selector text contains `li.marks`, so it
 * could not see a `grid-row` arriving from a selector that does not.
 *
 * So this drives the real emulator, opens the laid-out DOM in Chromium, and asserts
 * rectangles. Needs Chromium + the emulator.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, '.scratch', 'marks-geometry');

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

function render(key, markdown) {
  fs.mkdirSync(OUT, { recursive: true });
  const md = path.join(OUT, `${key}.md`);
  const pdf = path.join(OUT, `${key}.pdf`);
  fs.writeFileSync(md, markdown);
  execFileSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), md, pdf, '-q'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000,
  });
  const html = pdf.replace(/\.pdf$/, '.html');
  if (!fs.existsSync(html)) throw new Error(`no HTML sidecar for ${key}`);
  return html;
}

const deck = (body, front = '') =>
  `---\nmarp: true\ntheme: indaco\n${front}---\n\n${body.trim()}\n`;

/** Per slide: the ol's computed tracks, and every trailing-column box with its rect. */
const PROBE = () =>
  [...document.querySelectorAll('section')].map((s) => {
    const ol = s.querySelector('ol');
    if (!ol) return null;
    const box = (e) => {
      const r = e.getBoundingClientRect();
      return { t: (e.textContent || '').trim().slice(0, 16), x: r.x, y: r.y, w: r.width, h: r.height };
    };
    // The row NAME is a bare text node with no element to select, so it can only be
    // auto-placed — which is exactly why it is the thing that moves when anything
    // else changes what cells are occupied. Measured with a Range.
    let nameX = null;
    const row = ol.querySelector(':scope > li');
    for (const n of (row ? row.childNodes : [])) {
      if (n.nodeType === 3 && n.nodeValue.trim()) {
        const rg = document.createRange();
        rg.selectNodeContents(n);
        const rr = rg.getBoundingClientRect();
        if (rr.width > 0) { nameX = rr.x - ol.getBoundingClientRect().x; break; }
      }
    }
    return {
      cls: s.className,
      nameX,
      olWidth: Math.round(ol.getBoundingClientRect().width),
      cols: getComputedStyle(ol).gridTemplateColumns.split(' ').map((v) => Math.round(parseFloat(v))),
      olHeight: Math.round(ol.getBoundingClientRect().height),
      // Everything that competes for the trailing column, each measured once.
      // `nth-child(2 of :not(.marks))` and NOT `nth-child(2)`: roles in the sublist are
      // keyed to identity now, so on a marker-FIRST row the second child is the clause,
      // which lives in column 3 and does not compete for this cell at all. Selecting it
      // positionally would report a false collision — and would not have fired on any
      // fixture in this file, every one of which happens to put the marker last.
      // A pill INSIDE the marks cell is `li > code` too, so the raw set contains
      // ancestor/descendant pairs — a cell always "overlaps" its own child. Keep only
      // the outermost box of each nesting chain, which is what competes for the cell.
      trailing: [...s.querySelectorAll('li.marks, li > code, li > ul > li:nth-child(2 of :not(.marks))')]
        .filter((e, _i, a) => !a.some((o) => o !== e && o.contains(e)))
        .map(box),
      discs: [...s.querySelectorAll('li.marks .state, .split-pt-b .state, .split-pt-line .state')].map((e) => {
        const r = e.getBoundingClientRect();
        return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
      }),
    };
  }).filter(Boolean);

/** Any two trailing boxes whose rectangles intersect — i.e. one painted over another. */
function collisions(slide) {
  const hit = [];
  for (let a = 0; a < slide.trailing.length; a++) {
    for (let b = a + 1; b < slide.trailing.length; b++) {
      const A = slide.trailing[a];
      const B = slide.trailing[b];
      if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) hit.push(`${A.t} × ${B.t}`);
    }
  }
  return hit;
}

describe('list-tabular marks cell — laid-out geometry', () => {
  let browser;
  let slides;
  let noFormStageCount;
  let noFormOlHeight;

  before(async () => {
    const html = render(
      'cases',
      deck(`
<!-- _class: list-tabular -->

## Inline meta plus a marks bullet.

1. Alpha \`Q3 2019\`
   - The clause for alpha.
   - [x] \`stable\`
2. Beta \`Q4 2019\`
   - [x] \`shipped\`

---

<!-- _class: list-tabular register -->

## Two marks bullets on one row.

1. Alpha
   - Clause.
   - [x] \`one\`
   - [ ] \`two\`

---

<!-- _class: list-tabular def -->

## def, two marks bullets.

1. Label \`Term\`
   - Clause.
   - [x] \`one\`
   - [ ] \`two\`

---

<!-- _class: list-tabular spec stacked -->

## spec stacked, two marks bullets.

1. \`GET /a\` \`200\`
   - Clause.
   - [x] \`one\`
   - [ ] \`two\`

---

<!-- _class: list-tabular fit-body -->

## fit-body with no trailing content anywhere.

1. Alpha
   - Short.

---

<!-- _class: list-tabular flex-meta -->

## flex-meta with no trailing content anywhere.

1. Alpha
   - Short.

---

<!-- _class: list-tabular spec fixed -->

## spec fixed, unbreakable token.

1. \`ALPHA_KEY\` \`string\`
   - Averyveryverylongunbreakabletokenthatgoesonandonandonandonandonandonandonandonandonandonandonandonandonandonandonandonwithoutasinglespaceanywhereinit.
`),
    );
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    slides = await page.evaluate(PROBE);

    // A SECOND deck, because `form: off` is deck-level front matter and a `no-form`
    // slide class does not reproduce it (measured: the class still gets a stage).
    const nf = render(
      'no-form',
      deck(
        `<!-- _class: list-tabular def -->\n\n## def with no form.\n\n1. Label \`Term\`\n   - One clause under each term.\n2. Chip \`Role\`\n   - Another clause here.\n`,
        'form: off\n',
      ),
    );
    const nfPage = await browser.newPage();
    await nfPage.setViewport({ width: 1280, height: 720 });
    await nfPage.goto(`file://${nf}`, { waitUntil: 'networkidle0' });
    [noFormStageCount, noFormOlHeight] = await nfPage.evaluate(() => [
      document.querySelectorAll('section.list-tabular .cell-stage').length,
      Math.round(document.querySelector('section.list-tabular ol').getBoundingClientRect().height),
    ]);
  });

  after(async () => { if (browser) await browser.close(); });

  test('the fixture is real — every slide has an ol and something in its trailing column', () => {
    // ANTI-VACUITY. Every assertion below is over a list; an empty probe passes them all.
    assert.equal(slides.length, 7);
    for (const s of slides.slice(0, 4)) {
      assert.ok(s.trailing.length >= 2, `${s.cls}: only ${s.trailing.length} trailing boxes`);
    }
    assert.ok(slides.slice(0, 4).every((s) => s.discs.length >= 1));
  });

  test('nothing in the trailing column is painted over — not on any variant', () => {
    // Base + an inline meta, register with two marks, def (a two-row span), and
    // spec.stacked (whose own `> ul > li` rule pins row 2). All four collided before.
    for (const s of slides.slice(0, 4)) {
      assert.deepEqual(collisions(s), [], `${s.cls}: overlapping boxes in the trailing column`);
    }
  });

  test('the inline meta sits on its own line, not on the marks cell', () => {
    // The earlier form of this arm asserted the meta had a box, which a painted-over
    // box also has — it passed with the flagship defect restored. What distinguishes
    // the two states is the meta's Y: stacked, it is on a different line from the
    // marks cell; collided, it is on the same one.
    const s = slides[0];
    const metas = s.trailing.filter((b) => /Q[34] 2019/.test(b.t));
    const marks = s.trailing.filter((b) => !/Q[34] 2019/.test(b.t));
    assert.equal(metas.length, 2, 'both row metas are present');
    assert.ok(marks.length >= 2, 'both marks cells are present');
    for (const m of metas) {
      assert.ok(m.w > 4 && m.h > 4, `meta painted ${m.w}x${m.h}`);
      const sharesLine = marks.some((k) => Math.abs(k.y - m.y) < Math.min(k.h, m.h) / 2);
      assert.ok(!sharesLine, `meta "${m.t}" shares a line with a marks cell — they are on one grid cell`);
    }
  });

  test('the row name stays in the label column, whatever else is in the row', () => {
    // The name has no element to select, so the grid auto-places it — and it is FIRST
    // in document order, so any trailing cell left free is a cell the name will take.
    // A `def` row with an eyebrow and a marks bullet put the name at the slide's right
    // edge in display serif; the collision arm above was green on that slide, because
    // the name did not overlap anything, it had simply moved.
    for (const s of slides) {
      if (s.nameX === null) continue;
      assert.ok(
        s.nameX < s.olWidth * 0.6,
        `${s.cls}: the row name is ${Math.round(s.nameX)}px into a ${s.olWidth}px list — it is in the trailing column`,
      );
    }
  });

  test('dropping the trailing column never leaves the counter absorbing the slack', () => {
    // `fit-body` and `flex-meta` put the list's only flexible track in the trailing
    // column. An earlier cut dropped that track when nothing filled it, so no `fr`
    // remained and the `auto` counter track took the free space — measured at 972px
    // against a normal ~24px, with the row shoved to the slide's right edge.
    for (const s of [slides[4], slides[5]]) {
      assert.ok(s.cols[0] < 120, `${s.cls}: counter track is ${s.cols[0]}px`);
    }
  });

  test('`def` still centers when there is no cell-stage to center it', () => {
    // def's centering moved onto `> .cell-stage`, which the masthead lift builds ONLY
    // under `form` — and `form: off` is a supported deck register. Without the stage
    // nothing centered and the register jammed under the title with two thirds of the
    // slide blank. NOTE the fixture: a `no-form` slide CLASS still gets a stage, so it
    // does not reproduce this; only deck-level `form: off` does.
    assert.equal(noFormStageCount, 0, 'the form:off fixture still built a cell-stage — it proves nothing');
    assert.ok(
      noFormOlHeight > 300,
      `a form:off def list is ${noFormOlHeight}px tall — it is hugging its rows, not filling and centering`,
    );
  });

  test('`spec fixed` keeps its bounded tracks — no track collapses to zero', () => {
    // Base `fixed` restores a bare `1fr` body track, which is right for the base row
    // and wrong for spec, whose tracks are `minmax(0, …)` so a long mono key wraps
    // inside its cell. Inheriting the bare `1fr` set every other track to 0px.
    const s = slides[6];
    assert.ok(s.cols.every((c) => c > 0), `spec fixed tracks: ${s.cols.join(' / ')}`);
    // The failure is not merely "a track is zero" — it is that the unbreakable token
    // takes the whole row. Bounded tracks keep the body under two thirds of the list.
    const total = s.cols.reduce((a, c) => a + c, 0);
    assert.ok(s.cols[2] / total < 0.75, `spec fixed body track is ${Math.round((s.cols[2] / total) * 100)}% of the row`);
  });
});

describe('list-tabular marks cell — the split carousel', () => {
  let browser;
  let discs;

  before(async () => {
    // Three row shapes, because `lib/core/carousel.js` emits `.split-pt-line` only for a
    // row with two or more sub-bullets — so a marks-only row lands in `.split-pt-b`, and
    // a loose row puts the disc one `<p>` deeper. A direct-child selector drew only one
    // of the three, and a reader paging a split ledger silently lost the other two while
    // the accessibility tree still announced them.
    const rows = [];
    for (let i = 1; i <= 6; i++) {
      if (i % 3 === 1) rows.push(`${i}. Row ${i}\n\n   - Clause ${i}.\n\n   - [x] \`stable\`\n`);
      else if (i % 3 === 2) rows.push(`${i}. Row ${i}\n   - [x] \`stable\`\n`);
      else rows.push(`${i}. Row ${i}\n   - Clause ${i}.\n   - [x] \`stable\`\n`);
    }
    const html = render(
      'split',
      deck(`<!-- _class: list-tabular -->\n\n## Six rows.\n\n${rows.join('')}`, 'size: square\n'),
    );
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    discs = await page.evaluate(() =>
      [...document.querySelectorAll('section.list-tabular-points')].map((s) => {
        const st = s.querySelector('.state');
        if (!st) return null;
        const r = st.getBoundingClientRect();
        return { host: st.parentElement.className || st.parentElement.tagName, w: r.width, h: r.height };
      }),
    );
  });

  after(async () => { if (browser) await browser.close(); });

  test('every split page draws its status disc, whichever shape the row was', () => {
    // `discs` carries a null for a page with no disc, so counting the ARRAY says
    // nothing — the floor has to count the discs that exist, and then separately
    // insist that none is missing.
    const found = discs.filter(Boolean);
    assert.equal(found.length, discs.length, 'a split page lost its disc entirely');
    assert.ok(found.length >= 6, `only ${found.length} split pages carried a disc`);
    // All THREE host shapes, named — the carousel emits `.split-pt-line` only for a
    // row with two or more sub-bullets, so a marks-only row lands in `.split-pt-b`
    // and a loose row is a `<p>` deeper. `>= 2` would pass with one shape gone.
    const hosts = new Set(found.map((d) => d.host));
    for (const h of ['P', 'split-pt-b', 'split-pt-line']) {
      assert.ok(hosts.has(h), `the fixture never produced a ${h} host: ${[...hosts].join(', ')}`);
    }
    for (const d of found) {
      assert.ok(d.w > 4 && d.h > 4, `a disc on a ${d.host} page painted ${d.w}x${d.h}`);
    }
  });
});
