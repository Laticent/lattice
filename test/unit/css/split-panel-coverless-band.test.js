/**
 * A COVERLESS `split-panel` SPLIT PAGE PLACES ITS WAYFINDING MARKS, AND RESERVES WHAT THEY COVER.
 *
 * `pullquote` leads with the quotation and carries no `<h2>`, so `readFeature` declines and there
 * is no masthead to build a cover from either: the run is `lat-split-native` BODY pages with no
 * `.cell-footer`. `dockInFooterCell` appends both marks at SECTION level — and on this layout the
 * section IS the panel flex container, so the forward pointer arrives as a flex ITEM of the panel
 * row.
 *
 * This surface was got wrong three times, each by fixing one half:
 *
 *   1. Nothing — at portrait the pointer stacked under the panels into the band and the k-of-N
 *      rail printed through the pill's label (42.1x6.5px), and the pill over the running
 *      footer's ink (206.6x24.5px).
 *   2. `padding-bottom` on the SECTION — closed that at the four tall sizes and at SQUARE cut the
 *      DARK panel short too: a 92.9x629.1px white band under a full-bleed navy field. Reserving
 *      space in a container cannot be right when the mark should not be in the container.
 *   3. The pointer taken out of flow with NO reservation — the panels then get their whole box
 *      back, which is what lets their CONTENT reach the band the opaque pill floats over:
 *      351.5x14.6px of pill fill over a body line, on a page the engine considered to fit. Plus
 *      a `:not(.form)` that left an authored `form` page with every defect of round 1 intact.
 *   4. The reserve on BOTH panels — it closed the `mirror` overprint and inflated the dark panel
 *      at every stacked size, because `.panel-left` in a COLUMN is sized by its content: the
 *      seam moved 49.3% -> 55.0% of the slide at portrait, 35.9% -> 39.4% at story, 29.9% ->
 *      32.6% at mobile. Every geometry probe on the branch said "no overprint" and was right; a
 *      RASTER is what caught it, which is why there is now a seam arm below.
 *
 * THIS ARM RENDERS THE REAL DECKS, and that is the point rather than an implementation detail.
 * Three hand-authored fixtures were tried first and all three were unreachable by the defect:
 * without the section's `data-orientation` / `data-family` stamps the panels never stack, and
 * even with them a hand-built `<ul>` places its lone member ~380px above where the engine places
 * it. Each of those fixtures PASSED with the reservation deleted — a fixture that cannot reach
 * the defect certifies it, which is the same mistake, one level down, as a collision sweep that
 * compares marks only to other marks. So the deck goes through `dist/lattice-emulator.js` and
 * the arms measure what a reader gets (HARD RULE #23).
 *
 * WHAT THE RESERVATION IS FOR, measured rather than assumed — and the earlier answer here was
 * wrong in BOTH directions. It said the reservation could not be pinned because no deck reached
 * the band. The honest answer came from sweeping ONE deck at seven body lengths: 8 and 12 words
 * clear; 16 words prints 351.5x14.6px of pill over the last line WITHOUT the reserve and nothing
 * WITH it; 20, 24, 28 and 32 words print the pill's full 51.5px height over the text either way.
 * `.panel-right` is `overflow: clip`, and a clip edge is the PADDING box, so content past the
 * shortened content box spills straight through. The reservation buys one band of lengths, not
 * all of them, and an arm asserting otherwise would have been asserting a falsehood.
 *
 * What it DOES do is reposition content that FITS, and that has three consequences worth pinning,
 * all of which the arms below cover:
 *
 *   · EVERY PAGE OF A RUN RESERVES THE SAME BAND. The last page carries no forward pointer, so
 *     a `:has(> .lat-split-rel)` version of this rule skipped it — and `space-evenly` then
 *     re-centered that page's member block off its siblings: 38.3px at portrait, 44.3px at
 *     square, 33.4px at story, 31.4px at mobile. A reader pages through seconds apart and the
 *     column jumps.
 *   · THE PANEL THE POINTER CAN REACH, AND ONLY THAT ONE. `mirror` row-reverses the panels — and
 *     beats the portrait column rule, so a mirrored section is a ROW at EVERY size, not just at
 *     square, which is how three write-ups of this defect came to call it square-only. The
 *     pointer then sits over `.panel-left`, and reserving only `.panel-right` printed the pill
 *     through the cite line at all four sizes — opaque pill BOX against cite INK, on this file's
 *     own fixture, page 1: portrait 361.4x51.5, square 305.0x38.5, story 381.6x45.9, mobile
 *     390.1x41.8. (The pill is filled, so its box is the occluder; three earlier write-ups quoted
 *     three different numbers here by not saying which measure they used.) Reserving BOTH fixes
 *     that and breaks the seam, so the `.panel-left` arm is gated on `.mirror` — and the
 *     `.panel-right` arm on `:not(.mirror)`, so each reserves only the panel in the corner.
 *   · THE k-OF-N RAIL NEEDS THE PANEL'S INK. It draws in `currentColor`, and under `mirror` the
 *     bottom-right corner is the panel: 52 of 198 palette/variant cells under WCAG 1.4.11's 3:1,
 *     bottoming out at 1.00:1.
 *
 * MUTATION-PROVED, and the counts are against the 76 arms as they stand today — re-derive them
 * before quoting one, because every count in this file's history was measured against a different
 * number of arms (20, then 40, 56, 64, now 76) AND against a different fixture AND against a
 * different MEASURE. The two columns below are the same mutations counted before and after this
 * round's instrument fixes, which is the only way to see that the CSS did not change under them:
 *
 *     mutation                                          @64   @76
 *     pointer `position: static`                          31    43
 *     the pill's `max-width` clamp deleted                 6    20
 *     the every-page keying → `:has(> .lat-split-rel)`    16    16
 *     the reserve re-gated to ONE named panel              5    14
 *     the Form specificity lift removed                    —     8
 *     the reserve widened to BOTH panels at every size     6     6
 *     the non-mirror `metric` rail arm deleted             4     4
 *     the `form` canvas rail arm deleted                   4     4
 *
 * The two big movers are not new arms, they are the SAME arms given a correct measure: the clamp
 * row went 6 → 20 and the one-named-panel row 5 → 14 when the occluder became the pill's BORDER
 * BOX instead of its text ink, and when `clearsBothEdges` started pinning the clamp's margin
 * rather than mere containment.
 *
 * (The clamp row needs its sanction removed with it, or `build:check` aborts on a stale
 * `SANCTIONED_STAGE_INSETS` entry before the arms ever run — which is the gate working.)
 *
 * EVERY ROW HERE WAS ONCE ZERO, and that — not any one defect — is what this file is about. The
 * `.mirror` reserve reddened nothing while the content probe read `.panel-right` only, because the
 * overprint it catches lands on `.panel-left cite`. The `form` and `metric` rail arms reddened
 * nothing while the file rendered `form` and `mirror` separately and never together, and treated
 * `.panel-right` as always the light one. And the one-named-panel row reddened NOTHING until the
 * fixture carried a 42-character forward label: the pill is as wide as the next page's title, so
 * every "which panel does it sit in" figure taken from the 15- and 21-character titles above was a
 * property of those titles. And the Form row could not redden at all while the wide-label loop ran
 * `['', 'mirror']` over a `before()` that RENDERED five classes: the `form`, `form mirror` and
 * `metric` wide renders were produced and never read, which is how a clamp that never applied on
 * Form pages passed a suite at 64/64.
 *
 * SIX ROUNDS each widened WHICH PAGES OR PANELS the rule covers; what kept being too narrow was
 * the PROBE, along a new axis every time — what it looks at (`.panel-right` only), which decks it
 * looks at (`form` and `mirror` never together), which ELEMENTS it looks at (`querySelector('.seg')`
 * always takes segment 0, which is always the opaque one), which LABEL WIDTHS it feeds them (15 and
 * 21 characters against a 42-character cap), which CLASSES it asserts against (two of the five it
 * renders), and what MEASURE it reads (text ink, on an element that paints as a filled box).
 *
 * The instrument fails the same way the rules did, and it fails while green — which is why the arm
 * added last reads an INVARIANT (`clearsBothEdges`: the pill clears both slide edges by one
 * `--sp-xl`, at any label the engine can emit) rather than a measurement of one fixture. Even that
 * is not a safe habit on its own: its first draft read `--sp-xl` off the SECTION, where a custom
 * property computes to the literal string `calc(3.75 * 10.800px * 1.95)`, so `parseFloat` gave NaN,
 * fell back to 0, and asserted a tautology that passed. It was caught only because its mutation
 * reddened 6 arms where it was predicted to redden 8. ALWAYS PREDICT THE COUNT BEFORE RUNNING THE
 * MUTATION; a green arm and a vacuous one are indistinguishable from the summary line.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.resolve(__dirname, '../../..');
const EMU = path.join(ROOT, 'dist/lattice-emulator.js');

// ONE member per page is what a split page carries, and it is the shape that reaches the band:
// `.panel-right > ul` is `justify-content: space-evenly`, so a lone member sits in the middle of
// a column box that runs to the slide's bottom edge. Four members is the shape that does NOT
// reproduce — they spread, and none lands there.
const deck = (size, cls) => `---
marp: true
theme: indaco
size: ${size}
---

<!-- _class: split-panel pullquote${cls ? ` ${cls}` : ''} -->
<!-- _footer: "pullquote · split-panel pullquote — a running footer long enough to reach across." -->

> pullquote gives half the slide to one voice, and the other half to what it means.

\`split-panel pullquote · the layout, quoted\`

- The quote claims
  - Display italic on the dark panel; keep it under twenty-five words.
- The column interprets
  - Two items that say why the words matter, not who said them again.
- A third reading
  - And a third clause to match.
`;

// THE PILL'S WIDTH IS AN AUTHORING VARIABLE, and it SATURATES rather than samples. Every "which
// panel does it sit in" number this file has quoted came from the 15- and 21-character titles
// above; `relationship.js` clips the forward label at `LABEL_MAX = 42`, so a deck may legitimately
// make the pill wide enough to cross the seam into a panel the rule did not reserve — which is
// exactly what a `:not(.mirror)` gate, measured "safe" on the deck above, reopened on
// `steps mirror`.
//
// But a 42-character string is not the widest case either, and picking one was the NEXT defect:
// `LABEL_MAX` counts UTF-16 CODE UNITS while the pill is sized by RENDERED WIDTH, and those differ
// by ~2.6x between scripts at the same count. A 34-code-unit Japanese title — comfortably inside
// the cap — drove the pill to the full 1080px section width and 79px off the LEFT edge of the
// slide, with `insideSlide` (the arm two hundred lines below, which has existed all along)
// returning false and never running against an input that could reach it.
//
// So the fixture SATURATES the bound instead of sampling a plausible string: 42 `W`s is the widest
// label the cap admits in ASCII, and it drove the pill to 1080px before the clamp went in. A CJK
// title at the same count is wider still — which is the point. The arm asserts the INVARIANT (the
// pill is inside the slide at the widest label the engine will emit), not a measurement of one
// string.
const LONG_TITLE = 'W'.repeat(42);
const wideDeck = (size, cls) => `---
marp: true
theme: indaco
size: ${size}
---

<!-- _class: split-panel ${cls} -->

> pullquote gives half the slide to one voice, and the other half to what it means.

\`split-panel · the layout, quoted\`

${['a', 'b', 'c', 'd'].map(() => `- ${LONG_TITLE}\n  - ${'clause '.repeat(12).trim()}.`).join('\n')}
`;

const SIZES = ['portrait', 'square', 'story', 'mobile'];

describe('split-panel: a coverless split page places its marks and reserves the band', () => {
  const exe = resolveChrome();
  let browser;
  let p;
  let dir;
  const rendered = new Map();

  before(async () => {
    if (!exe) return;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-spband-'));
    for (const size of SIZES) {
      // `form mirror` and `metric` are the CROSS PRODUCT and the INVERTED VARIANT. The file used
      // to render `form` and `mirror` separately and never together, and to treat `.panel-right`
      // as always the light one — which is how the rail-ink rules shipped painting white on white
      // (`form mirror`, 1.00:1) and left a dark panel un-inked (`metric`, 1.02:1). Rendering a
      // representative of each axis is not rendering the matrix.
      for (const cls of ['', 'form', 'mirror', 'form mirror', 'metric']) {
        const key = `${size}|${cls}`;
        const md = path.join(dir, `${size}${cls}.md`);
        const html = path.join(dir, `${size}${cls}.html`);
        fs.writeFileSync(md, deck(size, cls));
        execFileSync(process.execPath, [EMU, md, html, '-q'], { stdio: 'ignore' });
        rendered.set(key, html);
        // The same deck with splitting OFF. The seam arm below reads the panel proportion off
        // THIS render rather than off a number written into the test, so it keeps holding when
        // the layout's own percentages change — and it is the only reference that can say
        // "splitting moved the seam" rather than "the seam is not 49.3%".
        const whole = path.join(dir, `${size}${cls}-whole.html`);
        execFileSync(process.execPath, [EMU, md, whole, '-q', '--no-split'], { stdio: 'ignore' });
        rendered.set(`${key}|whole`, whole);
        // …and the same shape with the forward label at the engine's 42-character cap.
        const wmd = path.join(dir, `${size}${cls}-wide.md`);
        const whtml = path.join(dir, `${size}${cls}-wide.html`);
        fs.writeFileSync(wmd, wideDeck(size, `pullquote${cls ? ` ${cls}` : ''}`));
        execFileSync(process.execPath, [EMU, wmd, whtml, '-q'], { stdio: 'ignore' });
        rendered.set(`${key}|wide`, whtml);
      }
    }
    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    p = await browser.newPage();
  });

  after(async () => {
    if (browser) await browser.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Every coverless split page in the rendered deck, with the geometry the arms ask about. */
  const measure = async (size, cls, variant = '') => {
    await p.goto(`file://${rendered.get(`${size}|${cls}${variant}`)}`, { waitUntil: 'networkidle0' });
    return p.evaluate(() => {
      const ink = (el) => {
        const b = el.getBoundingClientRect();
        if (!(el.textContent || '').trim()) return b;
        const rg = document.createRange(); rg.selectNodeContents(el);
        const i = rg.getBoundingClientRect();
        if (!i.width || !i.height) return b;
        return new DOMRect(Math.max(b.left, i.left), Math.max(b.top, i.top),
          Math.min(b.right, i.right) - Math.max(b.left, i.left), Math.min(b.bottom, i.bottom) - Math.max(b.top, i.top));
      };
      const over = (a, b) => {
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return ox > 0.5 && oy > 0.5 ? { ox: +ox.toFixed(1), oy: +oy.toFixed(1) } : null;
      };
      const out = [];
      document.querySelectorAll('section.split-panel.lat-split-native').forEach((s, i) => {
        const ptr = s.querySelector('.lat-split-rel');
        if (!ptr) return;
        const sr = s.getBoundingClientRect();
        // `--sp-xl` off the SECTION is the wrong source and reads as nothing: a custom property
        // computes to its token value, not a used length, so it comes back as the literal string
        // `calc(3.75 * 10.800px * 1.95)` and `parseFloat` gives NaN. The first draft of the arm
        // below did exactly that, fell back to 0, and asserted a tautology — caught only because
        // its mutation reddened 6 arms where it was predicted to redden 8. The pointer's own
        // computed `right` IS this length, already resolved against the same containing block the
        // clamp resolves against: `78.975px` at portrait, `66.825px` at square.
        const spXl = parseFloat(getComputedStyle(ptr).right) || 0;
        // THE PILL IS FILLED AND BORDERED, so the rect that paints over words — and the rect that
        // can leave the slide — is its BORDER BOX, not its text ink. This was `ink(ptr)`, which
        // sits `padding-left + border` inside the box: 22.5px + 1px at portrait/story/mobile,
        // 16.6px + 1px at square. That made the containment arm blind to any overhang smaller than
        // the pill's own padding, and it understated every overprint this file has quoted by the
        // same amount — while the file's own doctrine, three times over, says "opaque pill BOX
        // against cite INK". The asymmetry is deliberate and is the whole measure: the OCCLUDER is
        // a box because it is opaque, the TARGET is ink because a `li`'s box is far wider than its
        // words. Round 9 found the CJK-34 case reading `insideSlide: true` at -6.2 / -15.9 / -19.9.
        const pi = ptr.getBoundingClientRect();
        const rail = s.querySelector('.lat-split-rail');
        const foot = s.querySelector('footer');
        const pl = s.querySelector('.panel-left').getBoundingClientRect();
        const pr = s.querySelector('.panel-right').getBoundingClientRect();
        // BOTH PANELS. This list was `.panel-right` only, and under `mirror` the pill sits over
        // `.panel-left` — so the mirror arm asserted `overContent === null` against a set that
        // structurally could not contain its own defect, and stayed green with the mirror half of
        // the fix deleted. `cite` and `blockquote` are in it for the same reason: the mirrored
        // overprint lands on the attribution line, which is neither a li, a strong nor a p.
        const content = [...s.querySelectorAll(
          ':is(.panel-left, .panel-right) :is(li, strong, p, cite, blockquote)')]
          .filter((e) => [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim()))
          .map((e) => ({ t: e.textContent.trim().slice(0, 40), r: ink(e) }));
        const hit = content.map((c) => (over(pi, c.r) ? { ...over(pi, c.r), t: c.t } : null)).find(Boolean) || null;
        out.push({
          page: i + 1,
          position: getComputedStyle(ptr).position,
          insideSlide: pi.right <= sr.right + 0.5 && pi.left >= sr.left - 0.5,
          // THE CLAMP'S OWN MARGIN, which is a stronger statement than "inside the slide" and the
          // reason this arm exists. Containment is satisfied by LUCK at `square`, where the
          // unclamped pill happened to land 11.2px inside; the same mutation that reddens portrait,
          // story and mobile leaves square green. `max-width: calc(100% - 2 * var(--sp-xl))` on an
          // element with `right: var(--sp-xl)` says something exact — the pill clears BOTH edges by
          // one `--sp-xl` — and that holds at any label the engine can emit, including the CJK and
          // fullwidth cases no ASCII fixture can reach and no font stack here renders reproducibly.
          clearsBothEdges: pi.left - sr.left >= spXl - 0.5 && sr.right - pi.right >= spXl - 0.5,
          spXl: +spXl.toFixed(2),
          inset: +(pi.left - sr.left).toFixed(1),
          bleeds: Math.abs(pl.left - sr.left) < 0.5 && Math.abs(pr.right - sr.right) < 0.5
            && Math.abs(Math.min(pl.top, pr.top) - sr.top) < 0.5
            && Math.abs(Math.max(pl.bottom, pr.bottom) - sr.bottom) < 0.5,
          overRail: rail ? over(pi, rail.getBoundingClientRect()) : null,
          overFooter: foot ? over(pi, ink(foot)) : null,
          overContent: hit,
        });
      });
      return out;
    });
  };

  /** The member block's vertical mid-line per page — the thing that drifts when one page of a
   *  run reserves a different band from its siblings. */
  const measureContent = async (size, cls) => {
    await p.goto(`file://${rendered.get(`${size}|${cls}`)}`, { waitUntil: 'networkidle0' });
    return p.evaluate(() => {
      const out = [];
      document.querySelectorAll('section.split-panel.lat-split-native').forEach((s, i) => {
        const ul = s.querySelector('.panel-right > ul');
        if (!ul) return;
        const sr = s.getBoundingClientRect();
        const r = ul.getBoundingClientRect();
        out.push({ page: i + 1, mid: +(((r.top + r.bottom) / 2) - sr.top).toFixed(1) });
      });
      return out;
    });
  };

  /** `.panel-left`'s box as a fraction of the slide — the dark/light seam a reader sees. */
  const measureSeam = async (key) => {
    await p.goto(`file://${rendered.get(key)}`, { waitUntil: 'networkidle0' });
    return p.evaluate(() => {
      const out = [];
      document.querySelectorAll('section').forEach((s, i) => {
        const L = s.querySelector('.panel-left');
        if (!L) return;
        const sr = s.getBoundingClientRect();
        const b = L.getBoundingClientRect();
        const column = getComputedStyle(s).flexDirection.startsWith('column');
        // In a column the seam is the panel's BOTTOM edge; in a row it is its far side.
        const R = s.querySelector('.panel-right');
        out.push({
          page: i + 1,
          column,
          seam: +(((column ? b.bottom - sr.top : b.right - sr.left)
            / (column ? sr.height : sr.width)) * 100).toFixed(2),
          // The band is reserved by ADDING bottom padding, so the two panels' padding says which
          // one the rule picked — without needing to know the token's computed value.
          pbL: getComputedStyle(L).paddingBottom,
          pbR: R ? getComputedStyle(R).paddingBottom : null,
        });
      });
      return out;
    });
  };

  /** The k-of-N rail's WCAG 1.4.11 ratio against the opaque field it actually lands on. */
  const measureRail = async (key) => {
    await p.goto(`file://${rendered.get(key)}`, { waitUntil: 'networkidle0' });
    return p.evaluate(() => {
      const lum = (c) => {
        const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      // `color(srgb 1 1 1 / 0.76)` reports 0-1 channels and `rgb(30, 58, 95)` reports 0-255;
      // one number-scrape across both read white-on-navy as 1.71:1, which is 7.19:1.
      const parse = (v) => {
        const m = (v.match(/[\d.]+/g) || ['0', '0', '0', '1']).map(Number);
        const k = /^color\(/.test(v) ? 255 : 1;
        return { rgb: [m[0] * k, m[1] * k, m[2] * k], a: m.length > 3 ? m[3] : 1 };
      };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
      // EVERY segment, not the first. `auto-split.js` marks segments 0..k `on`, so segment 0 is
      // ALWAYS `on` — and `.seg` is `opacity: 0.7` while `.seg.on` is `1`. A probe that takes
      // `querySelector('.seg')` has therefore only ever measured the opaque pill, and the OFF
      // pills are the ones `base.modifiers.css` spends forty lines tuning to clear 3:1.
      const rows = [];
      document.querySelectorAll('section.split-panel.lat-split-native').forEach((s, i) => {
        for (const seg of s.querySelectorAll('.lat-split-rail .seg')) {
          // Sections below the fold are outside the viewport, and `elementsFromPoint` is a
          // VIEWPORT query: without this every page but the first reports the white backdrop.
          seg.scrollIntoView({ block: 'center' });
          const cs = getComputedStyle(seg);
          const col = parse(cs.color);
          const r = seg.getBoundingClientRect();
          let bg = [255, 255, 255];
          for (const el of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)) {
            const c = parse(getComputedStyle(el).backgroundColor);
            if (c.a >= 0.99) { bg = c.rgb; break; }
          }
          const a = col.a * (+cs.opacity);
          rows.push({
            page: i + 1,
            on: seg.classList.contains('on'),
            ratio: ratio(col.rgb.map((v, j) => v * a + bg[j] * (1 - a)), bg),
          });
        }
      });
      return rows;
    });
  };

  for (const size of SIZES) {
    for (const cls of ['', 'form']) {
      const label = `${size}${cls ? ' + authored form' : ''}`;

      test(`${label}: the run splits coverless, and the pointer is placed rather than laid out`, async (t) => {
        if (!exe) return t.skip('no Chromium — set CHROME_PATH');
        const pages = await measure(size, cls);
        assert.ok(pages.length >= 2, `the run did not split (${pages.length} page(s))`);
        for (const x of pages) {
          assert.equal(x.position, 'absolute',
            `page ${x.page}: the pointer is a flex item of the panel row — at square it becomes a third COLUMN`);
          assert.ok(x.insideSlide, `page ${x.page}: the pointer ran past the slide edge`);
        }
      });

      test(`${label}: the pointer covers no mark and no content`, async (t) => {
        if (!exe) return t.skip('no Chromium — set CHROME_PATH');
        for (const x of await measure(size, cls)) {
          assert.equal(x.overRail, null, `page ${x.page}: pointer over the k-of-N rail — ${JSON.stringify(x.overRail)}`);
          assert.equal(x.overFooter, null, `page ${x.page}: pointer over the running footer — ${JSON.stringify(x.overFooter)}`);
          assert.equal(x.overContent, null, `page ${x.page}: the opaque pill covers body text — ${JSON.stringify(x.overContent)}`);
        }
      });
    }

    // Full bleed is what the section-level reservation destroyed, and only at square — where the
    // panels are side-by-side columns rather than stacked halves. An authored `form` is inset by
    // the Form frame by design, so this is the non-Form shape only.
    test(`${size}: the panels still reach every slide edge`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH');
      for (const x of await measure(size, '')) {
        assert.ok(x.bleeds, `page ${x.page}: a reservation cut the panels short of the slide edge`);
      }
    });

    // THE RUN'S PAGES AGREE. This is what the reservation actually buys, and it is measured on
    // the member block's own mid-line rather than on a mark, because the drift it removes is
    // CONTENT drift — invisible to a sweep that tracks the pointer, the rail and the page number,
    // which is how it shipped.
    test(`${size}: every page of the run places its content identically`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH');
      const mids = await measureContent(size, '');
      assert.ok(mids.length >= 2, `the run did not split (${mids.length} page(s))`);
      const spread = Math.max(...mids.map((m) => m.mid)) - Math.min(...mids.map((m) => m.mid));
      assert.ok(spread <= 1, `the member block moves ${spread.toFixed(1)}px between pages of one run`
        + ` — ${JSON.stringify(mids)}`);
    });

    // THE RESERVE DOES NOT MOVE THE SEAM. Reserving the band on `.panel-left` as well as
    // `.panel-right` closed the mirror overprint and, at every STACKED size, inflated the dark
    // panel: `.panel-left` is a flex item whose height is content-driven in a column, so padding
    // there grows the panel instead of shrinking a content box. Measured on the shipped rule
    // before this arm existed: 49.3% -> 55.0% of the slide at portrait, 35.9% -> 39.4% at story,
    // 29.9% -> 32.6% at mobile, on a variant whose premise is that the quote gets half the slide.
    // Every geometry probe on this branch reported "no overprint" and was right; a raster is what
    // caught it. The reference is the SAME deck rendered `--no-split`, so the arm says what it
    // means: splitting a slide does not repaint it.
    // THE ARM IS ONLY LIVE IN A COLUMN, and saying so is the point. Bottom padding can only
    // inflate a panel whose height is content-driven, which happens exactly when the section is a
    // FLEX COLUMN. In a row the panels are full height and the padding shrinks a content box, so
    // the comparison below is trivially true there and would certify nothing on its own. An
    // earlier version ran it for `mirror` too and reported four green arms; `mirror` forces
    // `row-reverse` at EVERY size, so all four were trivially true — a placebo, and the mutation
    // count (3, the three stacked non-mirror sizes) was the only thing saying so. Each branch now
    // asserts what is actually true of it, so a change to either trips something.
    for (const cls of ['', 'mirror']) {
      test(`${size}${cls ? ' + mirror' : ''}: splitting does not move the dark panel's seam`, async (t) => {
        if (!exe) return t.skip('no Chromium — set CHROME_PATH');
        const whole = await measureSeam(`${size}|${cls}|whole`);
        const split = await measureSeam(`${size}|${cls}`);
        assert.ok(whole.length === 1, `the reference render split (${whole.length} page(s))`);
        assert.ok(split.length >= 2, `the run did not split (${split.length} page(s))`);

        if (!whole[0].column) {
          // A ROW. The reserve cannot move the seam here, and the arm's job is to pin the reason:
          // if this ever becomes a column, the comparison below has to start running for it.
          assert.ok(split.every((x) => !x.column),
            'the section became a COLUMN — the seam comparison must now run for this shape');
          return;
        }
        // `mirror` at a STACKED size is a pre-existing defect, and the seam has no meaning there.
        // `section.split-panel.mirror { flex-direction: row-reverse }` (`base.modifiers.css`) and
        // `section.split-panel[data-orientation="portrait"] { flex-direction: column }` have the
        // SAME specificity (0,2,1) and the mirror rule sits later in the bundle, so a mirrored
        // section stays a ROW at every size — and a 38/62 row on a 1080x1350 slide overflows:
        // measured `.panel-left` at x-62.4 w1594, `.panel-right` entirely off-slide at x-451.6,
        // the engine's own "Content clipped" badge on the page. IDENTICAL on the `--no-split`
        // reference, which carries none of this branch's CSS, so it is not ours (HARD RULE #18,
        // off-path). Asserted rather than skipped: if the reflow is ever fixed, this arm says so
        // and the seam comparison below should be turned on for it.
        if (whole[0].seam > 100) {
          assert.ok(split.every((x) => x.seam > 100),
            'the mirror-at-stacked-size reflow was fixed — re-enable the seam comparison here');
          return;
        }
        for (const x of split) {
          assert.ok(Math.abs(x.seam - whole[0].seam) <= 0.5,
            `page ${x.page}: the seam moved to ${x.seam}% of the slide, from ${whole[0].seam}% unsplit`);
        }
      });
    }

    // IN A COLUMN, THE TOP PANEL KEEPS ITS OWN PADDING — and in a ROW both panels give up the
    // band. Two rounds tried to name ONE panel for the reserve and both were reading this file's
    // own short labels: the pill's width is the next page's member title, clipped at 42
    // characters, so at the cap it is 496px at square and CROSSES THE SEAM (measured: it overlaps
    // `.panel-left` by 112.3px unmirrored and `.panel-right` by 149.1px on `steps mirror`). A
    // `:not(.mirror)` gate that measured safe on the narrow fixture reopened a real overprint
    // there. What does NOT vary is the column case: `.panel-left` is the top half, the pill cannot
    // reach it at any label width (measured 0 overlap at portrait, story and mobile even at
    // 672.7px), and reserving it would inflate it — which is the seam defect round 5 fixed.
    for (const cls of ['', 'mirror']) {
      test(`${size}${cls ? ' + mirror' : ''}: the reserve follows the row/column, not one named panel`, async (t) => {
        if (!exe) return t.skip('no Chromium — set CHROME_PATH');
        const whole = await measureSeam(`${size}|${cls}|whole`);
        const split = await measureSeam(`${size}|${cls}`);
        assert.ok(whole.length === 1 && split.length >= 2, 'the fixture did not render as expected');
        for (const x of split) {
          if (x.column) {
            // Only the bottom panel can be reached, so the top one must be untouched.
            assert.equal(x.pbL, whole[0].pbL,
              `page ${x.page}: .panel-left reserved a band the pill cannot reach in a column`
              + ` — ${x.pbL} split vs ${whole[0].pbL} unsplit`);
            assert.notEqual(x.pbR, whole[0].pbR,
              `page ${x.page}: .panel-right did not reserve the band the pill sits in`);
          } else {
            // A row: the pill can cross the seam, so neither panel may be left out.
            assert.notEqual(x.pbL, whole[0].pbL,
              `page ${x.page}: .panel-left did not reserve, and in a row the pill can cross into it`);
            assert.notEqual(x.pbR, whole[0].pbR,
              `page ${x.page}: .panel-right did not reserve, and in a row the pill can cross into it`);
          }
        }
      });
    }

    // …AND THE SAME DECK WITH THE FORWARD LABEL AT THE ENGINE'S CAP. This is the arm the file was
    // missing: every "which panel does the pill sit in" figure it has quoted came from a 15- or
    // 21-character title, and the engine allows 42. At the cap the pill is 496px at square rather
    // than 305px and crosses the seam, which is how a reserve gated to one named panel shipped a
    // pill-over-text overprint that the narrow fixture called clean.
    // …FOR EVERY CLASS THE FIXTURE RENDERS. This loop read `['', 'mirror']` while `before()`
    // rendered the wide deck for all five, so the `form`, `form mirror` and `metric` wide renders
    // were PRODUCED AND NEVER READ — and `form` is exactly where the clamp that this arm exists to
    // pin does not apply, because `base.modifiers.css` re-declares `max-width: 100%` for Form
    // pages at the same (0,3,1) specificity and later in the bundle. The pill ran 79.0 / 88.7 /
    // 92.7px off the LEFT EDGE on an authored `split-panel pullquote form`, silently, with the
    // suite at 64/64. Rendering a class is not asserting against it.
    for (const cls of ['', 'form', 'mirror', 'form mirror', 'metric']) {
      test(`${size}${cls ? ` + ${cls}` : ''}: the pill covers no content at the 42-character label cap`, async (t) => {
        if (!exe) return t.skip('no Chromium — set CHROME_PATH');
        const pages = await measure(size, cls, '|wide');
        assert.ok(pages.length >= 2, `the wide-label run did not split (${pages.length} page(s))`);
        for (const x of pages) {
          // The containment arm, run against a label that SATURATES the pill's bound. It is the
          // same assertion the narrow decks make; it had simply never been given an input wide
          // enough to fail on, and it failed on the first one that was.
          assert.ok(x.insideSlide,
            `page ${x.page}: at the widest label the cap admits, the pointer ran past the slide edge`);
          // …and the INVARIANT behind it, which containment alone does not state. See the note on
          // `clearsBothEdges` in `measure()`: at `square` the unclamped pill lands inside the slide
          // by accident, so the containment assertion above stays green on a tree where the clamp
          // does not apply at all. This one does not.
          assert.ok(x.clearsBothEdges,
            `page ${x.page}: the pointer does not clear both slide edges by --sp-xl — `
            + `inset ${x.inset}px vs --sp-xl ${x.spXl}px (the clamp is not applying)`);
          assert.equal(x.overContent, null,
            `page ${x.page}: at the label cap the opaque pill covers body text — ${JSON.stringify(x.overContent)}`);
          assert.equal(x.overRail, null, `page ${x.page}: pill over the k-of-N rail — ${JSON.stringify(x.overRail)}`);
        }
      });
    }

    // THE RAIL IS LEGIBLE ON THE FIELD IT LANDS ON. `.lat-split-rail .seg` draws in
    // `currentColor`, which is the section's canvas ink — right over `.panel-right`, invisible
    // over `.panel-left`. Under `mirror` the bottom-right corner IS `.panel-left`, and this is a
    // surface the branch created: `pullquote` declines `readFeature`, so before the native-split
    // path it never split and no rail existed here. Measured across all 33 shipped palettes, six
    // variants each: 52 of 198 cells under WCAG 1.4.11's 3:1 for a meaningful graphical object,
    // bottoming out at 1.00:1 — a rail nobody can see. 0 of 198 after, worst cell 5.33:1.
    for (const cls of ['mirror', 'form mirror', 'metric']) {
      test(`${size} + ${cls}: the k-of-N rail clears 3:1 on the field it lands on`, async (t) => {
        if (!exe) return t.skip('no Chromium — set CHROME_PATH');
        const rows = await measureRail(`${size}|${cls}`);
        assert.ok(rows.length >= 2, `the ${cls} run did not split (${rows.length} page(s))`);
        for (const x of rows) {
          assert.ok(x.ratio >= 3, `page ${x.page}: the rail is ${x.ratio}:1 against the field behind it`);
        }
      });
    }

    // …INCLUDING UNDER `mirror`, which row-reverses the panels. At square that swaps which column
    // the pointer sits over, so a reservation on one named panel lands on the wrong one.
    test(`${size}: mirror reverses the panels and the band is still reserved where the pill is`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH');
      for (const x of await measure(size, 'mirror')) {
        assert.equal(x.overContent, null,
          `page ${x.page}: under mirror the pill covers body text — ${JSON.stringify(x.overContent)}`);
      }
      const mids = await measureContent(size, 'mirror');
      // Without this, a mirror deck that stopped splitting gives `Math.max(...[]) - Math.min(...[])`
      // === -Infinity, and `-Infinity <= 1` passes. The non-mirror arm above has always had it.
      assert.ok(mids.length >= 2, `the mirror run did not split (${mids.length} page(s))`);
      const spread = Math.max(...mids.map((m) => m.mid)) - Math.min(...mids.map((m) => m.mid));
      assert.ok(spread <= 1, `under mirror the member block moves ${spread.toFixed(1)}px between pages`);
    });
  }
});
