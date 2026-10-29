// The redraw cost of an insert near the start of a 60-slide deck, in the slide map: DOM mutations inside the rail
// and how many tiles' contents were rewritten, over the second after the insert. Run before and after keying tiles by id.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.addInitScript(() => { localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'write' })); });
  await page.goto('http://localhost:4321/studio/');
  await page.locator('.cm-content').first().waitFor({ timeout: 90000 });
  const deck = Array.from({ length: 60 }, (_, i) => `# Slide ${i + 1}\n\nBody ${i + 1}.`).join('\n\n---\n\n') + '\n';
  const set = (text, at) => page.locator('.cm-content').first().evaluate((el, [t, a]) => { const v = el.cmTile.root.view; v.dispatch(a === undefined ? { changes: { from: 0, to: v.state.doc.length, insert: t } } : { changes: { from: a, insert: t } }); }, [text, at]);
  await set(deck);
  await page.getByRole('button', { name: 'Slide map' }).first().click();
  await page.locator('[data-map-rail] button[data-unit]').first().waitFor();
  // Go to slide 1, so the window holds the start of the deck.
  await page.locator('[data-map-rail] button[aria-current="true"]').focus();
  await page.keyboard.press('Home');
  await page.waitForTimeout(3000);
  const runs = [];
  for (let k = 0; k < 5; k++) {
    await page.evaluate(() => {
      const rail = document.querySelector('[data-map-rail] ol');
      window.__m = { layer: 0, records: 0, added: 0, removed: 0, attrs: 0, text: 0, tiles: new Set() };
      window.__obs = new MutationObserver((rs) => { for (const r of rs) { if (!rail.contains(r.target)) { window.__m.layer++; continue; } window.__m.records++; if (r.type === 'childList') { window.__m.added += r.addedNodes.length; window.__m.removed += r.removedNodes.length; } else if (r.type === 'attributes') window.__m.attrs++; else window.__m.text++; const li = (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest('li'); if (li) window.__m.tiles.add(li); } });
      window.__lt = 0; window.__po = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt += e.duration; }); window.__po.observe({ type: 'longtask' });
      window.__obs.observe(rail.parentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    // Insert a slide after slide 1 (offset of the first separator).
    const off = await page.locator('.cm-content').first().evaluate((el) => el.cmTile.root.view.state.doc.toString().indexOf('\n\n---\n\n') + 7);
    const t0 = await page.evaluate(() => performance.now());
    await set(`# Inserted ${k}\n\nNew.\n\n---\n\n`, off);
    const frame = await page.evaluate((t) => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(Math.round(performance.now() - t))))), t0);
    await page.waitForTimeout(1500);
    runs.push({ frame, ...await page.evaluate(() => { window.__obs.disconnect(); window.__po.disconnect(); const m = window.__m; return { longtaskMs: Math.round(window.__lt), layer: m.layer, records: m.records, added: m.added, removed: m.removed, attrs: m.attrs, text: m.text, tilesTouched: m.tiles.size, mounted: document.querySelectorAll('[data-map-rail] li').length }; }) });
  }
  console.log(JSON.stringify(runs)); const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[2]; console.log('median', JSON.stringify({ frame: med('frame'), longtaskMs: med('longtaskMs'), records: med('records'), layer: med('layer'), tiles: med('tilesTouched') }));
  await b.close();
})();
