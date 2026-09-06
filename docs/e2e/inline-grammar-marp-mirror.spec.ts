import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// ── The inline `{…}` / `[x]` grammar's MARP-SHAPED half, on a real browser ──────────
//
// `inline-pill-grammar.spec.ts` drives the Playground, where the engine renders first
// and `lib/runtime` runs over its output as a mirror. That is one of the two shapes the
// grammar ships in. The other is the one this spec covers: a Marp preview, where the
// engine never ran and the runtime is the ONLY implementation the reader gets.
//
// `test/unit/core/marp-fidelity-render.test.js` already compares those two projections
// — in jsdom. jsdom is not a browser, and the difference is load-bearing here: the
// runtime schedules its passes on a real MutationObserver, and the escape's idempotency
// is a claim about what the SECOND pass does. So this spec runs the same comparison in
// the browser that ships the bug if there is one.
//
// MUTATION-PROVED, which is the only reason to trust a green comparison of two lists:
// deleting the `data-lat-escaped` stamp from `transformInlinePills` turns this red with
// `{LIVE}` promoted to a pill by the fourth pass, while `inline-pill-grammar.spec.ts`
// stays green — the Playground's engine stamps the attribute server-side, so that
// surface cannot see this regression at all. Two shapes, two specs, and the split is
// the point.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));

// The BUNDLE, not `lib/runtime/index.js` — the bundle is what a preview loads. It is
// generated (`npm run build`, and by `prepare` on install), the same undeclared
// prerequisite the fidelity test and three parity specs already carry.
const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');
const SHEETS = [path.join(ROOT, 'dist', 'lattice.css'), path.join(ROOT, 'themes', 'indaco.css')];

const BODY = [
	'## Pills',
	'',
	'1. Shapes',
	'   - `{A}` `{B}:tag` `{C}:chip` `{D}:tag-bordered`',
	'2. More shapes',
	'   - `{E}:circle` `{F}:chevron-right` `{G}:chevron-left` `{H}:diamond`',
	'3. Axes',
	'   - `{I}:c1:lg` `{J}:c12:sm`',
	'4. Marks',
	'   - `[x]` `[-]` `[ ]` `[/]`',
	// The literals are half the probe: this grammar reads every single-backtick span in
	// every deck, so the drift that matters is `getUserId()` quietly becoming a pill.
	'5. Literals',
	'   - `[?]` `[data-mark]` `{ ok, scene }` `getUserId()` `{K}:c13` `{}`',
	'6. Escaped',
	'   - `\\{LIVE}` and `\\[x]` and `\\[a-z]` and `\\d+`',
].join('\n');

const DECK = ['---', 'theme: indaco', '---', '', '<!-- _class: list-tabular -->', '', BODY].join('\n');

/**
 * Both sides are projected by THIS function, evaluated in the page — so a difference
 * can never be an artifact of two readers disagreeing. It reads what became a pill
 * (with its resolved axes), what became a mark (whose name lives on `aria-label`,
 * never as text), AND what stayed a `<code>`. Reading only the pills would pass a
 * mirror that promoted everything.
 */
const PROBE = `() => [
	...[...document.querySelectorAll('span.lat-pill')].map((el) =>
		'pill|' + el.getAttribute('data-shape') + '|' + (el.getAttribute('data-c') || '-') + '|' + (el.getAttribute('data-size') || '-') + '|' + el.textContent),
	...[...document.querySelectorAll('span.lat-state')].map((el) =>
		'mark|' + el.className.split(/\\s+/).filter(Boolean).sort().join(' ') + '|' + (el.getAttribute('aria-label') || '-') + '|' + el.textContent),
	...[...document.querySelectorAll('code')].map((el) => 'code|' + el.textContent),
]`;

const head = () => SHEETS.map((f) => `<style>${fs.readFileSync(f, 'utf8')}</style>`).join('');

test('the runtime mirrors the engine over marp-shaped markup, and settles (#2066)', async ({ page }) => {
	// ── The engine's answer ────────────────────────────────────────────────────────
	const engineHtml: string = require(path.join(ROOT, 'lib/engine')).createEngine().render(DECK).html;
	await page.setContent(engineHtml, { waitUntil: 'domcontentloaded' });
	const engineOut: string[] = await page.evaluate(`(${PROBE})()`);

	// ANTI-VACUITY. Two empty arrays are equal, and the `code|` literals would hold a
	// naive count up on their own — so the floor counts only the entries that exist
	// BECAUSE the grammar fired.
	expect(engineOut.filter((e) => /^(pill|mark)\|/.test(e)).length).toBeGreaterThanOrEqual(12);

	// ── The runtime's answer, over the same content as marp-core emits it ──────────
	const md = new (require('markdown-it'))();
	const markup = `<section class="list-tabular">${md.render(BODY)}</section>`;

	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	// The runtime derives the sibling `.md` from the document URL and fetches it for the
	// deck-level registers. Refusing is not optional: it keeps a transform that quietly
	// started depending on one loud instead of network-dependent.
	await page.addInitScript(() => {
		window.fetch = () => Promise.reject(new Error('no network in this spec'));
	});
	await page.setContent(`<!doctype html><html><head>${head()}</head><body>${markup}</body></html>`, {
		waitUntil: 'domcontentloaded',
	});
	await page.addScriptTag({ content: fs.readFileSync(RUNTIME_BUNDLE, 'utf8') });

	await expect.poll(async () => (await page.evaluate(`(${PROBE})()`) as string[]).length).toBe(engineOut.length);
	expect(await page.evaluate(`(${PROBE})()`)).toEqual(engineOut);

	// ── It SETTLES ────────────────────────────────────────────────────────────────
	// The escape strips a backslash on pass 1; without the `data-lat-escaped` stamp,
	// pass 2 reads a bare `{LIVE}` and promotes it — the deck says one thing on load and
	// another a second later. Appending a LIVE directive rather than an inert node makes
	// each pass announce itself, so this is a witnessed comparison and not a sleep.
	for (let i = 0; i < 3; i += 1) {
		await page.evaluate(() => {
			const probe = document.createElement('code');
			probe.textContent = '{Probe}';
			document.querySelector('section')?.appendChild(probe);
		});
		await expect.poll(async () =>
			(await page.evaluate(`(${PROBE})()`) as string[]).filter((e) => e.endsWith('|Probe')).length,
		).toBe(1);
		await page.evaluate(() => {
			for (const el of document.querySelectorAll('span.lat-pill')) if (el.textContent === 'Probe') el.remove();
		});
		await expect.poll(async () =>
			(await page.evaluate(`(${PROBE})()`) as string[]).filter((e) => e.endsWith('|Probe')).length,
		).toBe(0);
	}
	expect(await page.evaluate(`(${PROBE})()`), 'the runtime did not settle across four passes').toEqual(engineOut);

	// ── And every box paints ──────────────────────────────────────────────────────
	// A pill that resolves to a zero-height inline box satisfies every assertion above
	// and is invisible on the slide.
	const boxes = await page.evaluate(() =>
		[...document.querySelectorAll('span.lat-pill, span.lat-state')].map((el) => {
			const r = el.getBoundingClientRect();
			return { what: el.getAttribute('data-shape') || el.getAttribute('aria-label'), w: r.width, h: r.height };
		}),
	);
	expect(boxes.length).toBe(14);
	expect(boxes.filter((b) => b.w < 1 || b.h < 1), 'a pill or mark painted at zero size').toEqual([]);
	expect(errors, 'the runtime threw in the page').toEqual([]);
});
