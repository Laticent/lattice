/**
 * Integration: the `--fluid` viewer redraws a bar chart for the box it has now, and puts the exported
 * drawing back when the box returns (lib/runtime/chart-redraw.js).
 *
 * On a 390px phone a 16:9 bar chart's exported drawing shrinks to fit, labels at about 7px. The viewer
 * reads the chart's source back from its own marks and redraws it with the engine's kernel for the
 * phone's box. Pinned on the real export in Chromium:
 *   - the desktop's first paint is the export's own drawing (nothing redrew);
 *   - on a phone each chart is redrawn once (a new viewBox, one body swap, no loop), its marks unchanged
 *     and no label under 14px; a grouped chart included, a pane chart as a whole-slide one;
 *   - a chart with a `_focus` the marks cannot carry keeps its exported drawing;
 *   - back on the desktop it is the exported drawing again, byte for byte.
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
		// Grouped: the checker's runaway (a redraw that resized its own box and drew again, to 1px text).
		'## We beat plan everywhere but APAC.\n\n<!-- _class: bar grouped -->\n\n- Americas\n  - Plan `3.2`\n  - Actual `3.9`\n- EMEA\n  - Plan `2.6`\n  - Actual `3.1`\n',
		// A focus a redraw from the marks cannot carry: this chart keeps its exported drawing.
		'## Q4 led.\n\n<!-- _class: bar -->\n<!-- _focus: mark 2 -->\n\n- Q3 `18`\n- Q4 `26`\n',
	].join('\n---\n\n');
	const REDRAWN = 3; // the first three charts redraw on a phone; the focused one keeps its drawing

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
		assert.equal(desk.length, 4, 'every chart drew');
		// First paint on the desktop is the export's own drawing: nothing redrew (no redraw-minted ids).
		assert.equal(await page.evaluate(() => document.querySelectorAll('[id^="lat-svgr-"]').length), 0, 'no chart redrew on the desktop');
		const swaps = () => page.evaluate(() => window.__swaps || 0);
		await page.evaluate(() => {
			window.__swaps = 0;
			new MutationObserver((ms) => { for (const m of ms) if (m.target.classList && m.target.classList.contains('chart-body')) window.__swaps += 1; })
				.observe(document, { childList: true, subtree: true });
		});

		await page.setViewport({ width: 390, height: 844 });
		await viewBoxes(desk.map((c, i) => ({ vb: c.viewBox, same: i >= REDRAWN })));
		const phone = await charts();
		phone.forEach((c, i) => {
			assert.equal(c.marks, desk[i].marks, `chart ${i}: the same marks, named and valued as exported`);
			if (i >= REDRAWN) return;
			assert.ok(c.minPx >= 14, `chart ${i}: no label under 14px on a phone (smallest ${c.minPx.toFixed(1)}px)`);
			assert.ok(c.named, `chart ${i}: the redrawn SVG is named for assistive tech`);
		});
		assert.equal(phone[3].html, desk[3].html, 'the focused chart keeps its exported drawing, focus and all');
		// One redraw per chart, not a loop: settle on the stamps, then count body swaps.
		await page.waitForFunction(() => document.fonts.status === 'loaded');
		assert.equal(await swaps(), REDRAWN, 'each redrawn chart swapped its body exactly once');

		await page.setViewport({ width: 1280, height: 720 });
		await viewBoxes(desk.map((c) => ({ vb: c.viewBox, same: true })));
		const back = await charts();
		for (const [i, c] of back.entries()) assert.equal(c.html, desk[i].html, `chart ${i}: the exported drawing, byte for byte`);
		await page.close();
	});

	// The other kinds (lib/runtime/chart-readers/): a line chart, a pie (a SIZE container, which drew 0px
	// tall in the fluid view before chart-family.styles.css gave its stage the slide's height), and a
	// roadmap, whose kernel changes the section's class list for a portrait box (`horizons`).
	test('a phone redraws a line, a pie and a roadmap; the desktop gets each exported drawing back', { timeout: TIMEOUT }, async () => {
		const deck = [
			'---\ntheme: indaco\n---\n',
			'## Services caught enterprise.\n\n<!-- _class: line -->\n\n- Q1\n  - Enterprise `4.1`\n  - Services `1.2`\n- Q2\n  - Enterprise `4.4`\n  - Services `1.6`\n- Q3\n  - Enterprise `4.2`\n  - Services `2.3`\n',
			'## Decks took half the hours.\n\n<!-- _class: piechart -->\n\n- Deck production `46%`\n- Meetings `22%`\n- Realigning `18%`\n- Deciding `14%`\n',
			'## The roadmap grids workstreams against phases.\n\n<!-- _class: roadmap -->\n\n| Workstream | Foundation `{Q2 2026}` | Hardening `{Q3 2026}` | Scale `{Q4 2026}` |\n| --- | --- | --- | --- |\n| Framework | [x] Signal taxonomy | [-] Scoring model v2 | [ ] Per-team weights |\n| Tooling | [!] Intake form | [/] Dashboards | [ ] Self-serve |\n',
			// A roadmap in a PANE keeps its exported grid: the `horizons` card styles are scoped to a slide, and
			// a pane redrew as unstyled cards (the checker's repro).
			// A tower whose narrowest canvas dropped a share's label (Helios Re's 20%) and shortened "Open 25%":
			// the redraw widens until every label the export printed prints (the owner's look at the phone render).
			'## Six reinsurers carry $310M above a $50M retention.\n\n<!-- _class: tower -->\n\n- Layer 3 `$200M xs $160M`\n  - Acme Re `30%`\n  - Globex Re `25%`\n  - Helios Re `20%`\n- Layer 2 `$70M xs $90M`\n  - Acme Re `40%`\n  - Vantage Re `35%`\n  - Umbra Re `25%`\n- Layer 1 `$40M xs $50M`\n  - Globex Re `60%`\n  - Meridian Re `40%`\n- Retention `$50M`\n',
			'## Roadmap in a pane.\n\n<!-- _class: columns ratio-30-70 -->\n<!-- _pane: list -->\n\n- Some framing text for the left pane.\n\n<!-- _pane: roadmap -->\n\n| Workstream | Foundation `{Q2 2026}` | Hardening `{Q3 2026}` |\n| --- | --- | --- |\n| Framework | [x] Signal taxonomy | [-] Scoring model v2 |\n| Tooling | [!] Intake form | [/] Dashboards |\n',
		].join('\n---\n\n');
		fs.writeFileSync(path.join(dir, 'kinds.md'), deck);
		const out = path.join(dir, 'kinds.html');
		const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.join(dir, 'kinds.md'), out, '--quiet', '--fluid'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const page = await browser.newPage();
		const state = () => page.evaluate(() => [...document.querySelectorAll('section.chart-frame, lat-pane.chart-frame')].map((s) => {
			const b = s.querySelector('.chart-body');
			const svg = b.querySelector('svg');
			const px = [...b.querySelectorAll('svg text')].map((t) => t.getBoundingClientRect().height).filter((h) => h > 0);
			// Every word the drawing prints in a label, axis ticks aside (a phone legitimately prints fewer ticks).
			const words = [];
			for (const t of b.querySelectorAll('svg text')) {
				if (/\b(cart-tick|tower-edge)\b/.test(t.getAttribute('class') || '')) continue;
				const sp = t.querySelectorAll('tspan');
				words.push(...(sp.length ? [...sp].map((x) => x.textContent).join(' ') : t.textContent).split(/\s+/).filter(Boolean));
			}
			return { cls: s.className, html: b.innerHTML, h: b.getBoundingClientRect().height, viewBox: svg?.getAttribute('viewBox'), minPx: px.length ? Math.min(...px) : null, words: words.sort() };
		}));
		await page.setViewport({ width: 1280, height: 720 });
		await page.goto(pathToFileURL(out).href, { waitUntil: 'load' });
		await page.waitForFunction(() => document.fonts.status === 'loaded');
		const desk = await state();
		assert.equal(desk.length, 5);
		assert.ok(desk[1].h > 100, `the pie has a box on the desktop (${desk[1].h}px)`);
		assert.ok(!/\bhorizons\b/.test(desk[2].cls), 'the roadmap is a grid on the desktop');

		await page.setViewport({ width: 390, height: 844 });
		await page.waitForFunction((vbs) => {
			const s = [...document.querySelectorAll('section.chart-frame, lat-pane.chart-frame')];
			const vb = (i) => s[i].querySelector('.chart-body svg').getAttribute('viewBox');
			return vb(0) !== vbs[0] && vb(1) !== vbs[1] && vb(3) !== vbs[3] && s[2].classList.contains('horizons');
		}, { timeout: 30000 }, desk.map((c) => c.viewBox));
		const phone = await state();
		assert.ok(phone[0].minPx >= 14, `the line's labels at the slide's size (${phone[0].minPx}px)`);
		assert.ok(phone[1].h > 200 && phone[1].minPx >= 14, `the pie has a box and readable labels (${phone[1].h}px, ${phone[1].minPx}px)`);
		assert.match(phone[2].html, /Signal taxonomy/, 'the roadmap redrew as cards, its content intact');
		assert.equal(phone[4].html, desk[4].html, 'the roadmap pane keeps its exported grid');
		assert.equal(phone[4].cls, desk[4].cls, 'and its class list');
		// Nothing the export printed goes missing on the phone: no dropped value, no shortened name.
		for (const [i, c] of phone.entries()) {
			const missing = desk[i].words.filter((w) => { const k = c.words.indexOf(w); if (k < 0) return true; c.words.splice(k, 1); return false; });
			assert.deepEqual(missing, [], `chart ${i}: every label the export printed prints on the phone`);
		}

		await page.setViewport({ width: 1280, height: 720 });
		await page.waitForFunction(() => !document.querySelectorAll('section.chart-frame, lat-pane.chart-frame')[2].classList.contains('horizons'), { timeout: 30000 });
		const back = await state();
		for (const [i, c] of back.entries()) {
			assert.equal(c.html, desk[i].html, `chart ${i}: the exported drawing, byte for byte`);
			assert.equal(c.cls, desk[i].cls, `chart ${i}: the exported class list`);
		}
		await page.close();
	});

	// NO FLASH (base.fluid-view.css § the charts-pending mark): a phone that OPENS the export paints the
	// chart drawn for its box first, never the exported 16:9 drawing it then swaps out (it did, 200-400ms
	// later, before the head script held the charts). Every painted frame is sampled; a frame that showed
	// a chart whose drawing later changed is a flash. Without script the charts show as exported.
	test('a phone that opens the export never paints the exported chart first', { timeout: TIMEOUT }, async () => {
		// Its own export: a line chart, which redraws on a phone.
		fs.writeFileSync(path.join(dir, 'flash.md'), '---\ntheme: indaco\n---\n\n## Services caught enterprise.\n\n<!-- _class: line -->\n\n- Q1\n  - Enterprise `4.1`\n  - Services `1.2`\n- Q2\n  - Enterprise `4.4`\n  - Services `1.6`\n- Q3\n  - Enterprise `4.2`\n  - Services `2.3`\n');
		const out = path.join(dir, 'flash.html');
		const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.join(dir, 'flash.md'), out, '--quiet', '--fluid'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const page = await browser.newPage();
		await page.setViewport({ width: 390, height: 844 });
		await page.evaluateOnNewDocument(() => {
			window.__frames = [];
			const tick = () => {
				const svg = document.querySelector('.chart-frame .chart-body svg');
				if (svg) window.__frames.push([getComputedStyle(svg.closest('.chart-body')).visibility !== 'hidden', svg.getAttribute('viewBox')]);
				if (window.__frames.length < 300) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		await page.goto(pathToFileURL(out).href, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__frames.length > 30 && !document.documentElement.hasAttribute('data-lattice-charts-pending'));
		const frames = await page.evaluate(() => window.__frames);
		const final = frames[frames.length - 1][1];
		assert.deepEqual(frames.filter(([shown, vb]) => shown && vb !== final), [], 'no painted frame showed the exported drawing');
		await page.close();
		const bare = await browser.newPage();
		await bare.setJavaScriptEnabled(false);
		await bare.setViewport({ width: 390, height: 844 });
		await bare.goto(pathToFileURL(out).href, { waitUntil: 'load' });
		assert.equal(await bare.evaluate(() => getComputedStyle(document.querySelector('.chart-body')).visibility), 'visible', 'without script the charts show');
		await bare.close();
	});
});
