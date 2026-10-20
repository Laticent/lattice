import type { Frame, Page } from '@playwright/test';
import { expect, test } from './studio-fixture';

// ── The Playground loads only the engine styles a deck uses ────────────────────────────────
//
// `dist/lattice-min.css` is 933 KB and a deck uses a median 21% of it. The Playground's style loader
// (docs/src/lib/style-loader.ts) fetches an index and the always-needed modules, scans the HTML the
// engine renders, and fetches the modules that HTML needs. Three claims, each with its own test:
//
//   1. a plain deck's frame carries a fraction of the whole sheet, and the page never fetches the
//      whole `lattice.css` (the byte win);
//   2. a component that first appears in an EDIT has its rules before it shows (no flash of unstyled
//      content): the sheet it needs arrives with the slide, in the same write;
//   3. the loader is OPT-IN (`?styles=modules`): without it the page registers the whole sheet, as it always did.
//
// The all-decks computed-style proof lives in `tools/style-loader-gate.mjs`; these tests pin the
// behavior a regression in the wiring (not in the scanner) would break.

const SOURCE_KEY = 'lattice-docs-pg-source';

const PLAIN = `---
marp: true
---

## Slide one

A plain first slide.

---

## Slide two

Another plain slide.
`;

const WITH_FUNNEL = `${PLAIN}
---

<!-- _class: funnel -->

## Most signals die long before they change a decision.

- Signals logged \`12,000\`
- Triaged \`4,800\`
- Scored \`2,160\`
- Surfaced to a decision \`864\`
`;

async function seed(page: Page, source: string) {
	await page.addInitScript(
		([k, s]) => {
			try {
				localStorage.setItem(k as string, s as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, source],
	);
}

/** The frame that holds the slides, once its first slide is in. */
async function previewFrame(page: Page): Promise<Frame> {
	await page.locator('#preview').waitFor({ state: 'attached', timeout: 40_000 });
	await expect(page.frameLocator('#preview').locator('.lattice > section').first()).toBeAttached({ timeout: 40_000 });
	const handle = await page.locator('#preview').elementHandle();
	const frame = await handle?.contentFrame();
	if (!frame) throw new Error('preview frame has no content frame');
	return frame;
}

/** The composed sheet length in the frame, once it has stopped changing (a second pass can land late). */
async function settledSheetLength(frame: Frame): Promise<number> {
	// Polled INSIDE the frame, against the signal itself: the length read four times running, 250 ms apart.
	return frame.evaluate(
		() =>
			new Promise<number>((resolve) => {
				let last = -1;
				let same = 0;
				const tick = () => {
					const n = document.getElementById('lattice-doc')?.textContent?.length ?? 0;
					same = n === last ? same + 1 : 0;
					last = n;
					if (same >= 4) resolve(n);
					else setTimeout(tick, 250);
				};
				tick();
			}),
	);
}

const STYLE_ASSET = /\/playground\/v\/[^/]+\/(styles\/|themes\/lattice\.css)/;

test('a plain deck loads a fraction of the engine sheet and never the whole file', async ({ page }) => {
	await seed(page, PLAIN);
	const fetched: string[] = [];
	page.on('request', (r) => {
		const m = STYLE_ASSET.exec(r.url());
		if (m) fetched.push(r.url().slice(r.url().indexOf(m[1])));
	});
	await page.goto('/playground/?view=edit&styles=modules', { waitUntil: 'domcontentloaded' });
	const modular = await settledSheetLength(await previewFrame(page));

	// ANTI-VACUITY: the loader ran (it asked for its index), and the whole file was not requested.
	expect(fetched.some((u) => u.startsWith('styles/needs.json')), 'the index was fetched').toBe(true);
	expect(fetched.filter((u) => u.startsWith('styles/') && u.endsWith('.css')).length, 'some modules were fetched').toBeGreaterThan(5);
	expect(fetched.filter((u) => u === 'themes/lattice.css'), 'the whole sheet was fetched').toEqual([]);

	// The same deck with the escape hatch is the whole-sheet size to compare against.
	const whole = await page.context().newPage();
	await whole.addInitScript(
		([k, s]) => localStorage.setItem(k as string, s as string),
		[SOURCE_KEY, PLAIN],
	);
	await whole.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	const full = await settledSheetLength(await previewFrame(whole));
	await whole.close();

	expect(modular, `loader sheet ${modular} bytes against ${full} for the whole sheet`).toBeLessThan(full * 0.45);
});

test('a component that first appears in an edit has its rules in the sheet before it is shown', async ({ page }) => {
	await seed(page, PLAIN);
	await page.goto('/playground/?view=edit&styles=modules', { waitUntil: 'domcontentloaded' });
	const before = await settledSheetLength(await previewFrame(page));

	// Watch the frame for the funnel slide's arrival and record, at that instant, how many rules in the
	// document's stylesheets name `.funnel`. The patch path keeps the document, so the watcher survives;
	// if the frame is rewritten instead, the new document is built with its sheet in one srcdoc, which
	// has no unstyled moment to catch (and the watcher's record is simply absent).
	const frame = await previewFrame(page);
	await frame.evaluate(() => {
		const w = window as unknown as { __funnelRules?: number[] };
		w.__funnelRules = [];
		const count = () => {
			let n = 0;
			for (const sheet of Array.from(document.styleSheets)) {
				for (const rule of Array.from(sheet.cssRules)) if ((rule as CSSStyleRule).selectorText?.includes('.funnel')) n++;
			}
			return n;
		};
		new MutationObserver((records) => {
			for (const r of records)
				for (const node of Array.from(r.addedNodes))
					if (node instanceof HTMLElement && (node.matches('section.funnel') || node.querySelector('section.funnel'))) w.__funnelRules!.push(count());
		}).observe(document.documentElement, { childList: true, subtree: true });
	});

	await page.locator('.cm-content').first().click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.insertText(WITH_FUNNEL);

	await expect(page.frameLocator('#preview').locator('.lattice section.funnel').first()).toBeAttached({ timeout: 40_000 });
	const frameAfter = await previewFrame(page);
	const after = await settledSheetLength(frameAfter);

	// ANTI-VACUITY: the funnel's module arrived with the edit (the sheet grew), and the slide drew.
	expect(after, 'the sheet gained the funnel module').toBeGreaterThan(before);
	const rules = await frameAfter.evaluate(() => {
		let n = 0;
		for (const sheet of Array.from(document.styleSheets)) {
			for (const rule of Array.from(sheet.cssRules)) if ((rule as CSSStyleRule).selectorText?.includes('.funnel')) n++;
		}
		return n;
	});
	expect(rules, 'rules naming .funnel are in the frame').toBeGreaterThan(0);
	await expect(page.frameLocator('#preview').locator('section.funnel svg').first()).toBeAttached({ timeout: 20_000 });

	const seen = await frame.evaluate(() => (window as unknown as { __funnelRules?: number[] }).__funnelRules).catch(() => undefined);
	if (seen?.length) expect(Math.min(...seen), 'the funnel slide appeared before its rules').toBeGreaterThan(0);
});

test('without ?styles=modules the page registers the whole sheet and loads no module', async ({ page }) => {
	await seed(page, PLAIN);
	const fetched: string[] = [];
	page.on('request', (r) => {
		const m = STYLE_ASSET.exec(r.url());
		if (m) fetched.push(r.url().slice(r.url().indexOf(m[1])));
	});
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await settledSheetLength(await previewFrame(page));
	expect(fetched.filter((u) => u === 'themes/lattice.css').length, 'the whole sheet was fetched').toBeGreaterThan(0);
	expect(fetched.filter((u) => u.startsWith('styles/')), 'no module or index was fetched').toEqual([]);
});
