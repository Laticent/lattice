/**
 * The CLI's page-per-step export (`--steps`; engineering/decisions/2026-11-09-steps-as-a-behavior.md §4, the owner's
 * D1). Three promises, each found broken once by the adversarial pass on 2026-11-10:
 *
 *   - the PDF prints one page per step, and every page carries its slide's marks: the divider marker reads the same
 *     on each step page, and the topic eyebrow after it still names the right section (S3);
 *   - only the PRINTED document is expanded: the --fluid sidecar and the captions describe the deck a person
 *     presents, one section per slide, where Present walks the steps (`cleanDocHtml` was once reassigned to the
 *     expanded copy, which shipped duplicate walking slides and bound say: lines to step pages);
 *   - a .html export ignores --steps.
 *
 * Integration tier: it runs the real CLI in a real browser and reads the PDF with poppler (HARD RULE #23).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
// An agenda, a numbered divider that walks two focus steps, a body slide, a second divider, a topic, a body slide.
const FIXTURE = path.join(ROOT, 'test', 'integration', 'invariants', 'mark-agreement', 'fixtures', 'focus-divider.md');
const TIMEOUT = 120000;

function render(out, extra) {
  const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out, ...extra], { cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT });
  assert.equal(r.status, 0, `lattice exited ${r.status}: ${r.stderr}`);
  return r;
}
const pageText = (file, p) => execFileSync('pdftotext', ['-f', String(p), '-l', String(p), file, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
const pages = (file) => Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file], { encoding: 'utf8' }))[1]);

describe('--steps (the page-per-step export)', { timeout: TIMEOUT * 3 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-steps-'));

  test('the PDF gives each step a page, and every page keeps its slide\'s marks', () => {
    const plain = path.join(dir, 'plain.pdf');
    const stepped = path.join(dir, 'stepped.pdf');
    render(plain, ['--quiet']);
    render(stepped, ['--quiet', '--steps']);
    assert.equal(pages(plain), 6);
    assert.equal(pages(stepped), 7, 'the two-step divider prints twice');
    // Both pages of the stepping divider are section 1 of 2; the next divider is still 2 of 2.
    assert.match(pageText(stepped, 2), /Alpha.*1\s*\/\s*2/);
    assert.match(pageText(stepped, 3), /Alpha.*1\s*\/\s*2/);
    assert.match(pageText(stepped, 5), /Beta.*2\s*\/\s*2/);
    // The topic after Beta still names section 02: a copy counted as a section would make it 03.
    assert.match(pageText(stepped, 6), /02 · BETA/);
  });

  test('the --fluid sidecar and the captions keep one section per slide', () => {
    const out = path.join(dir, 'side.pdf');
    const r = render(out, ['--steps', '--fluid', '--captions']);
    assert.doesNotMatch(r.stdout + r.stderr, /differ/, 'captions must not see the step pages');
    const html = fs.readFileSync(path.join(dir, 'side.html'), 'utf8');
    assert.equal((html.match(/data-step-page="/g) || []).length, 0, 'the sidecar is the deck Present walks, not the printed pages');
    const vtts = fs.readdirSync(dir).filter((f) => /^side\.\d+\.vtt$/.test(f));
    assert.equal(vtts.length, 6, 'one caption track per slide');
  });

  test('a .html export ignores --steps, and says so', () => {
    const out = path.join(dir, 'deck.html');
    const r = render(out, ['--steps']);
    assert.match(r.stdout, /--steps adds nothing to a \.html export/);
    assert.equal((fs.readFileSync(out, 'utf8').match(/data-step-page="/g) || []).length, 0);
  });

  // THE RUNTIME STOP. An export frame (the Studio's capture frame, a page with the runtime) re-runs its counting passes
  // 150 ms after the DOM changes. After the expansion that recounted the copies as slides, so a stepping numbered
  // divider printed 01 then 02 on its own pages (the inversion, 2026-11-10); lib/runtime/index.js `stepPagesExpanded`
  // stops it. No sleep: two same-origin frames of the same deck share one event loop. Frame A is expanded; frame B gets
  // an ordinary extra divider at the same moment, which the runtime DOES recount. Once B's recount has landed, A's
  // timer, armed first with the same delay, has had its turn, so A's numerals must still be the engine's.
  // A capture frame's shape: the engine's render in a plain (not virtual) `.lattice`, and the built runtime, twice.
  async function twoFrames(fn) {
    const runtime = path.join(ROOT, 'dist', 'lattice-runtime-min.js');
    if (!fs.existsSync(runtime)) throw new Error('dist/lattice-runtime-min.js is not built: run `npm run build`');
    const { createEngine } = require(path.join(ROOT, 'lib/engine'));
    const body = createEngine().render(fs.readFileSync(FIXTURE, 'utf8')).html;
    const doc = `<!doctype html><html><head><meta charset="utf-8"></head><body><div class="lattice">${body}</div><script>${fs.readFileSync(runtime, 'utf8').replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
    const { expandStepPages } = await import(path.join(ROOT, 'lib/core/step-pages.mjs'));
    const { applyStepAt } = await import(path.join(ROOT, 'lib/core/step-state.mjs'));
    const puppeteer = require('puppeteer');
    const opts = { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };
    if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
    const browser = await puppeteer.launch(opts);
    try {
      const page = await browser.newPage();
      await page.setContent('<iframe id="a"></iframe><iframe id="b"></iframe>');
      await page.evaluate(async (html) => {
        await Promise.all(['a', 'b'].map((id) => new Promise((res) => {
          const f = document.getElementById(id);
          f.addEventListener('load', res, { once: true });
          f.srcdoc = html;
        })));
      }, doc);
      const numerals = (id) => page.evaluate((fid) => [...document.getElementById(fid).contentDocument.querySelectorAll('section.divider.numbered > h2')].map((h) => h.getAttribute('data-lat-section')), id);
      await page.waitForFunction(() => ['a', 'b'].every((id) => document.getElementById(id).contentDocument?.querySelector('section.divider.numbered > h2[data-lat-section]')));
      assert.deepEqual(await numerals('a'), ['01', '02'], 'the engine numbers Alpha 01 and Beta 02');
      // Expand A and, in the same task, give B a plain divider ahead of Alpha that the runtime must count.
      const expandAndProvoke = () => page.evaluate((expand, paint) => {
        const a = document.getElementById('a').contentDocument;
        new Function('root', 'expand', 'paint', 'return expand(root, paint)')(a.querySelector('.lattice') || a, new Function(`return (${expand})`)(), new Function(`return (${paint})`)());
        const b = document.getElementById('b').contentDocument;
        const alpha = b.querySelector('section.divider.numbered');
        const extra = alpha.cloneNode(true);
        extra.querySelector('h2').textContent = 'Extra';
        alpha.before(extra);
      }, expandStepPages.toString(), applyStepAt.toString());
      // The signal: B's recount lands (Extra 01, Alpha 02, Beta 03). Any pass A had queued, armed no later, has run.
      const bRecounted = () => page.waitForFunction(() => [...document.getElementById('b').contentDocument.querySelectorAll('section.divider.numbered > h2')].map((h) => h.getAttribute('data-lat-section')).join() === '01,02,03', { timeout: 10000 });
      await fn({ page, expandAndProvoke, bRecounted });
      // A: the original, its step copy and Beta keep the engine's numbers.
      assert.deepEqual(await numerals('a'), ['01', '01', '02']);
    } finally {
      await browser.close();
    }
  }

  test('the runtime does not recount a document expanded into step pages', async () => {
    await twoFrames(async ({ expandAndProvoke, bRecounted }) => {
      await expandAndProvoke();
      await bRecounted();
    });
  });

  // The path the observer guard alone missed: a content pass already QUEUED when the copies arrive. A's own DOM change
  // arms its debounce timer first; the expansion follows in a later task, before that timer fires. The timer must find
  // the document finished (`runAllContentTransforms` / `initAndRun` check it, not only `scheduleRun`).
  test('a content pass queued before the expansion does not recount it either', async () => {
    await twoFrames(async ({ page, expandAndProvoke, bRecounted }) => {
      await page.evaluate(() => {
        const a = document.getElementById('a').contentDocument;
        a.querySelector('.lattice > section').appendChild(a.createElement('span'));
      });
      await expandAndProvoke();
      await bRecounted();
    });
  });
});
