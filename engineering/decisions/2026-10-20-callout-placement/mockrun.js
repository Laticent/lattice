// node mockrun.js <deck.html> <outPrefix> <slideIdx,...> [scheme]
const fs = require('fs'); const path = require('path'); const REPO = path.resolve(__dirname, '../../..');
const { resolveChrome } = require(path.join(REPO, 'tools/lib/resolve-chrome.js'));
const OPTS = { base: { lane: 'none', key: 'today' }, B: { lane: 'right', key: 'today' }, A: { lane: 'right', key: 'below' }, C: { lane: 'right', key: 'rail' }, D: { lane: 'below', key: 'below' } };
(async () => {
  const [html, prefix, idxs, scheme = 'light', n = '3'] = process.argv.slice(2);
  const pup = require('puppeteer'); const b = await pup.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
  const src = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8'); const res = [];
  for (const idx of idxs.split(',').map(Number)) for (const [name, o] of Object.entries(OPTS)) {
    const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1600 }); await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await p.goto('file://' + html, { waitUntil: 'networkidle0' }); await p.evaluate(src);
    const r = await p.evaluate((i, o, sch, n) => { const sec = document.querySelectorAll('section[data-class]')[i]; if (sch === 'dark') sec.classList.add('dark'); return window.__mock(sec, { ...o, n }); }, idx, o, scheme, +n);
    const el = (await p.$$('section[data-class]'))[idx]; await el.screenshot({ path: `${prefix}-${idx}-${name}.png` });
    res.push({ idx, name, ...r }); await p.close();
  }
  await b.close(); console.log(JSON.stringify(res));
})();
