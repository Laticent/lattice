import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// DESCRIBE, WITH A MODEL ACTUALLY CONNECTED — the branch the rest of the motion e2e cannot reach.
//
// `motion-faculty.spec.ts` drives the built site, where no model is connected, so it only ever
// exercises the `modelReady === false` half: the bar says so and offers Connect. Everything past
// that — the Generate button, the spinner, the reply crossing `extractSvg` into `intake()`, and the
// ordering of the toast against a refusal — was verified only in unit tests and jsdom. That is a
// proxy for a load-bearing claim, which is what this closes.
//
// THE MODEL IS MOCKED, NOT SPENT. HARD RULE #24 bars our `OPEN_ROUTER_KEY` from any per-PR test
// path and explicitly permits the opposite: a spec that intercepts the endpoint with `page.route`.
// The seeded key is a throwaway string that never leaves the browser and no request reaches
// openrouter.ai — the route handler fulfills every one. Copied deliberately from
// `library-reopen-generate.spec.ts`, which established this shape.

/** Stroked line art in palette tokens with meaningful ids — what `DRAWING_SYSTEM` asks a model for,
 *  written the way a compliant model would answer: chatty prose around a fenced drawing. */
const REPLY = `Here is a review loop:

\`\`\`svg
<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-width="3">
  <title>A review loop</title>
  <rect id="draft-box" x="20" y="60" width="100" height="56" rx="10" stroke="var(--accent)"/>
  <path id="hand-off" d="M120 88 H200" stroke="var(--text-muted)"/>
  <rect id="review-box" x="200" y="60" width="100" height="56" rx="10" stroke="var(--cat-4-mark)"/>
</svg>
\`\`\`

Let me know if you want it simpler.`;

/** A reply `extractSvg` accepts and `intake()` then REFUSES — an `<svg>` carrying nothing that can
 *  be addressed one part at a time. This is the shape that produced "Drew it" over a red refusal,
 *  with the prompt already wiped.
 *
 *  Note a missing `viewBox` is NOT such a case: `ensureViewBox` estimates one from the geometry and
 *  says so in the receipt. The refusal has to be real, or the test passes for the wrong reason. */
const REFUSED = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs></svg>';

async function mockModel(page: Parameters<typeof gotoStudio>[0], content: string) {
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-dedup', 'off');
		} catch {
			/* storage unavailable — the test fails loudly on the missing control */
		}
	});
	await page.route('https://openrouter.ai/**', async (route) => {
		if (!route.request().url().includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				id: 'gen-e2e',
				choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
				usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 },
			}),
		});
	});
}

async function openMotion(page: Parameters<typeof gotoStudio>[0]) {
	await gotoStudio(page);
	await page.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await page.getByRole('menuitem', { name: /Fabricate/ }).click();
	await page.getByRole('button', { name: 'Motion', exact: true }).first().click();
	await expect(page.getByRole('heading', { name: 'Start a drawing' })).toBeVisible();
}

test('@smoke a described drawing arrives as named parts with a plan that already plays', async ({ page }) => {
	test.slow();
	await mockModel(page, REPLY);
	await openMotion(page);

	// With a model connected the bar offers Generate rather than Connect.
	const prompt = page.getByLabel('Describe a drawing');
	await expect(prompt).toBeEnabled();
	await expect(page.getByRole('button', { name: 'Generate drawing' })).toBeVisible();

	await prompt.fill('a review loop');
	await prompt.press('Enter');

	// The reply crossed extractSvg → intake and became addressable parts, named from the ids.
	const parts = page.getByRole('listbox', { name: 'Parts, grouped by beat' });
	await expect(parts).toBeVisible();
	await expect(parts.getByRole('option')).toHaveCount(3);
	// Filter on the OPTION, not on the text: the inspector is one component placed by breakpoint and
	// both halves sit in the DOM at every width, so a bare text match finds the row and the panel.
	await expect(parts.getByRole('option').filter({ hasText: 'Draft Box' })).toHaveCount(1);
	await expect(parts.getByRole('option').filter({ hasText: 'Review Box' })).toHaveCount(1);
	await expect(parts.getByRole('option').filter({ hasText: 'Hand Off' })).toHaveCount(1);

	// The toast is TRUE — it fires only after intake succeeded, not on the next line after the reply.
	await expect(page.getByText(/Drew it/)).toBeVisible();

	// And the drawing really reached the live stage, not merely the parts list. Attached rather than
	// visible: mid-intro the painter hides the poster layer while the live one draws, so a strict
	// visibility check races the animation this faculty exists to run.
	await expect(page.locator('.motion-stage svg').first()).toBeAttached();
	await expect(page.locator('.motion-stage [id$="-draft-box"]').first()).toBeAttached();

	// `setDescribe('')` is deliberately NOT asserted here: the command bar lives in the empty pane,
	// which unmounts on success, and Replace hides it too (replacing a specific drawing is not the
	// same gesture as describing a new one). The clear that MATTERS is the one that must NOT happen —
	// on a refusal — and the test below pins that on the same surface.
});

test('a refusal is not announced as a success, and it keeps the prompt you typed', async ({ page }) => {
	test.slow();
	await mockModel(page, REFUSED);
	await openMotion(page);

	// WATCH FOR THE TOAST RATHER THAN POLLING FOR IT. A toast auto-dismisses, so by the time the
	// refusal has rendered and been asserted, a false "Drew it" has already come and gone — checking
	// for it afterwards passes against the very code the test exists to catch. This records every
	// node added to the document from before the gesture until after it.
	await page.evaluate(() => {
		const seen: string[] = [];
		(window as unknown as { __toasts: string[] }).__toasts = seen;
		new MutationObserver((records) => {
			for (const r of records) {
				for (const n of Array.from(r.addedNodes)) {
					const t = (n.textContent || '').trim();
					if (t) seen.push(t);
				}
			}
		}).observe(document.body, { childList: true, subtree: true });
	});

	const prompt = page.getByLabel('Describe a drawing');
	await prompt.fill('a drawing with nothing to choreograph');
	await prompt.press('Enter');

	// The refusal names its own reason.
	await expect(page.getByRole('alert')).toContainText(/animated one part at a time/i);

	// And "Drew it" was never said — not once, not briefly. The defect this pins announced success
	// synchronously, before `intake()` had run at all, so the toast and the red refusal stood together.
	const toasts = await page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts);
	expect(toasts.filter((t) => /Drew it/.test(t)), 'a refusal must never be announced as a success').toEqual([]);

	// And the prompt survives, because it is the thing you would edit and resend.
	await expect(prompt).toHaveValue('a drawing with nothing to choreograph');
});
