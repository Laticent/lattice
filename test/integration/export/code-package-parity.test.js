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
const { launchSandboxBrowser, openSandboxPage, packageScript, runPackage } = require('../../../lib/core/code-sandbox.js');
const { splitSections } = require('../../../lib/core/split-sections.js');
const { enterSlideIds, renderIdPrefix } = require('../../../lib/core/render-ids.js');
const { LAYOUTS } = require('../../../lib/components/chart/_chart-family/chart-registry.generated.js');
const engine = require('../../../lib/engine');

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
  const sandbox = await openSandboxPage(browser, {
    script: packageScript((await bundled(name)).code),
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
  const table = [];

  test.before(async () => {
    browser = await launchSandboxBrowser(puppeteer, { headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  });
  test.after(async () => {
    await browser?.close();
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

  test('the transform is handed measure() and nothing else, and measure() works in the page', async () => {
    const probe = 'function t(s,k){return JSON.stringify([Object.keys(s),Object.keys(k),k.measure("Lattice","16px serif")>0,Object.isFrozen(k)])}export{t as default};';
    const sandbox = await openSandboxPage(browser, { script: packageScript(probe) });
    try {
      assert.equal(await runPackage(sandbox, { html: '<section></section>', index: 0 }), JSON.stringify([['html', 'index', 'idPrefix', 'baseUrl'], ['measure'], true, true]));
    } finally {
      await sandbox.close();
    }
  });

  test('the runner refuses what the export never writes, and bounds a run', async () => {
    assert.throws(() => packageScript('export default function(){}'), /export \{ name as default \}/);
    const cases = {
      'not a string': ['function t(){return 7}export{t as default};', /returned number, not a string/],
      'a throw': ['function t(){throw new Error("nope")}export{t as default};', /nope/],
      'a run past its time': ['function t(){for(;;);}export{t as default};', /did not finish within 300 ms/],
      'a slide with no position': ['function t(s){return s.html}export{t as default};', /slide index must be a whole number/, { html: '<section></section>' }],
    };
    for (const [label, [code, expected, slide = { html: '<section></section>', index: 0 }]] of Object.entries(cases)) {
      const sandbox = await openSandboxPage(browser, { script: packageScript(code) });
      try {
        await assert.rejects(runPackage(sandbox, slide, { timeoutMs: 300 }), expected, label);
      } finally {
        await sandbox.close();
      }
    }
  });

  test('a hostile bundle cannot switch the checks off: the host checks the result again', async () => {
    // The bundle's top level runs before the runner, so it can claim `__latticeRun` first.
    const own = (ret) => `Object.defineProperty(window,"__latticeRun",{value:()=>${ret}});function t(s){return s.html}export{t as default};`;
    for (const [ret, expected] of [
      ['({toString(){return "x"}})', /returned object, not a string/],
      ['12345', /returned number, not a string/],
      ['"x".repeat(5000000)', /5000000 characters, past the 4000000-character limit/],
    ]) {
      const sandbox = await openSandboxPage(browser, { script: packageScript(own(ret)) });
      try {
        await assert.rejects(runPackage(sandbox, { html: '<section></section>', index: 0 }), expected, ret);
      } finally {
        await sandbox.close();
      }
    }
  });

  test('a bundle that loops at load, or a tail padded to stall the parser, is bounded', async () => {
    const t0 = Date.now();
    assert.throws(() => packageScript(`function t(){}export{t as default}${' '.repeat(1_000_000)}x`), /must end in/);
    assert.ok(Date.now() - t0 < 1000, `the tail check took ${Date.now() - t0} ms`);
    await assert.rejects(openSandboxPage(browser, { script: packageScript('for(;;);function t(){}export{t as default};'), loadTimeoutMs: 500 }), /timeout/i);
  });

  test('a request the bundle makes while it loads is refused by the page policy before it exists', async () => {
    // The request log is attached before the bundle loads, but an image asked for at load never
    // reaches it: the page's policy refuses it first, and says so on the console.
    const asked = [];
    const said = [];
    const beacon = 'new Image().src="https://example.com/at-load";function t(s){return s.html}export{t as default};';
    const sandbox = await openSandboxPage(browser, { script: packageScript(beacon), onRequest: (url) => asked.push(url), onConsole: (text) => said.push(text) });
    await new Promise((r) => setTimeout(r, 300));
    await sandbox.close();
    assert.deepEqual(asked, []);
    assert.ok(
      said.some((t) => /^Refused to load the image 'https:\/\/example\.com\/at-load' because it violates the following Content Security Policy directive: "img-src data: blob:"/.test(t)),
      `the policy must have refused the beacon: ${said.join(' | ')}`,
    );
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
      const bundle = await bundled(pkg.name);
      table.push(`${pkg.name.padEnd(14)} ${String(owned.length).padStart(3)} + ${String(others.length).padStart(2)} slides  ${String(bundle.bytes).padStart(7)} B  ${bundle.inputs.length} files  sha256 ${bundle.sha256.slice(0, 12)}`);
    });
  }
});
