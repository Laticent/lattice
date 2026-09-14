/**
 * Integration: does the TRIM reach the FILE, and does the console say so?
 *
 * WHY THIS FILE EXISTS. Every other instrument this feature has reads the LIVE
 * DOM — the metamorphic relations model it, the adapter test measures it in real
 * Chromium, the corpus sweep diffs PDF bytes rendered from it. Nothing opened a
 * written `.html` and asked whether the trim was in there, and the gap is exactly
 * where the defect was: `lattice-emulator.js` writes `outHtml` from `cleanDocHtml`,
 * a Node-side string, BEFORE the page ever loads, and no later pass rewrites it
 * from the DOM. So the trim never reaches it.
 *
 * Beside a PDF that is a sidecar divergence. With `-o deck.html` it was the whole
 * run: the console printed "TRIMMED … pages 2" naming a cut that exists in no
 * artifact, and the OVERFLOW line — measured off the trimmed DOM — left page 2 off
 * a list the written file belongs on. The tool asserted the opposite of what it had
 * done, about the only file it produced. Design note open problem 10.
 *
 * WHAT IT PINS. The PAIR, on the real surface (HARD RULE #23): each `.html` this
 * suite checks is rendered by the real emulator and OPENED in real Chromium, and
 * the assertion is about that loaded document, never about a substring of the file.
 * Three arms, and each is only meaningful with the others:
 *
 *   · `-o deck.html`            — no trim in the file, AND the console says
 *                                 NOT APPLIED, AND the OVERFLOW line names the page
 *                                 that clips there. Console and file agree.
 *   · `-o deck.pdf` (sidecar)   — the PDF's own pass trimmed, the sidecar did not,
 *                                 and the console DECLARES that divergence.
 *   · `-o deck.pdf --fluid`     — the viewer inlines the runtime, which re-measures
 *                                 at open, so the `.html` DOES carry the trim.
 *
 * The third arm is what stops the first two from being a test of "trim never
 * works": it proves the deck really does trim, on a written `.html`, when the
 * deliverable is built to carry it.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const TMP = path.join(ROOT, '.scratch', 'guards-trim-deliverables');
const DECK = path.join(TMP, 'deck.md');

// A REAL shipped deck with the register already on, so the trimming page is one a
// human can open rather than a fixture tuned until it trimmed. `overflow-guards.md`
// trims p2 and declines p4 — both arms in one render.
const SOURCE_DECK = path.join(ROOT, 'examples', 'overflow-guards.md');

let puppeteer, browser;

/**
 * Render `DECK` with the given output + flags and return the emulator's STDERR.
 *
 * Stderr, explicitly, and captured rather than inherited: every warning this file
 * asserts on is written there, and reading stdout instead is the vacuity that once
 * made this feature's own signal check "pass" having seen nothing at all (design
 * note, open problem 1). A non-zero exit fails here rather than downstream, so a
 * crashed render cannot read as "no trim".
 */
function render(out, ...flags) { return renderDeck(DECK, out, ...flags); }

function renderDeck(deck, out, ...flags) {
  const r = spawnSync('node',
    [path.join(ROOT, 'lattice-emulator.js'), deck, '-o', path.join(TMP, out), ...flags],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `render ${out} failed (exit ${r.status}):\n${r.stderr}`);
  return r.stderr || '';
}

/** Open a written `.html` in real Chromium and report what the TRIM left in it. */
async function trimStateOf(file) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('file://' + path.resolve(path.join(TMP, file)), { waitUntil: 'load' });
  // The fluid viewer's runtime measures on font settle and again on rAF; the plain
  // sidecar's inline watcher does the same for the ring. Wait for both to settle
  // rather than racing them — a flaky read here would be reported as "no trim",
  // which is the flattering answer.
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 2500)));
  try {
    return await page.evaluate(() => [...document.querySelectorAll('section[data-lattice-slide]')]
      .map((s, i) => ({
        page: i + 1,
        trimmed: s.querySelectorAll('[data-lattice-trimmed]').length,
        record: s.getAttribute('data-lattice-trim'),
        overflow: s.classList.contains('overflow'),
      })));
  } finally { await page.close(); }
}

// A deck whose paragraph is joined with explicit breaks. `-webkit-line-clamp` shrinks
// the BOX without removing descendant boxes from layout, so the `<br>`s keep reporting
// rects past the frame and the overflow probe correctly still sees them — the clamp
// buys nothing and rule 5 refuses it. That makes this the cheapest shape that exercises
// the SLIDE-level arm of the verdict, which is the half the runtime did not have.
const BR_DECK = path.join(TMP, 'br.md');
const BR_SRC = `---
marp: true
theme: indaco
paginate: true
guards: strict
---

<!-- _class: title -->

# Break test

---

<!-- _class: content -->

## A paragraph joined with explicit breaks.

<p>${Array.from({ length: 21 }, (_, i) =>
  `Line ${i + 1} of a paragraph whose lines are joined with explicit breaks rather than wrapped by the renderer.<br>`).join('\n')}</p>
`;

before(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(BR_DECK, BR_SRC);
  // Copied rather than rendered in place, so the deck's committed PDF is untouched
  // and the `.scratch` sidecars cannot collide with another sweep's.
  fs.copyFileSync(SOURCE_DECK, DECK);
  puppeteer = require('puppeteer');
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});

after(async () => { if (browser) await browser.close(); });

describe('guards: strict — what the deliverable carries, and what the console claims', () => {
  test('an .html DELIVERABLE carries no trim, and the console neither claims one nor hides the clip', async () => {
    const err = render('deliverable.html');
    const state = await trimStateOf('deliverable.html');

    // ANTI-VACUITY. If this deck stopped overflowing the whole test would pass by
    // asserting nothing, which is precisely how three of this feature's own
    // detectors reported the flattering answer.
    assert.ok(state.length >= 4, `expected a multi-slide render, got ${state.length}`);
    assert.ok(state.some((s) => s.overflow),
      'anti-vacuity: no slide clips in the written .html, so there is nothing for a trim to have fixed');

    // THE FILE: no clamp reached it.
    for (const s of state) {
      assert.equal(s.trimmed, 0, `page ${s.page}: the written .html carries a clamp it cannot have got`);
      assert.equal(s.record, null, `page ${s.page}: the written .html carries a trim record`);
    }

    // THE CONSOLE: says so, and does not claim a cut.
    assert.match(err, /guards: strict NOT APPLIED/,
      'the console must say the guard could not be applied to this deliverable');
    assert.doesNotMatch(err, /TRIMMED — guards: strict cut text/,
      'the console claimed a cut that exists in no artifact this run wrote');

    // AND THE OVERFLOW LINE DESCRIBES THE FILE. This is the half that made the bug
    // invisible: measured off a trimmed DOM, the warning left the clipping page off
    // its list, so the one channel that could have contradicted the claim agreed
    // with it instead.
    const pages = /OVERFLOW — .*?pages? ([\d, ]+)\./.exec(err);
    assert.ok(pages, `expected an OVERFLOW line naming pages; stderr was:\n${err}`);
    const named = new Set(pages[1].split(',').map((n) => Number(n.trim())));
    for (const s of state.filter((x) => x.overflow)) {
      assert.ok(named.has(s.page),
        `page ${s.page} clips in the written .html but the OVERFLOW line names only ${[...named].join(', ')}`);
    }
  });

  test('beside a PDF the sidecar still carries no trim — and the console DECLARES the divergence', async () => {
    const err = render('sidecar.pdf');
    // The PDF pass really did trim: without this the arm below is a test of a
    // feature that never fired.
    assert.match(err, /TRIMMED — guards: strict cut text on \d+ slide/,
      `anti-vacuity: the PDF pass did not trim, so there is no divergence to declare; stderr:\n${err}`);
    assert.match(err, /sidecar does NOT carry the trim/,
      'the divergence between the two deliverables of one export must be stated, not left silent');

    const state = await trimStateOf('sidecar.html');
    for (const s of state) {
      assert.equal(s.trimmed, 0, `page ${s.page}: the sidecar carries a clamp — if this is now true, the warning above is stale`);
    }
  });

  test('--fluid DOES carry it: the viewer re-measures at open and trims the same page', async () => {
    const err = render('viewer.pdf', '--fluid');
    const trimmedPages = /TRIMMED — guards: strict cut text on \d+ slide\(s\): pages ([\d, ]+)\./.exec(err);
    assert.ok(trimmedPages, `anti-vacuity: the PDF pass did not trim; stderr:\n${err}`);
    assert.doesNotMatch(err, /sidecar does NOT carry the trim/,
      'the sidecar warning must not fire for a viewer that does carry the trim');

    const want = new Set(trimmedPages[1].split(',').map((n) => Number(n.trim())));
    const state = await trimStateOf('viewer.html');
    const got = new Set(state.filter((s) => s.trimmed > 0).map((s) => s.page));
    assert.deepEqual([...got].sort(), [...want].sort(),
      `the fluid viewer trims ${[...got].join(', ') || 'nothing'} where the PDF trimmed ${[...want].join(', ')}`);
    for (const s of state.filter((x) => want.has(x.page))) {
      assert.equal(s.overflow, false,
        `page ${s.page}: the viewer trimmed it, so it must no longer ring — the PDF reports it as fitting`);
    }
  });

  test('a cut the export REFUSES never ships in the viewer built from the same render', async () => {
    // THE POLICY-PARITY ARM. The export and the live runtime share the trim kernel and,
    // until a fourth review, did NOT share the VERDICT: the export ran a per-box revert
    // AND a slide-level one, the runtime ran only the first. `--fluid` inlines that
    // runtime, so the written `.html` re-trimmed at open under a policy the export had
    // just refused — 9 of 21 lines removed, on a slide still carrying the overflow ring,
    // with the console saying "they clip unchanged" about the only file that run wrote.
    // HARD RULE #1 and #18 in one artifact.
    //
    // This is the arm that could have caught it, and nothing in the tree had it: the two
    // paths' policies were only ever compared by reading them. Mutation-proved by
    // dropping the frame arm from the runtime's call and rebuilding — the viewer then
    // ships `data-lattice-trim="1"` on a ringing slide and this goes red.
    const err = renderDeck(BR_DECK, 'refused.pdf', '--fluid');
    assert.match(err, /TRIM REVERTED/,
      `anti-vacuity: the export did not refuse a cut on this deck, so there is no ` +
      `refusal for the viewer to contradict; stderr:\n${err}`);
    const refused = new Set(
      (/TRIM REVERTED[^\n]*?pages? ([\d, ]+)/.exec(err)?.[1] || '')
        .split(',').map((n) => Number(n.trim())).filter(Number.isFinite));
    assert.ok(refused.size, `could not read the reverted pages out of:\n${err}`);

    const state = await trimStateOf('refused.html');
    for (const s of state.filter((x) => refused.has(x.page))) {
      assert.equal(s.trimmed, 0,
        `page ${s.page}: the export reverted this cut and reported it as clipping unchanged, ` +
        `but the viewer built from the same render shipped ${s.trimmed} clamp(s) of it`);
      assert.equal(s.record, null,
        `page ${s.page}: the viewer carries a trim record for a cut the export refused`);
    }
  });
});
