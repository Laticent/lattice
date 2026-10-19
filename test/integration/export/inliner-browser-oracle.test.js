/**
 * A differential check of the player's local-file inliner against a real browser.
 *
 * The inliner (lib/export/html-player.js, `inlineDocAssets` and its CSS reader `mapCssUrls`) must read every `file://` picture a
 * browser loads from a `style` attribute or a `<style>` body, or the author's local path ships in the shared file (HARD RULE #22).
 * Reviewing that by hand found one disagreement per pass (a url with whitespace before `)`, a string ended by a newline, a CRLF
 * escape, an SVG style split by a child, a CSS escape in an address). This asks the browser instead: a seeded corpus of CSS
 * built from comments, strings, escapes, whitespace, newlines, case, nests and the shapes those reviews found, one DISTINCT file
 * per address, loaded in headless Chromium. The set Chromium requests must be a subset of the set the inliner reads.
 *
 * The other direction (the inliner reads a file the browser does not load) is not asserted, because the reader cannot know what
 * the cascade or a property's grammar discards. It is bounded instead: every over-read must come from the one shape that is
 * invalid CSS (a comma list on a single-image property), so a new class of over-read fails the test.
 *
 * Each channel gets its own files: Chromium's memory cache would otherwise hide a second load of the same address.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');
const { inlineDocAssets } = require('../../../lib/export/html-player.js');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// One property per piece: with one property the cascade keeps only the last declaration and the browser loads only that one.
const PROPS = ['background-image', 'border-image-source', 'list-style-image', 'mask-image', '-webkit-mask-image'];

function corpus(next, dir, count, ids) {
  const pick = (a) => a[Math.floor(next() * a.length)];
  const file = () => {
    const n = `u${ids.n++}`;
    fs.writeFileSync(path.join(dir, `${n}.png`), PNG);
    return n;
  };
  // The same address written four ways, through CSS escapes.
  const spell = (n) => {
    const href = pathToFileURL(path.join(dir, `${n}.png`)).href;
    const dot = href.lastIndexOf('.');
    const lead = href.lastIndexOf('/') + 1;
    switch (pick(['plain', 'plain', 'esc-dot', 'hex-dot', 'hex-dot6', 'esc-letter'])) {
      case 'esc-dot': return `${href.slice(0, dot)}\\.${href.slice(dot + 1)}`;
      case 'hex-dot': return `${href.slice(0, dot)}\\2e ${href.slice(dot + 1)}`;
      case 'hex-dot6': return `${href.slice(0, dot)}\\00002e${href.slice(dot + 1)}`;
      case 'esc-letter': return `${href.slice(0, lead)}\\${href[lead]}${href.slice(lead + 1)}`;
      default: return href;
    }
  };
  const piece = (prop) => {
    const a = spell(file());
    switch (pick(['bare', 'dq', 'sq', 'ws', 'nl', 'wsq', 'URL', 'comment', 'str-dq', 'str-sq', 'nest', 'escparen', 'empty-then', 'unterminated-str', 'crlf-esc', 'prefix-ident', 'imageset-str', 'imageset-url', 'webkit-imageset', 'imageset-both'])) {
      case 'bare': return `${prop}:url(${a});`;
      case 'dq': return `${prop}:url("${a}");`;
      case 'sq': return `${prop}:url('${a}');`;
      case 'ws': return `${prop}:url( ${a} );`;
      case 'nl': return `${prop}:url(\n${a}\n);`;
      case 'wsq': return `${prop}:url( "${a}" );`;
      case 'URL': return `${prop}:URL(${a});`;
      case 'comment': return `/* ${prop}:url(${a}); */color:red;`;
      case 'str-dq': return `content:"url(${a})";`;
      case 'str-sq': return `content:'url(${a})';`;
      case 'nest': return `${prop}:url(x/url(${a}));`;
      case 'escparen': return `${prop}:url(q\\) url(${a}));`;
      case 'empty-then': return `${prop}:url(''),url(${a});`; // invalid on a single-image property: the browser drops it
      case 'unterminated-str': return `content:"oops\n;${prop}:url(${a});`;
      case 'crlf-esc': return `content:'a\\\r\nb';${prop}:url(${a});`;
      case 'imageset-str': return `${prop}:image-set("${a}" 1x);`;
      case 'imageset-url': return `${prop}:image-set(url(${a}) 1x);`;
      case 'webkit-imageset': return `${prop}:-webkit-image-set(url("${a}") 1x);`;
      case 'imageset-both': return `${prop}:image-set(url(${a}) 1x, "${a}" 2x);`;
      default: return `${prop}:myurl(${a});`;
    }
  };
  const out = [];
  for (let i = 0; i < count; i++) {
    let css = '';
    for (let j = 0; j < 1 + Math.floor(next() * 3); j++) css += pick(['', '/*x*/', ' ']) + piece(PROPS[j % PROPS.length]);
    out.push(css);
  }
  return out;
}

// The markup positions: an `<img srcset>`, a `<picture>`'s `<source srcset>`, a `<video poster>` and an SVG `<image href>`.
function markup(next, dir, count, ids) {
  const pick = (a) => a[Math.floor(next() * a.length)];
  const addr = () => {
    const n = `u${ids.n++}`;
    fs.writeFileSync(path.join(dir, `${n}.png`), PNG);
    return pathToFileURL(path.join(dir, `${n}.png`)).href;
  };
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = addr();
    const b = addr();
    out.push(pick([
      `<img srcset="${a} 1x, ${b} 2x" alt="">`,
      `<img srcset="${a}, ${b} 2x">`,
      `<img srcset="  ${a}   1x ,${b} 2x ">`,
      `<picture><source srcset="${a} 1x, ${b} 2x"><img src="data:," alt=""></picture>`,
      `<picture><source media="(min-width:1px)" srcset="${a}"><img src="data:," alt=""></picture>`,
      `<video poster="${a}" width="8" height="8"></video>`,
      `<svg width="8" height="8"><image href="${a}" width="8" height="8"/></svg>`,
      `<svg width="8" height="8"><image xlink:href="${a}" width="8" height="8"/></svg>`,
    ]));
  }
  return out;
}

test('every file:// picture a real Chromium loads from markup is one the inliner reads', async () => {
  let browser;
  try {
    browser = await require('puppeteer').launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  } catch (e) {
    assert.fail(`no browser to act as the oracle: ${e.message}`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inliner-oracle-html-'));
  try {
    const page = await browser.newPage();
    const loaded = new Set();
    page.on('request', (r) => {
      const m = /\/(u\d+)\.png(?:[?#]|$)/.exec(r.url());
      if (m) loaded.add(m[1]);
    });
    const file = path.join(dir, 'page.html');
    fs.writeFileSync(file, '<!doctype html><body></body>');
    await page.goto(pathToFileURL(file).href);
    const cases = markup(rng(20261019), dir, 160, { n: 0 });
    await page.evaluate((cs) => {
      document.body.innerHTML = cs.join('');
    }, cases);
    for (let last = -1, stable = 0; stable < 6; ) {
      await new Promise((r) => setTimeout(r, 250));
      if (loaded.size === last) stable++;
      else {
        stable = 0;
        last = loaded.size;
      }
    }
    const doc = new JSDOM(`<!doctype html><html><head></head><body>${cases.join('')}</body></html>`).window.document;
    const read = new Set();
    inlineDocAssets(doc, { confine: { allows(abs) { const m = /(u\d+)\.png$/.exec(abs); if (m) read.add(m[1]); return true; } } });
    const leaks = [...loaded].filter((n) => !read.has(n));
    assert.deepEqual(leaks, [], 'pictures the browser loads from markup and the inliner does not read');
    assert.ok(loaded.size > 100, `only ${loaded.size} browser loads were compared`);
  } finally {
    await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every file:// picture a real Chromium loads from CSS is one the inliner reads', async () => {
  let puppeteer;
  let browser;
  try {
    puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  } catch (e) {
    // A browser the sandbox can install is a surface we can reach (HARD RULE #23): this is a failure, not a skip.
    assert.fail(`no browser to act as the oracle: ${e.message}`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inliner-oracle-'));
  try {
    const page = await browser.newPage();
    const loaded = new Set();
    page.on('request', (r) => {
      const m = /\/(u\d+)\.png(?:[?#]|$)/.exec(r.url());
      if (m) loaded.add(m[1]);
    });
    const html = path.join(dir, 'page.html');
    fs.writeFileSync(html, '<!doctype html><body></body>');
    await page.goto(pathToFileURL(html).href);
    const next = rng(20261018);
    const ids = { n: 0 }; // one counter for both channels: a file name is never reused, so the browser's cache cannot hide a load
    let total = 0;
    for (const channel of ['attr', 'body']) {
      const cases = corpus(next, dir, 250, ids);
      loaded.clear();
      await page.evaluate((cs, ch) => {
        cs.forEach((css, i) => {
          const d = document.createElement('div');
          d.id = `c${i}`;
          d.style.cssText = 'display:list-item;width:8px;height:8px';
          if (ch === 'attr') d.setAttribute('style', `display:list-item;width:8px;height:8px;${css}`);
          document.body.appendChild(d);
          if (ch === 'body') {
            const s = document.createElement('style');
            s.textContent = `#c${i}{${css}}`;
            document.head.appendChild(s);
          }
        });
      }, cases, channel);
      // The corpus settles when no new request has arrived for 1.5 s.
      for (let last = -1, stable = 0; stable < 6; ) {
        await new Promise((r) => setTimeout(r, 250));
        if (loaded.size === last) stable++;
        else {
          stable = 0;
          last = loaded.size;
        }
      }
      const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
      const doc = dom.window.document;
      cases.forEach((css, i) => {
        const d = doc.createElement('div');
        d.id = `c${i}`;
        if (channel === 'attr') d.setAttribute('style', `display:list-item;width:8px;height:8px;${css}`);
        else {
          const s = doc.createElement('style');
          s.textContent = `#c${i}{${css}}`;
          doc.head.appendChild(s);
        }
        doc.body.appendChild(d);
      });
      const read = new Set();
      inlineDocAssets(doc, { confine: { allows(abs) { const m = /(u\d+)\.png$/.exec(abs); if (m) read.add(m[1]); return true; } } });
      const caseOf = (n) => cases.find((c) => c.includes(`/${n}.`) || c.includes(`/${n}\\`) || c.includes(`${n}.png`) || c.includes(`${n}\\`)) ?? '';
      const leaks = [...loaded].filter((n) => !read.has(n));
      assert.deepEqual(leaks.map((n) => `${n}: ${JSON.stringify(caseOf(n))}`), [], `${channel}: pictures the browser loads and the inliner does not read (their local path would ship)`);
      const over = [...read].filter((n) => !loaded.has(n));
      const unexplained = over.filter((n) => !/url\(''\),/.test(caseOf(n)) && !/url\(''\),/.test(cases.find((c) => c.includes(n)) ?? ''));
      assert.ok(unexplained.length === 0, `${channel}: over-reads outside the one invalid-CSS shape: ${unexplained.slice(0, 3).map((n) => JSON.stringify(caseOf(n))).join(' | ')}`);
      total += loaded.size;
      await page.evaluate(() => {
        document.body.innerHTML = '';
        document.head.innerHTML = '';
      });
    }
    assert.ok(total > 400, `only ${total} browser loads were compared; the corpus did not exercise the browser`);
  } finally {
    await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
