/**
 * Integration: an overflowing table keeps its HEADER and clips at the bottom, on a slide and in a
 * pane (lib/components/comparison/table/table.styles.css).
 *
 * The table centers its stage with `justify-content`, and plain `center` spills an overflowing box
 * equally off BOTH ends of the clipping stage: a 24-row table lost its header row and first five
 * rows, 230px above the stage — on a `table` slide, and in a table pane through the pane twin of
 * the same rule (lib/core/pane-css.js). The rule is `safe center` now: the top when the table
 * overflows, `center` when it fits. Pinned on the real export in Chromium, both halves: the
 * overflowing table shows its header, and a table that fits is still centered. The long list pane is
 * a guard for the other centered stage a pane holds (`cards: center`): it measured no loss before
 * the fix either, and must not start to.
 *
 * Slow tier: one CLI export and a Chromium launch. See engineering/pipeline.md.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('node:url');

describe('export: an overflowing table keeps its header, on a slide and in a pane', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice.js');
	const TIMEOUT = 180000;
	const rows = (n) => Array.from({ length: n }, (_, i) => `| Region ${i + 1} | ${(i + 1) * 3} |`).join('\n');
	const items = Array.from({ length: 16 }, (_, i) => `- Point ${i + 1} on the regional pipeline`).join('\n');
	const DECK = [
		'---\ntheme: indaco\n---',
		`## A table pane that overflows.\n\n<!-- panes: 35/65 -->\n<!-- pane: list -->\n\n- One point\n\n<!-- pane: table -->\n\n| Region | Value |\n|---|---|\n${rows(24)}\n`,
		`## A list pane that overflows.\n\n<!-- panes: 50/50 -->\n<!-- pane: list -->\n\n${items}\n\n<!-- pane: table -->\n\n| Region | Value |\n|---|---|\n${rows(2)}\n`,
		`<!-- _class: table -->\n\n## A table slide that overflows.\n\n| Region | Value |\n|---|---|\n${rows(24)}\n`,
	].join('\n\n---\n\n');

	let dir;
	let browser;
	test.before(async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-pane-top-'));
		fs.writeFileSync(path.join(dir, 'over.md'), DECK);
		const puppeteer = require('puppeteer');
		browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
	});
	test.after(async () => { if (browser) await browser.close(); });

	test('the overflowing table shows its header; a table that fits stays centered', { timeout: TIMEOUT }, async () => {
		const out = path.join(dir, 'over.html');
		const r = spawnSync(process.execPath, [EMULATOR, path.join(dir, 'over.md'), out, '--quiet'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 720 });
		await page.goto(pathToFileURL(out).href, { waitUntil: 'load' });
		const got = await page.evaluate(() => [...document.querySelectorAll('section[data-lattice-slide]')].map((s) => {
			const box0 = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
			if (!s.querySelector('lat-pane')) {
				const st = s.querySelector(':scope > .cell-stage');
				return { slide: { stage: box0(st), first: box0(st.querySelector('thead')), overflows: st.scrollHeight > st.clientHeight + 1 } };
			}
			const pane = (name) => s.querySelector(`lat-pane[data-pane="${name}"] > .cell-stage`);
			const box = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
			const table = pane('table');
			const list = pane('list');
			return {
				table: { stage: box(table), first: box(table.querySelector('thead') || table.querySelector('tr')), overflows: table.scrollHeight > table.clientHeight + 1, content: box(table.querySelector('table')) },
				list: { stage: box(list), first: box(list.querySelector('li')), overflows: list.scrollHeight > list.clientHeight + 1, content: box(list.querySelector('ul')) },
			};
		}));
		await page.close();
		const [tableSlide, listSlide, plainSlide] = got;

		assert.ok(plainSlide.slide.overflows, 'the 24-row table slide overflows (the case under test)');
		assert.ok(plainSlide.slide.first.top >= plainSlide.slide.stage.top - 0.5,
			`the table slide's header row starts ${(plainSlide.slide.stage.top - plainSlide.slide.first.top).toFixed(1)}px above its stage`);

		assert.ok(tableSlide.table.overflows, 'the 24-row table pane overflows (the case under test)');
		assert.ok(tableSlide.table.first.top >= tableSlide.table.stage.top - 0.5,
			`the table's header row starts ${(tableSlide.table.stage.top - tableSlide.table.first.top).toFixed(1)}px above its pane`);

		assert.ok(listSlide.list.overflows, 'the 16-item list pane overflows (the case under test)');
		assert.ok(listSlide.list.first.top >= listSlide.list.stage.top - 0.5,
			`the list's first item starts ${(listSlide.list.stage.top - listSlide.list.first.top).toFixed(1)}px above its pane`);

		// The two-row table beside the long list FITS, so it stays centered in its pane.
		const t = listSlide.table;
		assert.ok(!t.overflows, 'the two-row table pane fits');
		const above = t.content.top - t.stage.top;
		const below = t.stage.bottom - t.content.bottom;
		assert.ok(above > 20 && Math.abs(above - below) < 2, `a pane that fits stays centered (${above.toFixed(1)}px above, ${below.toFixed(1)}px below)`);
	});
});
