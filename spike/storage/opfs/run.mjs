// OPFS write -> reload -> read on chromium, webkit, firefox. Run from docs/ so @playwright/test resolves:
//   cd docs && node ../spike/storage/opfs/run.mjs
import fs from 'node:fs'; 
import http from 'node:http'; 
import { createRequire } from 'node:module';import os from 'node:os';import path from 'node:path'; 

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium, webkit, firefox } = require('@playwright/test');
const dir = path.dirname(new URL(import.meta.url).pathname);
const server = http.createServer((req, res) => {
  const p = path.join(dir, new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html'));
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/`;
const rows = [];
for (const [name, bt] of [['chromium', chromium], ['webkit', webkit], ['firefox', firefox]]) {
  for (const mode of ['ephemeral', 'persistent']) {
    const token = `${name}-${mode}-${Date.now()}`;
    let ctx, browser, version;
    const opts = name === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome' } : {};
    if (!fs.existsSync(opts.executablePath ?? '/')) delete opts.executablePath;
    try {
      if (mode === 'persistent') { ctx = await bt.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'opfs-')), opts); version = ctx.browser()?.version() ?? '?'; }
      else { browser = await bt.launch(opts); version = browser.version(); ctx = await browser.newContext(); }
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(`${base}?phase=write&token=${token}`); await page.waitForFunction(() => window.__opfs?.done);
      const w = await page.evaluate(() => window.__opfs);
      await page.goto(`${base}?phase=read&token=${token}`); await page.reload(); await page.waitForFunction(() => window.__opfs?.done);
      const r = await page.evaluate(() => window.__opfs);
      const ok = (got, prefix) => (got === `${prefix}:${token}` ? 'PASS' : `FAIL (${got})`);
      rows.push({ engine: `${name} ${version}`, mode, write: { main: w.mainWritable, workerSync: w.worker?.sync, workerWritable: w.worker?.writable, fatal: w.fatal ?? w.worker?.fatal },
        afterReload: { mainWritable: ok(r['read:main-writable.txt'], 'main-writable'), workerSync: ok(r['read:worker-sync.txt'], 'worker-sync'),
          workerSyncReadViaHandle: ok(r.worker?.syncRead, 'worker-sync'), workerWritable: ok(r['read:worker-writable.txt'], 'worker-writable') }, persisted: w.persisted });
    } catch (e) { rows.push({ engine: name, mode, error: String(e.message).split('\n')[0] }); }
    await ctx?.close(); await browser?.close();
  }
}
server.close();
console.log(JSON.stringify(rows, null, 1));
