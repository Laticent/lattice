/**
 * A pill, a check or a bold span inside a list item's label never splits the label.
 *
 * The defect (engineering/decisions/2026-10-20-inline-objects-audit.md): a component that lays its list
 * items out with `display:flex` or `grid` makes every child of the item its own flex item, and wraps
 * each run of text in an anonymous one. So `- Pilot in the EU `{LIVE}` and collect feedback` rendered as
 * three stacked blocks with the pill stretched across the full width. Measured on the gallery source
 * with a pill injected mid-text into every list item: 69 flex or grid hosts split, across 16 components.
 * `lib/core/inline-run.js` fixes it by wrapping the label's leading run in one element, for the
 * components whose manifests declare `inlineRun`.
 *
 * WHAT THIS GUARDS, AND WHY IT IS NOT A LIST OF COMPONENTS. The test injects a pill into every list
 * item of the real baseline gallery, renders it through the real CLI, and asks Chromium which flex or
 * grid hosts still hold bare text next to an inline element. It reads each section's declared slots
 * from the generated catalog, on top of the two every component has, and applies just those two to a
 * component that declares nothing. A NEW component that makes its items flex containers and forgets to declare `inlineRun`
 * therefore fails here with its name, which is the regression this exists to catch. No list in this
 * file names a component.
 *
 * THE FALSIFIABILITY ARM. The same measurement runs against a render with the transformer switched
 * off, and it must find splits. A probe that quietly stops finding them (a selector drift, a display
 * check that never matches) would report "none" for the same reason an unplugged smoke alarm reports
 * no fire, so the arm proves the instrument can go red on the defect it claims to see.
 *
 * Slow tier (two CLI renders of the gallery and one Chromium page each).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');

const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');
const CATALOG = require('../../../lib/core/inline-run-catalog.generated.js');
const { DEFAULT_SLOTS } = require('../../../lib/core/inline-run.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const GALLERY = path.join(ROOT, 'test', 'integration', 'baseline-decks', 'gallery.md');
const PILL = '`{LIVE, c3}`';
const TIMEOUT = 300000;

/**
 * The gallery source with a pill inserted after the second word of every list item that has a plain
 * label: outside fenced code, outside tables, and only where the line holds no inline code already.
 */
function injectPills(markdown) {
  let fenced = false;
  return markdown.split('\n').map((line) => {
    if (line.trim().startsWith('```')) fenced = !fenced;
    const m = /^(\s*(?:\d+\.|[-*])\s+)(\S+\s+\S+\s+)(.+)$/.exec(line);
    if (fenced || !m || line.includes('`') || line.trimStart().startsWith('|')) return line;
    return `${m[1]}${m[2]}${PILL} ${m[3]}`;
  }).join('\n');
}

/** Declared slots per component, read from the same catalog the transformer reads. */
const SLOTS = Object.fromEntries(Object.entries(CATALOG).map(([name, row]) => [name, [...DEFAULT_SLOTS, ...(row.slots || [])]]));

/** Runs in the page: every flex or grid host whose label would split, as `component | host | html`. */
function findSplitHosts(slotsByComponent, defaults) {
  const BLOCKS = /^(UL|OL|P|DIV|TABLE|BLOCKQUOTE|PRE|FIGURE|HR|DL|SECTION|H[1-6])$/;
  const out = [];
  for (const sec of document.querySelectorAll('section')) {
    const tokens = (sec.getAttribute('class') || '').split(/\s+/);
    const component = Object.keys(slotsByComponent).find((n) => tokens.includes(n));
    const slots = component ? slotsByComponent[component] : defaults;
    const isSlot = (n) => n.nodeType === 1 && slots.some((s) => n.matches(s));
    for (const el of sec.querySelectorAll('*')) {
      if (el.closest('svg,pre,code,[data-lattice-berth],[aria-hidden="true"],script,style')) continue;
      if (!/^(inline-)?(flex|grid)$/.test(getComputedStyle(el).display)) continue;
      let kids = [...el.childNodes];
      const block = kids.findIndex((n) => n.nodeType === 1 && BLOCKS.test(n.tagName));
      if (block >= 0) kids = kids.slice(0, block);
      const blank = (n) => n.nodeType === 3 && !n.nodeValue.trim();
      while (kids.length && blank(kids[kids.length - 1])) kids.pop();
      while (kids.length && isSlot(kids[kids.length - 1])) {
        kids.pop();
        while (kids.length && blank(kids[kids.length - 1])) kids.pop();
      }
      const lead = kids.find((n) => !blank(n));
      if (!lead || isSlot(lead)) continue;
      const text = kids.some((n) => n.nodeType === 3 && n.nodeValue.trim());
      const element = kids.some((n) => n.nodeType === 1 && !n.classList.contains('lat-run'));
      if (text && element) {
        out.push(`${sec.dataset.class || '?'} | ${el.tagName.toLowerCase()} | ${el.outerHTML.slice(0, 140).replace(/\s+/g, ' ')}`);
      }
    }
  }
  return out;
}

describe('inline objects never split a list item\'s label', { skip: skipWithoutChrome(resolveChrome()) }, () => {
  const chrome = resolveChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-inline-run-'));
  let browser;

  /** Render the injected gallery to HTML, optionally with the transformer's catalog emptied. */
  function render(name, { withoutTransformer }) {
    const md = path.join(tmp, `${name}.md`);
    const html = path.join(tmp, `${name}.html`);
    fs.writeFileSync(md, injectPills(fs.readFileSync(GALLERY, 'utf8')));
    const args = [];
    if (withoutTransformer) {
      const stub = path.join(tmp, 'stub.js');
      const catalog = require.resolve('../../../lib/core/inline-run-catalog.generated.js');
      fs.writeFileSync(stub, `const p=${JSON.stringify(catalog)};require.cache[p]={id:p,filename:p,loaded:true,exports:{}};`);
      args.push('-r', stub);
    }
    const r = spawnSync(process.execPath, [...args, path.join(ROOT, 'lattice.js'), md, html, '-q'], {
      cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, CHROME_PATH: chrome },
    });
    assert.equal(r.status, 0, `render failed: ${r.stderr || r.stdout}`);
    return html;
  }

  async function splitsIn(html) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      return await page.evaluate(findSplitHosts, SLOTS, DEFAULT_SLOTS);
    } finally {
      await page.close();
    }
  }

  before(async () => {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  });
  after(async () => {
    if (browser) await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('with the transformer: no flex or grid host holds a label next to an inline object', { timeout: TIMEOUT }, async () => {
    const found = await splitsIn(render('with', { withoutTransformer: false }));
    assert.deepEqual(found.slice(0, 8), [], `${found.length} flex or grid host(s) split a label; a component that makes its list items flex or grid containers must declare \`inlineRun\` in its manifest (lib/components/manifest.schema.json)`);
  });

  test('without the transformer: the same probe finds the splits (the arm that proves it can fail)', { timeout: TIMEOUT }, async () => {
    const found = await splitsIn(render('without', { withoutTransformer: true }));
    assert.ok(found.length >= 20, `the probe found only ${found.length} splits on an unfixed render; the defect measured 63 or more, so the instrument no longer sees it`);
  });
});
