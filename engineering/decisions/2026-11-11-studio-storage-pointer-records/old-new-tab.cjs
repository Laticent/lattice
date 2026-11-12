// Two builds, one origin: does a tab still on the OLD build, opened after the new build migrated the
// chats out of localStorage, lose a thread? (2026-11-11-studio-storage-pointer-records.md §11.)
// usage: node old-new-tab.cjs <old-build-dist> <new-build-dist> <scratch-dir>
// Build each with `npm run build:e2e` in docs/ and copy its dist/ aside. The script serves the union of
// both builds' files on one origin (their hashed chunks do not collide) and swaps which build's
// /studio/ page it serves between steps, so the two builds share one localStorage and IndexedDB.
// Exits 0 when the new build still shows the thread after the old tab saved over its key.
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const [OLD, NEW, S] = process.argv.slice(2);
const ROOT = path.join(S, 'union');
fs.rmSync(ROOT, { recursive: true, force: true });
cp.execFileSync('cp', ['-r', NEW, ROOT]);
cp.execFileSync('cp', ['-r', '--update=none', OLD + '/.', ROOT + '/']);
fs.copyFileSync(path.join(OLD, 'studio/index.html'), path.join(S, 'studio-old.html'));
fs.copyFileSync(path.join(NEW, 'studio/index.html'), path.join(S, 'studio-new.html'));
let which = 'old';
// Every file in the union, by its URL path, indexed once: the server serves from this map only.
const FILES = new Map();
(function index(dir, url) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) index(abs, `${url}${e.name}/`);
    else FILES.set(`${url}${e.name}`, abs);
  }
})(ROOT, '/');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/studio' || p === '/studio/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(fs.readFileSync(path.join(S, `studio-${which}.html`))); }
  // Only the files indexed below: the request path is looked up, never joined into a path.
  const f = FILES.get(p) ?? FILES.get(`${p.replace(/\/$/, '')}/index.html`);
  if (!f) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(4399, '127.0.0.1', async () => {
  const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const k = 'lattice-studio-settings'; const cur = JSON.parse(localStorage.getItem(k) || '{}'); if (cur.posture !== 'craft') localStorage.setItem(k, JSON.stringify({ ...cur, posture: 'craft' })); } catch {} });
  const URL = 'http://localhost:4399/studio/';
  const ready = (p) => p.frameLocator('[aria-label="Live deck preview"] iframe.live').locator('.lattice').first().waitFor({ timeout: 60000 });
  const openChat = async (p) => { await p.getByRole('button', { name: 'Toggle Chat', exact: true }).first().click(); await p.getByRole('textbox', { name: 'Message the Architect' }).waitFor(); };
  const idb = (p, id) => p.evaluate((id) => new Promise((r) => { const o = indexedDB.open('lattice-studio-chats'); o.onsuccess = () => { const db = o.result; if (!db.objectStoreNames.contains('chats')) return r(null); const g = db.transaction('chats').objectStore('chats').get(id); g.onsuccess = () => r(g.result ? g.result.messages.map((m) => m.content) : null); }; o.onerror = () => r(null); }), id);
  const key = (p, id) => p.evaluate((id) => localStorage.getItem('lattice-studio-chat-' + id), id);
  const log = (...a) => console.log(...a);

  // 1. The old build, with a thread on the open deck.
  which = 'old';
  const a = await ctx.newPage(); await a.goto(URL); await ready(a);
  const deck = await a.evaluate(() => JSON.parse(localStorage.getItem('lattice-studio-active') || '{}').deckId);
  await a.evaluate((id) => localStorage.setItem('lattice-studio-chat-' + id, JSON.stringify([{ role: 'user', content: 'question kept across builds' }, { role: 'assistant', content: 'answer kept across builds' }])), deck);
  await a.reload(); await ready(a); await openChat(a);
  log('1 old build shows thread:', await a.getByText('answer kept across builds').isVisible());
  await a.close();

  // 2. The new build migrates it.
  which = 'new';
  const bpage = await ctx.newPage(); await bpage.goto(URL); await ready(bpage);
  for (let i = 0; i < 40 && (await key(bpage, deck)) != null; i++) await bpage.waitForTimeout(500);
  log('2 after migration, legacy key:', await key(bpage, deck), '· IndexedDB:', JSON.stringify(await idb(bpage, deck)));

  // 3. A fresh old-build tab opens the chat on that deck: no key, so it shows [] and saves it.
  which = 'old';
  const c = await ctx.newPage(); await c.goto(URL); await ready(c); await openChat(c);
  await c.waitForTimeout(1000);
  log('3 old tab wrote legacy key:', await key(c, deck));
  await c.close();

  // 4. The new build loads the deck again.
  which = 'new';
  await bpage.reload(); await ready(bpage); await openChat(bpage);
  const shown = await bpage.getByText('answer kept across builds').isVisible().catch(() => false);
  await bpage.waitForTimeout(1500);
  log('4 new build shows thread:', shown, '· IndexedDB:', JSON.stringify(await idb(bpage, deck)), '· legacy key:', await key(bpage, deck));
  await bpage.screenshot({ path: path.join(S, 'oldnew-step4.png') });
  await b.close(); srv.close();
  process.exit(shown ? 0 : 1);
});
