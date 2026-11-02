/**
 * lib/plugins/host-page-worker.js — the HOST's locked page, run as a child process for a plugin's bake
 * (2026-11-01-plugin-contract-hollywood.md §2, the `sandbox` row; 2026-10-19-first-party-plugins-in-the-sandbox.md).
 *
 * THE HOST CONFINES; THE PLUGIN DRAWS. A plugin whose bake needs a real browser page (Mermaid measures every label in the
 * page that draws it) gets one from the host, through its bake ctx (`ctx.runPage`, lib/plugins/host-bake.js), and never
 * launches or confines one itself. This process:
 *
 *   1. launches the code sandbox (lib/core/os-sandbox.js): Chromium off the network, under the OS sandbox where the machine
 *      allows it;
 *   2. serves a page on a SYNTHETIC origin, `https://<plugin>.lattice.invalid`, under a strict CSP, answering only the
 *      plugin's own committed files (named by key in its page module's `assets()`, resolved by lib/core/payload-path.js) and
 *      local pictures the export's file confiner admits (lib/core/file-confine.js); every other request is refused;
 *   3. calls the plugin's page module, `<plugin>.page.js` `draw(page, job, ctx)`, with a ctx holding the origin, where a
 *      re-addressed local picture is asked for, the deck's font faces as CSS, and whether the page is still alive;
 *   4. writes the result, adds which OS layer confined it, and closes the sandbox.
 *
 * Usage: node host-page-worker.js <job.json>. The job carries `plugin`, `module` (the page module's path, which the host
 * resolved), `outFile`, `pkgRoot`, `chromePath`, `confineRoots`, and the plugin's own fields.
 */

const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

/**
 * Per-CDP-call budget. Generous enough that a genuinely large diagram is never cut off, tight enough that a wedged page
 * fails in seconds rather than the 180 s Puppeteer would otherwise wait, times every remaining figure in the deck.
 */
const PROTOCOL_TIMEOUT_MS = 60_000;

/** Where a re-addressed local picture is asked for: the picture's `file:` address, base64url, after this path. */
const LOCAL_PICTURE_PATH = '/__file__/';
const PICTURE_TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif' };
const PAGE_TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

const originOf = (plugin) => `https://${plugin}.lattice.invalid`;

function cspFor(origin) {
  return [
    "default-src 'none'",
    `script-src ${origin}`,
    `style-src 'unsafe-inline' ${origin}`,
    `font-src ${origin} data:`,
    `img-src ${origin} data: blob:`,
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/**
 * The page's files, from the keys the plugin's page module names (`assets()`): its page, and the scripts it adds by name.
 * `{ payload: true }` is the plugin's browser library, `{ vendor: '<key>' }` one of its other committed copies.
 * @returns {{ indexHtml: string, scripts: Record<string, string> }}
 */
function resolveAssets(plugin, spec) {
  const { payloadPath, vendorPath } = require('../core/payload-path.js');
  const fileOf = (ref) => (ref.payload ? payloadPath(plugin) : vendorPath(plugin, ref.vendor));
  const base = fileOf(spec.index);
  const indexHtml = spec.index.file ? path.join(base, spec.index.file) : base;
  if (!fs.existsSync(indexHtml)) throw new Error(`plugin "${plugin}": its render page is not at ${indexHtml} — run npm run vendor:plugins`);
  const scripts = Object.fromEntries(Object.entries(spec.scripts || {}).map(([name, ref]) => [name, fileOf(ref)]));
  return { indexHtml, scripts };
}

/** Answer the locked page's requests: its own files, confined local pictures, and nothing else. */
async function serveLockedPage(page, { origin, pageDir, scripts, roots }) {
  const { createFileConfiner } = require('../core/file-confine.js');
  const { WEB_IMAGE_PLACEHOLDER } = require('../core/media-sources.js');
  const confine = createFileConfiner(roots.filter(Boolean));
  const standIn = decodeURIComponent(WEB_IMAGE_PLACEHOLDER.slice(WEB_IMAGE_PLACEHOLDER.indexOf(',') + 1));
  const csp = cspFor(origin);
  const refused = new Set();
  const realDir = fs.realpathSync(pageDir);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.isInterceptResolutionHandled()) return;
    const address = req.url();
    if (/^(?:data|blob):/i.test(address)) return req.continue();
    if (!address.startsWith(`${origin}/`)) return req.abort('blockedbyclient');
    const { pathname } = new URL(address);
    if (pathname.startsWith(LOCAL_PICTURE_PATH)) {
      const local = Buffer.from(pathname.slice(LOCAL_PICTURE_PATH.length), 'base64url').toString('utf8');
      if (!confine.allows(local)) {
        if (!refused.has(local)) {
          refused.add(local);
          process.stderr.write(`  ⚠ refused ${local.slice(0, 200)}: it resolves outside the deck folder\n`);
        }
        return req.respond({ status: 200, contentType: 'image/svg+xml', body: standIn });
      }
      try {
        const file = url.fileURLToPath(local);
        return req.respond({ status: 200, contentType: PICTURE_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(file) });
      } catch {
        return req.respond({ status: 404, body: '' });
      }
    }
    const rel = decodeURIComponent(pathname.slice(1));
    let file = Object.hasOwn(scripts, rel) ? scripts[rel] : null;
    if (!file) {
      const asked = path.resolve(realDir, rel);
      if (asked !== realDir && !asked.startsWith(realDir + path.sep)) return req.abort('blockedbyclient');
      file = asked;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return req.respond({ status: 404, body: '' });
    return req.respond({ status: 200, contentType: PAGE_TYPES[path.extname(file)] || 'application/octet-stream', headers: { 'content-security-policy': csp }, body: fs.readFileSync(file) });
  });
}

/**
 * Run one job: launch the sandbox, open the locked page, hand it to the plugin's page module, and return its result with
 * the confining layer recorded.
 */
async function runPage(job) {
  const puppeteer = require('puppeteer');
  const { launchCodeSandbox } = require('../core/os-sandbox.js');
  const { fontFaceCss } = require('../fonts/face-css.js');
  const { TEXT_FACES } = require('../fonts/text-faces.js');
  const mod = require(job.module);
  const origin = originOf(job.plugin);
  const { indexHtml, scripts } = resolveAssets(job.plugin, mod.assets());
  const sandbox = await launchCodeSandbox(puppeteer, { executablePath: job.chromePath || undefined, protocolTimeout: PROTOCOL_TIMEOUT_MS });
  const { browser } = sandbox;
  try {
    const page = await (await browser.createBrowserContext()).newPage();
    // A drawing library is chatty on stdout; the caller's progress line stays readable. Real failures come back in the result.
    page.on('console', () => {});
    const pageDir = path.dirname(indexHtml);
    await serveLockedPage(page, { origin, pageDir, scripts, roots: [pageDir, job.pkgRoot, ...(Array.isArray(job.confineRoots) ? job.confineRoots : [])] });
    await page.goto(`${origin}/${path.basename(indexHtml)}`);
    const ctx = Object.freeze({
      origin,
      picturePath: LOCAL_PICTURE_PATH,
      faceCss: fontFaceCss(job.pkgRoot, { display: 'block' }),
      faces: TEXT_FACES,
      alive: () => !page.isClosed() && browser.connected !== false,
    });
    const result = await mod.draw(page, job, ctx);
    return { ...result, layer: sandbox.layer.os };
  } finally {
    await sandbox.close();
  }
}

async function main() {
  const jobFile = process.argv[2];
  if (!jobFile) {
    process.stderr.write('host-page-worker: usage: node host-page-worker.js <job.json>\n');
    process.exit(2);
  }
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  let payload;
  try {
    payload = await runPage(job);
  } catch (e) {
    payload = { ok: false, error: String(e?.message ? e.message : e).split('\n')[0], results: [] };
  }
  fs.writeFileSync(job.outFile, JSON.stringify(payload));
  // A worker that reached its output file has done its job; a figure-level failure is DATA in that file, not a process
  // failure, and exiting non-zero for it would make the caller discard the figures that did render.
  process.exit(payload.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { resolveAssets, originOf, LOCAL_PICTURE_PATH, PROTOCOL_TIMEOUT_MS };
