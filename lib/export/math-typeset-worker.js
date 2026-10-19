/**
 * lib/export/math-typeset-worker.js — the CLI's math, typeset by KaTeX in the LOCKED page (owner decision 14;
 * threat-model note 2026-10-16 §6 rows 3 and 4; engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md).
 *
 * KaTeX used to run inside the CLI's own Node process, on every formula an author wrote. It now runs where a plugin's
 * code runs: the code sandbox's page (`openPackageSandbox`: no network, Chromium's OS sandbox where the machine allows
 * it), as a fence renderer with the SAME options `math.render.js` passes. Each result is sanitized in a separate page
 * before it leaves (`openSanitizerPage().sanitizeKeeping`): KaTeX's own bytes are kept when the sanitizer removed
 * nothing from them, so exports stay byte-identical, and the sanitized markup is used when it did.
 * `test/integration/parity/math-sandbox-parity.test.js` pins the typeset byte for byte against the Node path.
 *
 * WHY A CHILD PROCESS: `lattice.js` renders the deck while its module evaluates and cannot `await` (the Mermaid bake's
 * reason, render-worker.js). The engine asks synchronously (`math.render.js` `setTypesetter`), through
 * `lib/export/math-typeset.js`; this answers.
 *
 * PROTOCOL. `node typeset-worker.js <job.json>`; the worker writes a result JSON to `job.outFile`.
 *   job    { chromePath?, outFile, formulas: [ { key, src, display, output } ] }
 *   result { ok, error?, layer?, results: { [key]: html } }   a formula KaTeX could not typeset is absent
 */

const fs = require('node:fs');
const path = require('node:path');

const KATEX = path.join(__dirname, '..', 'plugins', 'math', 'vendor', 'katex', 'katex.min.js');
/** One formula per call; the options are `math.render.js`'s (`renderTex`), so the bytes are the Node path's. */
const RENDERER = (katex, errorColor) =>
  `${katex}\nfunction render(f){ var j = JSON.parse(f.body); return self.katex.renderToString(j.s, { displayMode: j.d, throwOnError: false, output: j.o, errorColor: ${JSON.stringify(errorColor)} }); }\nexport { render as default };`;

async function typesetAll(job) {
  const puppeteer = require('puppeteer');
  const { ERROR_COLOR } = require('../plugins/math/math.render.js');
  const { launchCodeSandbox } = require('../core/os-sandbox.js');
  const { openPackageSandbox, runPackage } = require('../core/code-sandbox.js');
  const { openSanitizerPage } = require('../packages/code-door-worker.js');
  const sandbox = await launchCodeSandbox(puppeteer, { executablePath: job.chromePath || undefined });
  try {
    const page = await openPackageSandbox(sandbox.browser, RENDERER(fs.readFileSync(KATEX, 'utf8'), ERROR_COLOR), { fence: true, loadTimeoutMs: 30000 });
    const sanitizer = await openSanitizerPage(sandbox.browser);
    try {
      const results = {};
      for (const f of job.formulas) {
        try {
          const raw = await runPackage(page, { body: JSON.stringify({ s: f.src, d: !!f.display, o: f.output }), id: 'm' }, { fence: true, timeoutMs: 10000 });
          if (typeof raw === 'string') results[f.key] = await sanitizer.sanitizeKeeping(raw);
        } catch {
          /* absent: the engine shows the source, as a KaTeX failure always has */
        }
      }
      return { ok: true, layer: sandbox.layer.os, results };
    } finally {
      await sanitizer.close();
      await page.close();
    }
  } finally {
    await sandbox.close();
  }
}

async function main() {
  const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  let payload;
  try {
    payload = await typesetAll(job);
  } catch (e) {
    payload = { ok: false, error: String(e?.message ?? e).split('\n')[0], results: {} };
  }
  fs.writeFileSync(job.outFile, JSON.stringify(payload));
  process.exit(payload.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { typesetAll };
