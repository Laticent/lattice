/**
 * The CLI door's worker process (contract note §9). `lib/packages/code-door.js` spawns it with
 * one JSON job on stdin and reads one JSON answer from stdout; the CLI's render is synchronous
 * top-level code, and a process of its own is also what bounds the whole door: the host kills it
 * when the render's budget is spent, whatever it is doing, the sanitizer included.
 *
 * Job:    { executablePath?, state?, slideMs, budgetMs,
 *           packages: { name: { code, minLayer } }, slides: [{ i, pkg, html, facts, index, idPrefix, baseUrl }] }
 * Answer: one JSON object per line on stdout — { t: 'launch', launchMs, layer, version },
 *         { t: 'refused', names }, { t: 'result', i, html, classes } or { t: 'result', i, error },
 *         { t: 'console', name, text }, { t: 'fatal', message }.
 *
 * THREE PAGES OF WORK, EACH IN ITS OWN BROWSER CONTEXT:
 *   - one locked page per package (lib/core/code-sandbox.js openSandboxPage): the package's code
 *     runs there and nowhere else;
 *   - one SANITIZER page, ours: DOMPurify and the slide sanitizer's allowlist
 *     (lib/core/sanitize-slide-html.mjs), the same code the Studio preview runs, in the same
 *     engine. No package code ever runs in it; it parses a package's output inertly (a
 *     `<template>` and DOMPurify's own document) and hands back sanitized text.
 * The sanitizer is not in Node because Node has no DOM the package depends on (jsdom is a
 * development dependency), and because in a page it is bounded like everything else here.
 */

const fs = require('node:fs');
const path = require('node:path');
const { openPackageSandbox, runPackage } = require('../core/code-sandbox.js');
const { launchCodeSandbox } = require('../core/os-sandbox.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CONSOLE_LINES = 5;
const CONSOLE_CHARS = 300;

/** A CommonJS leaf as a page script: `remote-ref.js` has no requires, so a module object is all it needs. */
const asPageScript = (file, global) =>
  `(()=>{const module={exports:{}};(function(module,exports){${fs.readFileSync(file, 'utf8')}\n})(module,module.exports);window.${global}=module.exports;})();`;

const DOOR_ATTR_IMPORT = "import remoteRef from './remote-ref.js';";

/**
 * Open the sanitizer page in `browser`. `finish(output, handedSection)` resolves to
 * `{ html, classes }` (sanitized, every address the package invented dropped) or `{ error }`.
 */
async function openSanitizerPage(browser) {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setRequestInterception(true);
    // Nothing leaves this page either: it is ours, but it parses a stranger's markup.
    page.on('request', (req) => (/^(?:data:|about:blank$)/.test(req.url()) ? req.continue() : req.abort('blockedbyclient')));
    await page.goto('data:text/html;charset=utf-8,<!doctype html><title>sanitizer</title>');
    await page.addScriptTag({ content: fs.readFileSync(require.resolve('dompurify/dist/purify.min.js'), 'utf8') });
    await page.addScriptTag({ content: asPageScript(path.join(ROOT, 'lib/core/remote-ref.js'), '__remoteRef') });
    // The door's rule reads remote-ref.js's parsers through its one import, given the page's copy.
    const doorAttr = fs.readFileSync(path.join(ROOT, 'lib/core/door-attr.mjs'), 'utf8').replace(DOOR_ATTR_IMPORT, 'const remoteRef = window.__remoteRef;');
    if (!doorAttr.includes('window.__remoteRef')) throw new Error('code door: door-attr.mjs no longer imports remote-ref.js the way the sanitizer page expects');
    await page.addScriptTag({ type: 'module', content: `${doorAttr}\nwindow.__doorFinish = doorFinish;` });
    await page.addScriptTag({ type: 'module', content: `${fs.readFileSync(path.join(ROOT, 'lib/core/sanitize-slide-html.mjs'), 'utf8')}\nwindow.__createSlideSanitizer = createSlideSanitizer;` });
    await page.waitForFunction(() => typeof window.__createSlideSanitizer === 'function' && typeof window.__doorFinish === 'function', { timeout: 5000 });
    await page.evaluate(() => {
      // The one sanitizer, with the door's attribute rule set for each call and every attribute
      // dropped between calls; the checks around it are the shared `doorFinish` (door-attr.mjs).
      let filterAttr = () => false;
      const sanitize = window.__createSlideSanitizer(window.DOMPurify, window, { filterAttr: (t, n, v) => filterAttr(t, n, v) });
      const withFilter = (html, filter) => {
        filterAttr = filter;
        try {
          return sanitize(html);
        } finally {
          filterAttr = () => false;
        }
      };
      window.__finish = (html, handedHtml, pkg) => window.__doorFinish(document, withFilter, html, handedHtml, pkg);
    });
    let closing = null;
    const close = () => (closing ??= context.close().catch(() => {}));
    return {
      close,
      /** Sanitize a package's output against the section it was handed. */
      async finish(html, handedHtml, timeoutMs, pkg) {
        let timer;
        const overrun = new Promise((resolve) => {
          timer = setTimeout(() => resolve({ error: `the sanitizer did not finish within ${timeoutMs} ms`, overrun: true }), timeoutMs);
        });
        try {
          return await Promise.race([page.evaluate((h, r, n) => window.__finish(h, r, n), html, handedHtml, pkg ?? null), overrun]);
        } finally {
          clearTimeout(timer);
        }
      },
    };
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
}

/** The OS layers, weakest first (lib/core/os-sandbox.js; code-door.js LAYER_RANK). */
const LAYER_RANK = { off: 0, unmeasured: 1, on: 2 };

/**
 * Run the job, telling `emit` each fact the moment it is known, one object at a time: the launch,
 * each slide's result, each console line. The host reads them as lines, so when it has to kill this
 * process at the render's limit it still has every slide that finished (the checker).
 */
async function run(job, emit) {
  const puppeteer = require('puppeteer');
  const t0 = Date.now();
  // Tell the host which browsers exist before anything else can go wrong: if it has to kill this
  // process, a browser (as `nobody`, in its own process group) would otherwise outlive it.
  const launched = [];
  const onLaunch = ({ pid, dir }) => {
    launched.push({ pid, dir });
    if (job.state) fs.writeFileSync(job.state, JSON.stringify(launched));
  };
  const sandbox = await launchCodeSandbox(puppeteer, { executablePath: job.executablePath || undefined, onLaunch });
  const started = Date.now();
  const spent = () => Date.now() - started;
  const fail = (s, error) => emit({ t: 'result', i: s.i, error });
  try {
    // The launch is not the packages' time: the host takes it out of the render's budget.
    emit({ t: 'launch', launchMs: started - t0, layer: sandbox.layer, version: sandbox.version });
    // A package approved with a stronger OS layer than this browser gives runs NOT AT ALL: the host
    // refuses the render and says why, before any of its code has run here.
    const refused = Object.entries(job.packages).filter(([, p]) => p.minLayer && LAYER_RANK[sandbox.layer.os] < LAYER_RANK[p.minLayer]).map(([n]) => n);
    if (refused.length) {
      emit({ t: 'refused', names: refused });
      return;
    }
    let sanitizer = await openSanitizerPage(sandbox.browser);
    for (const name of [...new Set(job.slides.map((s) => s.pkg))]) {
      const mine = job.slides.filter((s) => s.pkg === name);
      let said = 0;
      const open = () =>
        openPackageSandbox(sandbox.browser, job.packages[name].code, {
          onConsole: (text) => said++ < CONSOLE_LINES && emit({ t: 'console', name, text: String(text).slice(0, CONSOLE_CHARS) }),
        });
      // Opening a page runs the bundle's top level, bounded by the load's own limit; the budget is
      // checked before each one, not only before each slide (the checker).
      if (spent() > job.budgetMs) {
        for (const s of mine) fail(s, `the render's ${job.budgetMs / 1000} s budget for code packages ran out`);
        continue;
      }
      let page = null;
      try {
        page = await open();
      } catch (e) {
        for (const s of mine) fail(s, `it did not load: ${e.message}`);
        continue;
      }
      for (const [k, s] of mine.entries()) {
        if (spent() > job.budgetMs) {
          fail(s, `the render's ${job.budgetMs / 1000} s budget for code packages ran out`);
          continue;
        }
        let raw;
        try {
          raw = await runPackage(page, { html: s.html, facts: s.facts, index: s.index, idPrefix: s.idPrefix, baseUrl: s.baseUrl }, { timeoutMs: job.slideMs });
        } catch (e) {
          fail(s, e.message.replace(/^code sandbox: /, ''));
          // A run past its time ends the worker; every later slide of this package needs a new one.
          if (/did not finish within|was stopped|not loaded/.test(e.message)) {
            await page.close();
            try {
              page = await open();
            } catch (e2) {
              for (const rest of mine.slice(k + 1)) fail(rest, `it did not load again: ${e2.message}`);
              page = null;
              break;
            }
          }
          continue;
        }
        const done = await sanitizer.finish(raw, s.html, job.slideMs, s.pkg);
        if (done.overrun) {
          await sanitizer.close();
          sanitizer = await openSanitizerPage(sandbox.browser);
        }
        emit(done.error ? { t: 'result', i: s.i, error: done.error } : { t: 'result', i: s.i, html: done.html, classes: done.classes });
      }
      await page?.close();
    }
    await sanitizer.close();
  } finally {
    await sandbox.close();
    // Closed by us: nothing for the host to reap, and a pid it read later could be someone else's.
    if (job.state) fs.rmSync(job.state, { force: true });
  }
}

module.exports = { openSanitizerPage, run };

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => {
    input += d;
  });
  // One JSON object per line. Writes to a pipe are synchronous on Linux and macOS, so a line
  // written is a line the host has, however this process ends.
  const emit = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  process.stdin.on('end', () => {
    run(JSON.parse(input), emit).then(
      () => process.stdout.write('', () => process.exit(0)),
      (e) => {
        emit({ t: 'fatal', message: String(e?.message ?? e) });
        process.stdout.write('', () => process.exit(0));
      },
    );
  });
}
