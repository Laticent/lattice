import type { Page } from '@playwright/test';
import { expect, isPhone, test, waitForStudioPaint } from './studio-fixture';

// REFINE IN COMPOSE, ON THE REAL SURFACE (engineering/decisions/2026-11-10-compose-first.md §1.1).
//
// Compose became the Studio's default, and Refine (the model rewrites a selection) used to be offered only in the
// Markdown editor. Compose now offers it for a selection of plain text in one style inside one block, and replaces
// exactly that run (ComposeView `refinableRange`). The unit tier pins the guard; this drives it in a browser.
//
// The model is MOCKED, never spent (HARD RULE #24): `page.route` answers OpenRouter with a fixed rewrite. The Studio
// opens the way a new visitor's does (Compose, nothing stored but the mock key), so this also runs the new default.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const USAGE = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.001 };
const REWRITE = 'bright new words';
const DECK = ['# Refine here', '', 'Alpha beta gamma delta.', '', '---', '', '# Second slide', '', 'Keep **this** exactly.', ''].join('\n');

async function openWithModel(page: Page, deck: string): Promise<void> {
	await page.addInitScript((d) => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-or-model', 'test/model');
			localStorage.setItem('lattice-db-dedup', 'off');
			localStorage.setItem('lattice-studio-src-welcome', JSON.stringify(d));
		} catch {
			/* storage unavailable: the spec fails loudly on the missing control */
		}
	}, deck);
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
			return;
		}
		// Answer in whichever shape the client asked for.
		const body = JSON.parse(route.request().postData() || '{}') as { stream?: boolean };
		if (body.stream) {
			const frames = [{ id: 'r1', choices: [{ index: 0, delta: { content: REWRITE } }] }, { id: 'r1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE }];
			await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n` });
		} else {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'r1', choices: [{ index: 0, message: { role: 'assistant', content: REWRITE }, finish_reason: 'stop' }], usage: USAGE }) });
		}
	});
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
}

/** Select `text` inside the first text node of `block` that holds it, through the DOM selection ProseMirror reads. */
async function selectIn(page: Page, block: string, text: string): Promise<void> {
	await page.locator('#studio-pane-editor .cs-host p', { hasText: block }).first().evaluate(
		(p, t) => {
			const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
			for (let n = walker.nextNode(); n; n = walker.nextNode()) {
				const at = (n.textContent ?? '').indexOf(t);
				if (at >= 0) {
					(p.closest('[contenteditable]') as HTMLElement | null)?.focus();
					document.getSelection()?.setBaseAndExtent(n, at, n, at + t.length);
					return;
				}
			}
			throw new Error(`no text node holds "${t}"`);
		},
		text,
	);
}

const stored = (page: Page) =>
	page.evaluate(() => {
		const key = Object.keys(localStorage).find((k) => k.startsWith('lattice-studio-src-'));
		return key ? (JSON.parse(localStorage.getItem(key) ?? '""') as string) : '';
	});

test('@crosswidth @gecko @webkit-tablet Refine in Compose rewrites only the selected words', async ({ page }) => {
	test.skip(isPhone(page), 'the phone has no editor toolbar; Refine lives in it');
	await openWithModel(page, DECK);
	const refine = page.getByRole('button', { name: 'Refine selection' });
	await expect(refine, 'Refine waits for a selection').toHaveCount(0);

	await selectIn(page, 'Alpha beta', 'beta gamma');
	await expect(refine, 'a plain-text selection in one block offers Refine').toBeVisible();
	await refine.click();
	await page.getByRole('menuitem', { name: /^Polish/ }).click();

	await expect.poll(() => stored(page)).toContain(`Alpha ${REWRITE} delta.`);
	const deck = await stored(page);
	expect(deck, 'the rest of the slide is untouched').toContain('# Refine here');
	expect(deck, 'the other slide is untouched').toContain('Keep **this** exactly.');
	expect(deck).not.toContain('beta gamma');
});

test('@crosswidth @gecko @webkit-tablet Refine in Compose is not offered over a run that mixes styles', async ({ page }) => {
	test.skip(isPhone(page), 'the phone has no editor toolbar; Refine lives in it');
	await openWithModel(page, DECK);
	// A witness first, so "not offered" below cannot pass on a page where Refine never appears.
	await selectIn(page, 'Alpha beta', 'Alpha');
	await expect(page.getByRole('button', { name: 'Refine selection' })).toBeVisible();
	// "Keep this exactly." with "this" in bold: one rewrite would drop the bold without a word.
	await page.locator('#studio-pane-editor .cs-host p', { hasText: 'Keep' }).first().evaluate((p) => {
		(p.closest('[contenteditable]') as HTMLElement | null)?.focus();
		const range = document.createRange();
		range.selectNodeContents(p);
		const sel = document.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	});
	await expect(page.getByRole('button', { name: 'Refine selection' })).toHaveCount(0);
});
