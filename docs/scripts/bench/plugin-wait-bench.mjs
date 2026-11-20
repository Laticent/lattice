/**
 * D1 BENCHMARK — what a plugin block shows on a Studio reload, per arm (src/lib/code-packages/wait.ts).
 *
 * Against a docs build served at STUDIO_URL (default http://localhost:4321; `npm run build:e2e && npm run preview:e2e`):
 * for each engine and arm, a context imports the `bench-bars` plugin (./bench-bars) through the real Library, writes a
 * deck that lists and uses it, approves it and waits for it to draw. Then it reloads the Studio and, on every frame of
 * the reloaded page, reads the live preview frame (a same-origin srcdoc, so the parent reads it on every engine):
 *
 *   state     blank (nothing visible: no slide, or the preview held hidden) · source (the fence as code) · bare (the
 *             drawing without the plugin's sheet: black bars) · off (the "not approved / not listed" card) ·
 *             box · skeleton · afterimage (the arms' placeholders) · drawn
 *   timing    ms from navigation to the first visible slide, and to the first drawn frame
 *   geometry  how far the block (in whatever state) and the coda moved from where the drawn frame puts them
 *
 * Not a test and not run by CI: a report. `node scripts/bench/plugin-wait-bench.mjs --engines chromium,webkit,firefox
 * --arms off,a,b,c,cplus --reloads 40 --workers 4 --out <file.json>`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';
import JSZip from 'jszip';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, dflt) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1] : dflt;
};
const BASE = process.env.STUDIO_URL || 'http://localhost:4321';
const ENGINES = arg('engines', 'chromium').split(',');
const ARMS = arg('arms', 'off,a,b,c,cplus').split(',');
const RELOADS = Number(arg('reloads', '10'));
const WORKERS = Number(arg('workers', '1'));
const OUT = arg('out', '');
const SEED = fs.readFileSync(path.join(here, '../ios-safari/seed-settings.js'), 'utf8');
const LAUNCH = { chromium, webkit, firefox };
const NAME = 'bench-bars';
const DECK = `---\nplugins: [${NAME}]\n---\n\n## Q3 revenue by region\n\n\`\`\`${NAME}\nEMEA: 4.1\nNA: 5.2\nAPAC: 2.9\nLATAM: 6.0\nANZ: 3.4\n\`\`\`\n\n> EMEA led the quarter; APAC recovered in September.\n`;

async function pluginZip() {
	const dir = path.join(here, NAME);
	const zip = new JSZip();
	for (const f of fs.readdirSync(dir)) zip.file(`${NAME}/${f}`, fs.readFileSync(path.join(dir, f)));
	return zip.generateAsync({ type: 'nodebuffer' });
}

/** The per-frame watcher, installed in the TOP page before it loads. Records one row per animation frame. */
function watcher({ name }) {
	if (window.top !== window) return;
	const log = { rows: [], done: false };
	window.__waitBench = log;
	let drawnRun = 0;
	const rel = (r, s) => (r && s ? [Math.round(r.left - s.left), Math.round(r.top - s.top), Math.round(r.width), Math.round(r.height)] : null);
	const tick = () => {
		const t = Math.round(performance.now());
		const fr = document.querySelector('[aria-label="Live deck preview"] iframe.live');
		let state = 'blank';
		let block = null;
		let coda = null;
		try {
			const doc = fr?.contentDocument;
			const sec = doc?.querySelector('section');
			const hidden = !fr || getComputedStyle(fr).visibility === 'hidden';
			if (sec && !hidden) {
				const s = sec.getBoundingClientRect();
				const drawn = doc.querySelector(`[data-lattice-plugin="${name}"]`);
				const wait = doc.querySelector('[data-lattice-plugin-wait]');
				const off = doc.querySelector(`[data-lattice-plugin-off="${name}"]`);
				const code = doc.querySelector(`code.language-${name}`);
				let el = null;
				if (drawn) {
					const bar = drawn.querySelector('rect');
					const fill = bar ? fr.contentWindow.getComputedStyle(bar).fill : '';
					state = /^rgb\(0, 0, 0\)$|^#000/.test(fill) ? 'bare' : 'drawn';
					el = drawn;
				} else if (wait) {
					state = wait.getAttribute('data-wait-shape') || 'box';
					el = wait;
				} else if (off) {
					state = 'off';
					el = off;
				} else if (code) {
					state = 'source';
					el = code.closest('pre') || code;
				} else state = 'slide';
				block = el ? rel(el.getBoundingClientRect(), s) : null;
				const c = doc.querySelector('.cell-coda');
				coda = c ? rel(c.getBoundingClientRect(), s) : null;
			}
		} catch {}
		log.rows.push([t, state, block, coda]);
		drawnRun = state === 'drawn' ? drawnRun + 1 : 0;
		if (drawnRun >= 30 || t > 20000) log.done = true;
		else requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

async function setup(ctx, arm) {
	await ctx.addInitScript(SEED);
	await ctx.addInitScript((a) => {
		try {
			localStorage.setItem('lattice-d1-arm', a);
		} catch {}
	}, arm);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
	const input = page.locator('[data-testid="library-import-input"]');
	for (let i = 0; i < 4 && !(await input.count()); i++) {
		const docked = page.getByRole('button', { name: 'Open Library' });
		await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click({ timeout: 20000 }).catch(() => {});
		await input.waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
	}
	await input.setInputFiles({ name: `${NAME}.zip`, mimeType: 'application/zip', buffer: await pluginZip() });
	await page.locator('[data-sonner-toast]').filter({ hasText: '1 plugin(s)' }).first().waitFor({ timeout: 30000 });
	await page.keyboard.press('Escape');
	const editor = page.locator('[aria-label="Deck source"]').first();
	await editor.waitFor({ timeout: 60000 });
	await editor.click();
	await page.evaluate((deck) => {
		const el = document.querySelector('[aria-label="Deck source"]');
		el.focus();
		document.execCommand('selectAll');
		document.execCommand('insertText', false, deck);
	}, DECK);
	const notice = page.locator('[data-slot="code-packages"]');
	await notice.and(page.locator('[data-state="unapproved"]')).waitFor({ timeout: 60000 });
	await notice.getByRole('button', { name: `Approve the code of ${NAME}` }).click();
	const frame = page.frameLocator('[aria-label="Live deck preview"] iframe.live');
	await frame.locator(`[data-lattice-plugin="${NAME}"] rect`).first().waitFor({ timeout: 60000 });
	if (process.env.DEBUG_KEYS) console.log('setup root attrs:', await frame.locator(`[data-lattice-plugin="${NAME}"]`).first().evaluate((el) => [...el.attributes].map((a) => a.name).join(' ')));
	// The deck must be saved before a reload, and for cplus the afterimage kept: wait for both in storage.
	await page.waitForFunction(
		([a, n]) => {
			try {
				const decks = Object.keys(localStorage).some((k) => (localStorage.getItem(k) || '').includes(`plugins: [${n}]`));
				return decks && (a !== 'cplus' || Object.keys(JSON.parse(localStorage.getItem('lattice-plugin-afterimages') || '{}')).length > 0);
			} catch {
				return false;
			}
		},
		[arm, NAME],
		{ timeout: 30000, polling: 100 },
	).catch(() => {});
	await page.addInitScript(watcher, { name: NAME });
	return page;
}

async function reloadOnce(page) {
	if (process.env.DEBUG_KEYS) console.log('keys before reload:', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('lattice-plugin-afterimages') || '{}'))));
	await page.reload({ waitUntil: 'commit' });
	await page.waitForFunction(() => window.__waitBench?.done === true, null, { timeout: 30000, polling: 100 });
	return page.evaluate(() => window.__waitBench.rows);
}

const WRONG = new Set(['source', 'bare', 'off']);
function summarize(rows) {
	const firstDrawn = rows.findIndex((r) => r[1] === 'drawn');
	const before = firstDrawn < 0 ? rows : rows.slice(0, firstDrawn);
	const final = firstDrawn < 0 ? null : rows[rows.length - 1];
	const visible = rows.find((r) => r[1] !== 'blank');
	const count = (pred) => before.filter(pred).length;
	const shift = (i) => {
		if (!final?.[i]) return null;
		let max = 0;
		for (const r of rows) if (r[i] && r[1] !== 'blank') max = Math.max(max, ...r[i].map((v, k) => Math.abs(v - final[i][k])));
		return max;
	};
	const states = {};
	for (const r of before) states[r[1]] = (states[r[1]] ?? 0) + 1;
	return {
		firstVisibleMs: visible ? visible[0] : null,
		drawnMs: firstDrawn < 0 ? null : rows[firstDrawn][0],
		wrongFrames: count((r) => WRONG.has(r[1])),
		blankFrames: count((r) => r[1] === 'blank'),
		waitFrames: count((r) => ['box', 'skeleton', 'afterimage'].includes(r[1])),
		states,
		blockShiftPx: shift(2),
		codaShiftPx: shift(3),
		sequence: rows.reduce((a, r) => (a.at(-1) === r[1] ? a : [...a, r[1]]), []),
	};
}

const results = [];
for (const engine of ENGINES) {
	const browser = await LAUNCH[engine].launch();
	for (const arm of ARMS) {
		const per = Math.ceil(RELOADS / WORKERS);
		await Promise.all(
			Array.from({ length: WORKERS }, async (_, w) => {
				const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
				try {
					const page = await setup(ctx, arm);
					for (let i = 0; i < per && w * per + i < RELOADS; i++) {
						try {
							const s = summarize(await reloadOnce(page));
							results.push({ engine, arm, ...s });
						} catch (e) {
							results.push({ engine, arm, error: String(e).slice(0, 200) });
						}
					}
				} catch (e) {
					results.push({ engine, arm, error: `setup: ${String(e).slice(0, 200)}` });
				} finally {
					await ctx.close();
				}
			}),
		);
		const mine = results.filter((r) => r.engine === engine && r.arm === arm && !r.error);
		const errs = results.filter((r) => r.engine === engine && r.arm === arm && r.error).length;
		const med = (k) => {
			const v = mine.map((r) => r[k]).filter((x) => x !== null).sort((a, b) => a - b);
			return v.length ? v[v.length >> 1] : null;
		};
		const mean = (k) => (mine.length ? (mine.reduce((s, r) => s + (r[k] ?? 0), 0) / mine.length).toFixed(1) : '-');
		console.log(
			`${engine.padEnd(8)} ${arm.padEnd(6)} n=${mine.length}${errs ? ` err=${errs}` : ''}  wrong runs=${mine.filter((r) => r.wrongFrames).length} wrong frames mean=${mean('wrongFrames')}  blank mean=${mean('blankFrames')}  wait mean=${mean('waitFrames')}  first visible med=${med('firstVisibleMs')}ms  drawn med=${med('drawnMs')}ms  block shift med=${med('blockShiftPx')}px  coda shift med=${med('codaShiftPx')}px`,
		);
	}
	await browser.close();
}
if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(results, null, 1)}\n`);
