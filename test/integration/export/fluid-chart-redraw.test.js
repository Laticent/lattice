/**
 * Integration: the `--fluid` viewer redraws a bar chart for the box it has now, and puts the exported
 * drawing back when the box returns (lib/runtime/chart-redraw.js).
 *
 * On a 390px phone a 16:9 bar chart's exported drawing shrinks to fit, labels at about 7px. The viewer
 * reads the chart's source back from its own marks and redraws it with the engine's kernel for the
 * phone's box. Pinned on the real export in Chromium:
 *   - on a phone each chart is redrawn (a new viewBox), its marks unchanged and no label under 10px;
 *   - back on the desktop it is the exported drawing again, byte for byte;
 *   - a pane chart takes part as a whole-slide chart does.
 * engineering/decisions/2026-11-03-responsive-tables.md §"Charts redraw on demand". Waits on the
 * drawing's own viewBox, never on a delay (HARD RULE #32).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('node:url');

describe('export: the --fluid viewer redraws a bar chart for its box', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const TIMEOUT = 240000;
	const DECK = [
		'---\ntheme: indaco\n---\n',
		'## Growth is concentrated in two regions.\n\n<!-- _class: bar -->\n\n- North America `$4.2M`\n  - Two renewals landed in Q4\n- EMEA `$3.1M`\n- APAC `$1.8M`\n- LATAM `$0.6M`\n',
		'## Q3 carried the year.\n\n<!-- _class: rows -->\n<!-- _pane: content -->\n\nRevenue by quarter.\n\n<!-- _pane: bar -->\n\n- Q1 `12`\n- Q2 `18`\n- Q3 `26`\n',
	].join('\n---\n\n');

	let dir;
	let browser;
	test.before(async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-chart-redraw-'));
		const puppeteer = require('puppeteer');
		browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
	});
	test.after(async () => { if (browser) await browser.close(); });

	test('a phone redraws each bar chart; the desktop gets the exported drawing back', { timeout: TIMEOUT }, async () => {
		fs.writeFileSync(path.join(dir, 'deck.md'), DECK);
		const out = path.join(dir, 'deck.html');
		const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.join(dir, 'deck.md'), out, '--quiet', '--fluid'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);

		const page = await browser.newPage();
		const charts = () => page.evaluate(() => [...document.querySelectorAll('.chart-body')].map((b) => {
			const svg = b.querySelector('svg');
			const px = [...svg.querySelectorAll('text')].map((t) => t.getBoundingClientRect().height).filter((h) => h > 0);
			return {
				viewBox: svg.getAttribute('viewBox'),
				marks: [...svg.querySelectorAll('rect[data-mark]')].map((m) => `${m.dataset.label}=${m.dataset.value}`).join(','),
				minPx: Math.min(...px),
				html: b.innerHTML,
				named: !!svg.getAttribute('aria-labelledby'),
			};
		}));
		const viewBoxes = (want) => page.waitForFunction((w) => {
			const got = [...document.querySelectorAll('.chart-body svg')].map((s) => s.getAttribute('viewBox'));
			return got.length === w.length && got.every((v, i) => (w[i].same ? v === w[i].vb : v !== w[i].vb));
		}, { timeout: 30000 }, want);

		await page.setViewport({ width: 1280, height: 720 });
		await page.goto(pathToFileURL(out).href, { waitUntil: 'load' });
		await page.waitForFunction(() => document.fonts.status === 'loaded');
		const desk = await charts();
		assert.equal(desk.length, 2, 'both charts drew');

		await page.setViewport({ width: 390, height: 844 });
		await viewBoxes(desk.map((c) => ({ vb: c.viewBox, same: false })));
		const phone = await charts();
		phone.forEach((c, i) => {
			assert.equal(c.marks, desk[i].marks, `chart ${i}: the same marks, named and valued as exported`);
			assert.ok(c.minPx >= 10, `chart ${i}: no label under 10px on a phone (smallest ${c.minPx.toFixed(1)}px)`);
			assert.ok(c.named, `chart ${i}: the redrawn SVG is named for assistive tech`);
		});

		await page.setViewport({ width: 1280, height: 720 });
		await viewBoxes(desk.map((c) => ({ vb: c.viewBox, same: true })));
		const back = await charts();
		for (const [i, c] of back.entries()) assert.equal(c.html, desk[i].html, `chart ${i}: the exported drawing, byte for byte`);
		await page.close();
	});
});
