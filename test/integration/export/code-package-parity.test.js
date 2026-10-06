/**
 * Every shipped transform, exported as a code package, renders in the CLI's locked page exactly as
 * the in-repo render does (portable-packages phase 6, step 2; contract note §8).
 *
 * For each package `bundleCodePackage` builds (lib/packages/code-bundle.js): render the component's
 * own gallery deck with the engine, capture the HTML its registry adapter was handed, and run every
 * slide that adapter owns, with its deck position and the render's id prefix, through two paths —
 *   IN-REPO  the adapter itself, in Node, with the whole engine loaded;
 *   PACKAGE  the frozen bundle, in a page from `openSandboxPage` whose script is the bundle and
 *            the runner around it, with `kit.measure` and nothing else from the host.
 * The two must be byte-identical. The in-repo side is pinned to the deck render too: the adapter
 * run on one slide alone gives the same section the whole-deck render gave, so "in-repo" means the
 * render a user gets, not a convenient stand-in for it. That is the CLI's render (no `baseUrl`)
 * and the adapter's own output, before any sanitizer a door will add (contract note §5); a case
 * below carries an id prefix and an asset base, which no gallery deck exercises. Slides the package
 * does not own, and no chart owns, must come back unchanged.
 *
 * The page asks for nothing: the request log is attached before the bundle loads, and a case
 * below shows a request made at load is refused by the page's policy before it exists. Each chart package carries its own kernel and no
 * other chart's, and a chart handed the wrong position fails, so the comparison can fail.
 *
 * Slow tier: one Chromium launch, one page per package.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { codePackages, bundleCodePackage } = require('../../../lib/packages/code-bundle.js');
const { launchSandboxBrowser, openPackageSandbox, workerScript, runPackage } = require('../../../lib/core/code-sandbox.js');
const { splitSections } = require('../../../lib/core/split-sections.js');
const { enterSlideIds, renderIdPrefix } = require('../../../lib/core/render-ids.js');
const { LAYOUTS } = require('../../../lib/plugins/chart-family/shared/chart-registry.generated.js');
const engine = require('../../../lib/engine');
const { slideFacts } = require('../../../lib/packages/slide-facts.mjs');
const { openSanitizerPage } = require('../../../lib/packages/code-door-worker.js');
const { doorFilterAttr, handedOf } = require('../../../lib/core/door-attr.mjs');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const TIMEOUT = 600000;

/** The deck that shows a package off: its component's gallery, or the `qr` variant's example. */
function sampleDeck(name) {
  if (name === 'qr') return path.join(ROOT, 'examples', 'qr.md');
  const [hit] = fs.globSync(`lib/components/*/${name}/${name}.gallery.md`, { cwd: ROOT });
  assert.ok(hit, `no gallery deck for ${name}`);
  return path.join(ROOT, hit);
}

/** Render `deck` and return what `adapter.applyToHtml` was handed and what it gave back. */
function captureAdapter(adapterPath, deck) {
  const adapter = require(adapterPath);
  const original = adapter.applyToHtml;
  let seen = null;
  adapter.applyToHtml = function capture(html, ctx) {
    const idPrefix = renderIdPrefix();
    const out = original.call(this, html, ctx);
    if (!seen) seen = { input: html, output: out, idPrefix, ctx };
    return out;
  };
  try {
    engine.render(fs.readFileSync(deck, 'utf8'));
  } finally {
    adapter.applyToHtml = original;
  }
  assert.ok(seen, `${path.basename(adapterPath)} never ran on ${path.relative(ROOT, deck)}`);
  return { adapter, ...seen };
}

/** Each package bundled once for the whole file. */
const bundles = new Map();
const bundled = (name) => {
  if (!bundles.has(name)) bundles.set(name, bundleCodePackage(name));
  return bundles.get(name);
};

/** The in-repo adapter on one slide alone, entered at the slide's deck position. */
function inRepo(adapter, slide, ctx = {}) {
  enterSlideIds(slide.idPrefix, slide.index);
  return adapter.applyToHtml(slide.html, ctx);
}

/** Run `slides` through `name`'s package in one locked page; returns the outputs and everything it tried to reach. */
async function inSandbox(browser, name, slides) {
  const asked = [];
  // The page's policy refuses a request before interception would see it, and says so on the
  // console, so both are listened to: together they are everything the package tried.
  const sandbox = await openPackageSandbox(browser, (await bundled(name)).code, {
    onRequest: (url) => asked.push(url),
    onConsole: (text) => /Content Security Policy/.test(text) && asked.push(text),
  });
  try {
    const outs = [];
    for (const slide of slides) outs.push(await runPackage(sandbox, slide));
    return { outs, asked };
  } finally {
    await sandbox.close();
  }
}

const sections = (html) => splitSections(html).filter((p) => p.type === 'section').map((p) => p.openTag + p.inner + p.close);
const chartOf = (openTag) => {
  const cls = new Set((openTag.match(/\bclass="([^"]*)"/)?.[1] || '').split(/\s+/));
  return LAYOUTS.find((l) => cls.has(l));
};

describe('code packages: every shipped transform runs in the locked page and matches the in-repo render', { timeout: TIMEOUT }, () => {
  const puppeteer = require('puppeteer');
  let browser;
  let sanitizer;
  let nodeSanitize;
  let census;
  const losses = new Map();
  const classTokens = new Map();
  const table = [];
  const afterDoor = { changed: 0, slides: 0 };

  test.before(async () => {
    browser = await launchSandboxBrowser(puppeteer, { headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    // THE DOOR'S SANITIZER, and the export's Node one beside it with the same address rule (the
    // package keeps only the addresses the slide it was handed held): the door's output must be
    // what the export's own sanitizer makes of the in-repo render (followups.d/2314-p4, "run the
    // parity comparison again after the door's sanitizer").
    sanitizer = await openSanitizerPage(browser);
    const { JSDOM } = require('jsdom');
    const DOMPurify = require('dompurify');
    const { createSlideSanitizer } = await import('../../../lib/core/sanitize-slide-html.mjs');
    const win = new JSDOM('').window;
    let filterAttr = () => false;
    const sanitize = createSlideSanitizer(DOMPurify, win, { filterAttr: (t, n, v) => filterAttr(t, n, v) });
    // What a door's sanitizer REMOVES from a slide: each element and each attribute the raw output
    // has that the sanitized one lacks, as `tag` and `tag@attr` counts.
    census = (html) => {
      const tpl = win.document.createElement('template');
      tpl.innerHTML = html;
      const counts = new Map();
      const bump = (k) => counts.set(k, (counts.get(k) || 0) + 1);
      for (const el of tpl.content.querySelectorAll('*')) {
        bump(el.localName);
        // Class TOKENS are counted apart (classTokens below): the door keeps a class only if the slide
        // carried it or it is in the package's name, and our 29 were never written to that rule.
        // Ids too: a package's ids live in its name, and our 29 mint chart ids that do not.
        for (const a of el.attributes) if (a.name !== 'class' && a.name !== 'id') bump(`${el.localName}@${a.name}`);
      }
      return counts;
    };
    nodeSanitize = (html, handedHtml, pkg) => {
      const tpl = win.document.createElement('template');
      tpl.innerHTML = handedHtml;
      const handed = tpl.content.querySelector('section');
      filterAttr = doorFilterAttr(handedOf([handed, ...handed.querySelectorAll('*')], pkg));
      return sanitize(html);
    };
  });
  test.after(async () => {
    await sanitizer?.close();
    await browser?.close();
    if (classTokens.size) console.log(`\nclass tokens outside a package's name, dropped by the door: ${[...classTokens].filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    if (afterDoor.slides) console.log(`\nafter the door's sanitizer: ${afterDoor.slides} slides, ${afterDoor.changed} changed by it, every one equal to the export's Node sanitizer`);

    if (table.length) console.log(`\n${table.join('\n')}`);
  });

  test('every component transform file is frozen into a package, and a chart carries only its own kernel', async () => {
    const files = fs.globSync('lib/components/*/*/*.transform.js', { cwd: ROOT }).sort();
    const pkgs = codePackages();
    const inputsOf = new Map();
    for (const p of pkgs) inputsOf.set(p.name, (await bundled(p.name)).inputs);
    const covered = new Set([...inputsOf.values()].flat());
    assert.deepEqual(files.filter((f) => !covered.has(f)), [], 'a shipped transform no package carries');
    for (const p of pkgs.filter((q) => q.chart)) {
      const kernels = inputsOf.get(p.name).filter((f) => /^lib\/components\/chart\/[^_][^/]*\/[^/]+\.transform\.js$/.test(f));
      assert.deepEqual(kernels, [path.relative(ROOT, p.chart.file)], `${p.name} must carry its own kernel and no other chart's`);
    }
  });

  test('the transform is handed measure() and nothing else, in a worker with no document, and measure() works', async () => {
    const probe = 'function t(s,k){return JSON.stringify([Object.keys(s),Object.keys(k),k.measure("Lattice","16px serif")>0,Object.isFrozen(k),typeof document,typeof location.assign,Object.isFrozen(s.facts.blocks[0]),s.facts.title])}export{t as default};';
    const sandbox = await openPackageSandbox(browser, probe);
    try {
      // `facts` (slide-facts.mjs) arrives frozen all the way down.
      const facts = slideFacts('<section><h2>Hi</h2></section>');
      assert.equal(await runPackage(sandbox, { html: '<section></section>', facts, index: 0 }), JSON.stringify([['html', 'facts', 'index', 'idPrefix', 'baseUrl'], ['measure'], true, true, 'undefined', 'undefined', true, 'Hi']));
    } finally {
      await sandbox.close();
    }
  });

  test('the runner refuses what the export never writes, and bounds a run', async () => {
    assert.throws(() => workerScript('export default function(){}'), /export \{ name as default \}/);
    const cases = {
      'not a string': ['function t(){return 7}export{t as default};', /returned number, not a string/],
      'an object': ['function t(){return {a:1}}export{t as default};', /returned object, not a string/],
      'a function': ['function t(){return {toString(){return "x"}}}export{t as default};', /cannot be sent back/],
      'too long': ['function t(){return "x".repeat(5000000)}export{t as default};', /5000000 characters, past the 4000000-character limit/],
      'a throw': ['function t(){throw new Error("nope")}export{t as default};', /nope/],
      'a run past its time': ['function t(){for(;;);}export{t as default};', /did not finish within 300 ms/],
      'a slide with no position': ['function t(s){return s.html}export{t as default};', /slide index must be a whole number/, { html: '<section></section>' }],
    };
    for (const [label, [code, expected, slide = { html: '<section></section>', index: 0 }]] of Object.entries(cases)) {
      const sandbox = await openPackageSandbox(browser, code);
      try {
        await assert.rejects(runPackage(sandbox, slide, { timeoutMs: 300 }), expected, label);
      } finally {
        await sandbox.close();
      }
    }
  });

  test('the worker has no network constructors, and the bundle cannot put them back', async () => {
    // The second wall (code-door-core.mjs WORKER_NETWORK): the policy's inheritance is each engine's
    // to get right, and Firefox let EventSource out of a worker the policy covered.
    const probe = 'try{delete self.EventSource}catch(e){}try{Object.defineProperty(self,"fetch",{value:()=>1})}catch(e){}try{self.WebSocket=function(){}}catch(e){}function t(s){return JSON.stringify(["fetch","XMLHttpRequest","WebSocket","EventSource","WebTransport","importScripts","Worker"].map((n)=>typeof self[n]))}export{t as default};';
    const sandbox = await openPackageSandbox(browser, probe);
    try {
      assert.equal(await runPackage(sandbox, { html: '<section></section>', index: 0 }), JSON.stringify(Array(7).fill('undefined')));
    } finally {
      await sandbox.close();
    }
  });

  test('the bundle cannot reach the runner: it lives in another realm', async () => {
    // The first runner shared the page with the bundle, which could claim `__latticeRun` first (the
    // red team did). In the worker there is no such name to take, and a reply the bundle forges is
    // held to the same checks as a real one.
    const forge = 'try{self.__latticeRun=()=>"forged"}catch(e){}self.addEventListener("message",(e)=>postMessage({id:e.data.id,out:12345}));function t(s){return s.html}export{t as default};';
    const sandbox = await openPackageSandbox(browser, forge);
    try {
      await assert.rejects(runPackage(sandbox, { html: '<section></section>', index: 0 }), /returned number, not a string/);
    } finally {
      await sandbox.close();
    }
  });

  test('a bundle that loops at load, or a tail padded to stall the parser, is bounded', async () => {
    const t0 = Date.now();
    assert.throws(() => workerScript(`function t(){}export{t as default}${' '.repeat(1_000_000)}x`), /must end in/);
    assert.ok(Date.now() - t0 < 1000, `the tail check took ${Date.now() - t0} ms`);
    await assert.rejects(openPackageSandbox(browser, 'for(;;);function t(){}export{t as default};', { loadTimeoutMs: 500 }), /did not finish loading within 500 ms/);
  });

  test('a request the bundle makes while it loads reaches nothing: it is made, and refused', async () => {
    const asked = [];
    const said = [];
    // The package reports what its own fetch got, so the test sees the request was made and refused.
    const beacon = 'try{fetch("https://example.com/at-load").then(()=>console.log("FETCH-OK"),(e)=>console.log("FETCH-REFUSED "+e.message))}catch(e){console.log("FETCH-REFUSED "+e.message)}function t(s){return s.html}export{t as default};';
    const sandbox = await openPackageSandbox(browser, beacon, { onRequest: (url) => asked.push(url), onConsole: (text) => said.push(text) });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await runPackage(sandbox, { html: '<section>x</section>', index: 0 }), '<section>x</section>');
    await sandbox.close();
    assert.deepEqual(asked, [], 'the policy refuses it before interception would see it');
    assert.ok(said.some((t) => /^FETCH-REFUSED /.test(t)), `the fetch must have been made and refused: ${said.join(' | ')}`);
    assert.ok(!said.includes('FETCH-OK'));
  });

  test('an error the package throws later, from a timer, does not end it', async () => {
    const late = 'function t(s){setTimeout(()=>{throw new Error("late")},0);return s.html}export{t as default};';
    const sandbox = await openPackageSandbox(browser, late);
    try {
      for (const i of [0, 1, 2]) {
        assert.equal(await runPackage(sandbox, { html: `<section>${i}</section>`, index: i }), `<section>${i}</section>`);
        await new Promise((r) => setTimeout(r, 50));
      }
    } finally {
      await sandbox.close();
    }
  });

  test('two runs at once queue: a slide waiting behind another does not spend its own time', async () => {
    const slow = 'function t(s){const end=Date.now()+600;while(Date.now()<end);return s.html}export{t as default};';
    const sandbox = await openPackageSandbox(browser, slow);
    try {
      const outs = await Promise.all([0, 1].map((i) => runPackage(sandbox, { html: `<section>${i}</section>`, index: i }, { timeoutMs: 1000 })));
      assert.deepEqual(outs, ['<section>0</section>', '<section>1</section>']);
    } finally {
      await sandbox.close();
    }
  });

  test('the comparison can fail: a chart handed the wrong position differs from the deck render', async () => {
    const { adapter, input, idPrefix, ctx } = captureAdapter(codePackages().find((p) => p.name === 'bar').adapter, sampleDeck('bar'));
    const i = sections(input).findIndex((h) => chartOf(h.slice(0, h.indexOf('>') + 1)) === 'bar');
    const html = sections(input)[i];
    const expected = inRepo(adapter, { html, index: i, idPrefix }, ctx);
    const { outs } = await inSandbox(browser, 'bar', [{ html, index: i + 1, idPrefix }]);
    assert.notEqual(outs[0], expected);
  });

  test('the id prefix and the asset base reach the package as they reach the in-repo render', async () => {
    const charts = captureAdapter(codePackages().find((p) => p.name === 'bar').adapter, sampleDeck('bar'));
    const i = sections(charts.input).findIndex((h) => chartOf(h.slice(0, h.indexOf('>') + 1)) === 'bar');
    const barSlide = { html: sections(charts.input)[i], index: i, idPrefix: 'lat-r2-' };
    const barExpected = inRepo(charts.adapter, barSlide, charts.ctx);
    assert.match(barExpected, /id="lat-r2-/, 'the prefix case must mint a prefixed id');
    assert.deepEqual((await inSandbox(browser, 'bar', [barSlide])).outs, [barExpected]);

    const people = captureAdapter(codePackages().find((p) => p.name === 'team-profile').adapter, sampleDeck('team-profile'));
    const baseUrl = 'https://studio.example/decks/42/';
    const slides = sections(people.input).map((html, index) => ({ html, index, idPrefix: '', baseUrl }));
    const expected = slides.map((s) => inRepo(people.adapter, s, { baseUrl }));
    assert.ok(expected.some((h) => h.includes(`src="${baseUrl}`)), 'the base case must resolve an asset against the base');
    assert.deepEqual((await inSandbox(browser, 'team-profile', slides)).outs, expected);
  });

  for (const pkg of codePackages()) {
    test(`${pkg.name}: the package renders every slide exactly as the in-repo render`, async () => {
      const deck = sampleDeck(pkg.name);
      const { adapter, input, output, idPrefix, ctx } = captureAdapter(pkg.adapter, deck);
      const ins = sections(input);
      const outs = sections(output);
      assert.equal(outs.length, ins.length, 'the adapter must not add or drop a slide');
      const owned = [];
      const others = [];
      for (let i = 0; i < ins.length; i++) {
        const slide = { html: ins[i], index: i, idPrefix };
        const chart = chartOf(ins[i].slice(0, ins[i].indexOf('>') + 1));
        if (pkg.chart ? chart === pkg.name : outs[i] !== ins[i]) {
          const alone = inRepo(adapter, slide, ctx);
          assert.equal(alone, outs[i], `slide ${i + 1}: the adapter on this slide alone must give what the deck render gave`);
          owned.push({ slide, expected: alone });
        } else if (!chart) {
          // Not this package's slide, and no chart's either: the package must leave it alone. (A
          // slide another chart claims first is the doors' job to route; followups.d/2314-p4.)
          assert.equal(outs[i], ins[i], `slide ${i + 1}: the in-repo adapter changed a slide it does not own`);
          others.push({ slide, expected: ins[i] });
        }
      }
      assert.ok(owned.length > 0, `${path.relative(ROOT, deck)} has no slide ${pkg.name} transforms`);

      const all = [...owned, ...others];
      const { outs: got, asked } = await inSandbox(browser, pkg.name, all.map((s) => s.slide));
      for (const [k, s] of all.entries()) {
        assert.equal(got[k], s.expected, `slide ${s.slide.index + 1} of ${path.relative(ROOT, deck)}: the package differs from the in-repo render`);
      }
      assert.deepEqual(asked, [], 'the package asked for nothing');
      // Again after the door's sanitizer: the same bytes as the export's own sanitizer makes of the
      // in-repo render, with the slide's own classes kept, on every slide.
      for (const [k, s] of all.entries()) {
        const done = await sanitizer.finish(got[k], s.slide.html, 10000, pkg.name);
        assert.equal(done.error, undefined, `slide ${s.slide.index + 1}: the door refused the package's output: ${done.error}`);
        assert.equal(done.html, nodeSanitize(s.expected, s.slide.html, pkg.name), `slide ${s.slide.index + 1} of ${path.relative(ROOT, deck)}: the door's sanitizer differs from the export's`);
        afterDoor.slides++;
        if (done.html !== s.expected) afterDoor.changed++;
        const [before, after] = [census(s.expected), census(done.html)];
        const tokens = (h) => (h.match(/\sclass="([^"]*)"/g) || []).reduce((n, m) => n + m.slice(8, -1).split(/\s+/).filter(Boolean).length, 0);
        classTokens.set(pkg.name, (classTokens.get(pkg.name) || 0) + tokens(s.expected) - tokens(done.html));
        for (const [k, n] of before) if ((after.get(k) || 0) < n) losses.set(`${pkg.name} ${k}`, (losses.get(`${pkg.name} ${k}`) || 0) + n - (after.get(k) || 0));
      }
      const bundle = await bundled(pkg.name);
      table.push(`${pkg.name.padEnd(14)} ${String(owned.length).padStart(3)} + ${String(others.length).padStart(2)} slides  ${String(bundle.bytes).padStart(7)} B  ${bundle.inputs.length} files  sha256 ${bundle.sha256.slice(0, 12)}`);
    });
  }
  // What the door's sanitizer REMOVES from our own 29, pinned: the sanitizer must not quietly start
  // eating content a package draws (the inversion lens: comparing the door with the export's
  // sanitizer on the same input could never see that, since both remove the same thing). Each entry
  // is a loss the door means to cause:
  //   scene section@data-img-*    — the image markers the engine stamps (and stamps again after the
  //       door on the section's own tag, which the splice keeps), not the package's to set;
  //   journey p@data-lattice-desc — an engine-namespaced attribute the slide did not hand over;
  //       a package names its own data-* attributes (lib/core/door-attr.mjs doorFilterAttr).
  //   video a@href, a@style       — the poster link and thumbnail are addresses the transform
  //       BUILT from the bullet's text; the slide held none as an address, so the door drops them.
  //   video a@target              — the slide sanitizer strips target="_blank" from every slide.
  test("the door's sanitizer removes only what it means to from the 29 packages' output", () => {
    assert.ok(afterDoor.slides > 0, 'runs after the package tests');
    assert.deepEqual([...losses].sort(), [
      ['journey p@data-lattice-desc', 9],
      ['scene section@data-img-bucket', 10],
      ['scene section@data-img-composition', 10],
      ['video a@href', 7],
      ['video a@style', 3],
      ['video a@target', 7],
    ]);
  });
});
