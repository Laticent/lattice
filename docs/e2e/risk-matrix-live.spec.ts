import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// ── The `risk-matrix` chart on the REAL surfaces (#2714) ────────────────────────
//
// The kernel's unit tests pin the strings: each risk's marker carries
// `data-mark="<i>"`, a `<template class="chart-detail">` follows each risk, and the
// narrator binds its sentences to `{ mark: i }` worst first. None of that proves a
// reader can HOVER a marker and get its card, or that the Guide's pointer lands on
// the marker it is reading (HARD RULE #23). These two arms drive both, on the
// Playground and the Studio's Present mode, as tower-live.spec.ts does for the tower.

test.describe.configure({ timeout: 180_000 });

const SOURCE_KEY = 'lattice-docs-pg-source';

const REGISTER = `---
marp: true
theme: indaco
delivery: expressive
---

<!-- _class: risk-matrix -->

\`Enterprise risk register · Q4 2026\`

## Cyber and hurricane risk sit in the red.

- Cyber outage \`{4, 5}\` \`{2, 4}\`
  - Owner: CISO
- Hurricane season \`{3, 5}\`
  - Owner: Cat modeling
- FX swing \`{4, 2}\`
  - Owner: Treasury
- Pandemic \`{1, 5}\`
  - Owner: Group risk
`;

const NAMES = ['Cyber outage', 'Hurricane season', 'FX swing', 'Pandemic'];
const OWNERS = ['CISO', 'Cat modeling', 'Treasury', 'Group risk'];

/** The page-space point the center of `sel` inside the Playground's unscaled preview frame. */
async function markPoint(page: import('@playwright/test').Page, sel: string, k = 0) {
	return page.evaluate(([s, i]) => {
		const fe = document.querySelector('iframe') as HTMLIFrameElement;
		const fb = fe.getBoundingClientRect();
		const n = fe.contentDocument?.querySelectorAll(s as string)[i as number];
		if (!n) return null;
		const b = n.getBoundingClientRect();
		return { x: fb.x + b.x + b.width * 0.5, y: fb.y + b.y + b.height * 0.5 };
	}, [sel, k] as const);
}

/** Sweep onto `sel` (a settled hover hides the wrapper-pointer defect) and read the card. */
async function revealText(page: import('@playwright/test').Page, sel: string, k = 0) {
	const p = await markPoint(page, sel, k);
	if (!p) return null;
	await page.mouse.move(20, 20);
	await page.waitForFunction(() => !document.querySelector('[data-slot="popover-content"]'), undefined, { timeout: 10_000 });
	await page.mouse.move(p.x - 60, p.y - 60);
	await page.mouse.move(p.x, p.y, { steps: 14 });
	const placed = await page
		.waitForFunction(
			() => {
				const n = document.querySelector('[data-slot="popover-content"]') as HTMLElement | null;
				return !!(n && n.getBoundingClientRect().x > 0 && n.innerText.trim());
			},
			undefined,
			{ timeout: 5_000 },
		)
		.catch(() => null);
	if (!placed) return null;
	return page.evaluate(() => {
		const text = (n: Node): string => {
			if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? '';
			const el = n as Element;
			const kids = [...(el.shadowRoot ? el.shadowRoot.childNodes : []), ...el.childNodes];
			const inner = kids.map(text).join('');
			return /^(DIV|P|LI|SECTION|UL|OL)$/.test(el.tagName ?? '') ? `\n${inner}\n` : inner;
		};
		return text(document.querySelector('[data-slot="popover-content"]') as HTMLElement)
			.replace(/[ \t]+/g, ' ')
			.split(/\n+/)
			.map((l) => l.trim())
			.filter(Boolean)
			.join(' | ');
	});
}

test('hovering each risk’s marker opens that risk’s card', async ({ page }) => {
	await page.addInitScript(
		([k, s]) => {
			try {
				localStorage.setItem(k as string, s as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, REGISTER],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	const preview = page.frameLocator('iframe').first();
	await expect(preview.locator('.risk-matrix-svg')).toBeVisible({ timeout: 40_000 });
	// ANTI-VACUITY: four placed risks, each with a detail sublist, so four templates.
	// A risk without a sublist has no card, by the chart family's contract (mark-detail.js).
	await expect(preview.locator('template.chart-detail')).toHaveCount(4);
	await expect(preview.locator('circle.risk-marker')).toHaveCount(4);
	await page.waitForFunction(
		() => {
			const n = (document.querySelector('iframe') as HTMLIFrameElement)?.contentDocument?.querySelector('.risk-matrix-svg');
			if (!n) return false;
			const w = window as unknown as { __lastBox?: string };
			const box = JSON.stringify(n.getBoundingClientRect());
			const settled = w.__lastBox === box;
			w.__lastBox = box;
			return settled;
		},
		undefined,
		{ polling: 'raf', timeout: 30_000 },
	);

	// data-mark is the authored index: 0 = Cyber outage … 3 = Pandemic.
	for (const [i, name] of NAMES.entries()) {
		const text = await revealText(page, `circle.risk-marker[data-mark="${i}"]`);
		expect(text, `${name} opens a card`).not.toBeNull();
		expect(text).toContain(name);
		expect(text, `${name}'s card carries its own detail`).toContain(OWNERS[i]);
		for (const other of NAMES) if (other !== name) expect(text, `${name}'s card names no other risk`).not.toContain(other);
	}
	await page.screenshot({ path: test.info().outputPath('risk-card.png') });
});

test('the Guide’s ink lands on each risk’s marker as it reads it', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, REGISTER);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(page.locator('.vetrina-cursor')).toHaveCount(1);
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					const f = document.querySelector('[role="dialog"] [aria-label="Presented slide"] iframe.live') as HTMLIFrameElement | null;
					return f?.contentDocument?.querySelectorAll('.risk-matrix-svg circle.risk-marker').length ?? 0;
				}),
			{ timeout: 30_000 },
		)
		.toBe(4);

	await page.evaluate(() => {
		const w = window as unknown as { __ink: { kind: string; box: DOMRect }[] };
		w.__ink = [];
		new MutationObserver((records) => {
			for (const r of records) {
				for (const n of r.addedNodes) {
					if (!(n instanceof HTMLElement)) continue;
					for (const el of [n, ...n.querySelectorAll('[data-vt-cue]')]) {
						const kind = (el as HTMLElement).dataset?.vtCue;
						if (kind) queueMicrotask(() => w.__ink.push({ kind, box: el.getBoundingClientRect() }));
					}
				}
			}
		}).observe(document.body, { childList: true, subtree: true });
	});
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();

	// THE ORACLE: a marker-sized stroke whose box holds a marker's center. The figure-wide
	// bracket holds every center too, so a stroke counts only when it is no wider than
	// two grid cells: that is the pointer on one risk, not on the chart.
	const readHits = () =>
		page.evaluate(() => {
			const w = window as unknown as { __ink: { kind: string; box: DOMRect }[] };
			const found = new Set<string>();
			const frame = document.querySelector('[role="dialog"] [aria-label="Presented slide"] iframe.live') as HTMLIFrameElement | null;
			const doc = frame?.contentDocument;
			if (!frame || !doc) return [];
			const fr = frame.getBoundingClientRect();
			const S = frame.offsetWidth ? fr.width / frame.offsetWidth : 1;
			const cellEl = doc.querySelector('rect.risk-cell');
			if (!cellEl) return [];
			const cell = cellEl.getBoundingClientRect().width * S;
			for (const { box } of w.__ink) {
				if (!box.width || !box.height || box.width > cell * 2 || box.height > cell * 2) continue;
				for (const el of doc.querySelectorAll('circle.risk-marker')) {
					const m = el.getBoundingClientRect();
					const cx = fr.left + (m.left + m.width / 2) * S;
					const cy = fr.top + (m.top + m.height / 2) * S;
					if (cx > box.left && cx < box.right && cy > box.top && cy < box.bottom) found.add((el as SVGElement).dataset.mark ?? '');
				}
			}
			return [...found].sort();
		});
	// Worst first: Pandemic (rated medium, data-mark 3) is read last, so once it is inked
	// every risk before it must have been too.
	await expect.poll(readHits, { timeout: 90_000, intervals: [150] }).toContain('3');
	await page.screenshot({ path: test.info().outputPath('risk-guide.png') });
	expect(await readHits(), 'the Guide inks each risk as it reads it').toEqual(['0', '1', '2', '3']);
});
