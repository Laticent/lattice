const { chromium } = require('playwright');
const SHOT = require('node:os').tmpdir(); // screenshots stay out of the evidence folder
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(() => { try { localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' })); } catch {} });
  await p.goto('http://localhost:4399/studio/', { waitUntil: 'domcontentloaded' });
  await p.locator('.cm-content').first().waitFor({ timeout: 90000 });
  // A 60-slide deck, so the strip must window its tiles.
  const deck = '---\ntheme: indaco\n---\n\n' + Array.from({ length: 60 }, (_, i) => `# Slide ${i + 1}\n\nBody ${i + 1}.`).join('\n\n---\n\n') + '\n';
  await p.locator('.cm-content').first().click();
  await p.keyboard.press('ControlOrMeta+A'); await p.keyboard.press('Delete');
  await p.keyboard.insertText(deck);
  await p.getByRole('button', { name: 'Slide map' }).first().click();
  const RAIL = '[data-map-rail]';
  await p.locator(`${RAIL} button[data-unit]`).first().waitFor({ timeout: 60000 });
  // Go to slide 1 and put KEYBOARD focus on its tile.
  await p.locator(`${RAIL} button[data-unit="0"]`).click();
  await p.waitForTimeout(800);
  await p.locator(`${RAIL} button[aria-current="true"]`).focus();
  const before = await p.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, unit: a?.getAttribute('data-unit'), label: a?.getAttribute('aria-label') }; });
  await p.screenshot({ path: `${SHOT}/1-focused.png` });
  // Scroll the strip far away with the wheel (mixed input), as a pointer user would.
  const scroller = p.locator(`${RAIL} .overflow-x-scroll, ${RAIL} [class*="overflow-x-scroll"]`).first();
  const box = await scroller.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 30; i++) { await p.mouse.wheel(1200, 0); await p.waitForTimeout(40); }
  await p.waitForTimeout(1200);
  const mounted0 = await p.locator(`${RAIL} button[data-unit="0"]`).count();
  const after = await p.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, id: a?.id, unit: a?.getAttribute?.('data-unit'), isBody: a === document.body }; });
  // Does an arrow key still do anything?
  const slideLabel = async () => p.evaluate(() => (document.body.innerText.match(/Slide \d+ \/ \d+|\b\d+ \/ 60\b/) || [''])[0]);
  const l1 = await slideLabel();
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600);
  const l2 = await slideLabel();
  await p.screenshot({ path: `${SHOT}/2-after-scroll.png` });
  console.log(JSON.stringify({ before, mountedTile0AfterScroll: mounted0, after, counterBeforeArrow: l1, counterAfterArrow: l2 }, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
