const pw = require('/home/user/lattice/docs/node_modules/@playwright/test');
const fs = require('fs');
const js = fs.readFileSync(process.argv[2] + '/spike.js', 'utf8');
const deck = fs.readFileSync('/home/user/lattice/examples/system-design-foundations.md', 'utf8');
(async () => {
  for (const name of ['chromium', 'firefox', 'webkit']) {
    const b = await pw[name].launch(); const p = await b.newPage();
    await p.setContent('<html><body></body></html>'); await p.addScriptTag({ content: js });
    await p.evaluate((d) => window.spike.mount(d), deck);
    await p.keyboard.type('x');
    const times = []; const rs = []; const ds = [];
    let ok = true;
    for (let i = 0; i < 7; i++) { const r = await p.evaluate(() => window.spike.applyEditToFirstSlide()); times.push(r.ms); rs.push(r.resync); ds.push(r.dispatch); ok = ok && r.ok; }
    await p.keyboard.type('y');
    const st = await p.evaluate(() => window.spike.state());
    times.sort((a, b) => a - b); rs.sort((a, b) => a - b); ds.sort((a, b) => a - b);
    console.log(name, JSON.stringify({ bytesExact: ok, medianMs: +times[3].toFixed(2), resyncMs: +rs[3].toFixed(2), dispatchMs: +ds[3].toFixed(2), maxMs: +times[6].toFixed(2), ...st, text: st.text.slice(-30) }));
    await b.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
