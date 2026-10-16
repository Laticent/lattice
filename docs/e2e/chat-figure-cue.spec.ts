import { expect, gotoStudio, openChatAtWidth, setEditorContent, test } from './studio-fixture';

// THE ARCHITECT'S "CHANGES A FIGURE" CUE, ON THE REAL SURFACE (PR #2723).
//
// `figureChange` (ArchitectChat.tsx) is a pure function with a unit table, but the cue is a chip on
// the review card of a proposed edit. This drives the real Studio with a scripted model: one edit
// drops a trillion (`$5T` → `$5`, which the cue missed because `T` was not a magnitude) and respells a
// billion (`$5B` → `$5bn`, which is a reformat and must NOT be flagged); a second edit makes a real
// change (`$5bn` → `$6bn`, which must be). The cue is advisory: nothing here applies an edit.
//
// THE MODEL IS MOCKED, NOT SPENT (HARD RULE #24). The seeded key is a throwaway string and every
// openrouter.ai request is fulfilled here.

const DECK = ['---', 'theme: indaco', '---', '', '<!-- _class: title -->', '# Figures', '', '---', '', '<!-- _class: content -->', '## Market', '', '- GDP $5T', '- ARR $5B', '', '---', '', '<!-- _class: content -->', '## Cost', '', '- Run rate $5bn'].join('\n');

const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;

for (const [w, h] of [
	[1440, 900],
	[820, 1180],
	[390, 844],
] as const) {
	test(`the figure cue flags a dropped trillion and a real change, and ignores a respelled billion at ${w}px`, async ({ page }) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: w, height: h });
		await page.addInitScript(() => {
			try {
				localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
				localStorage.setItem('lattice-db-dedup', 'off');
			} catch {
				/* storage unavailable — the spec fails loudly on the missing control */
			}
		});
		const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 };
		const edits = [
			{ action: 'replace', slide: 2, body: ['<!-- _class: content -->', '## Market', '', '- GDP $5', '- ARR $5bn'].join('\n') },
			{ action: 'replace', slide: 3, body: ['<!-- _class: content -->', '## Cost', '', '- Run rate $6bn'].join('\n') },
		];
		let round = 0;
		await page.route('https://openrouter.ai/**', async (route) => {
			if (!route.request().url().includes('/chat/completions')) {
				await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
				return;
			}
			round++;
			const frames =
				round === 1
					? [
							{ id: 'g1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'edit_slides', arguments: JSON.stringify({ edits, summary: 'Tightened the figures.' }) } }] } }] },
							{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage },
						]
					: [
							{ id: 'g2', choices: [{ index: 0, delta: { content: 'Done.' } }] },
							{ id: 'g2', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
						];
			await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
		});

		await gotoStudio(page);
		// On a phone the editor sits behind the Source tab; the preview is showing at first.
		if (w < 700) await page.getByRole('button', { name: 'Markdown source' }).click();
		await setEditorContent(page, DECK);
		await openChatAtWidth(page, w);
		await page.getByRole('textbox', { name: 'Message the Architect' }).fill('Tighten the figures.');
		await page.getByRole('button', { name: 'Send', exact: true }).click();
		await expect(page.getByRole('button', { name: /^Apply/ }).first()).toBeVisible({ timeout: 60_000 });

		const cues = page.getByText(/Changes a figure — verify/);
		await expect(cues).toHaveCount(2);
		// Slide 2: the dropped trillion is named; the respelled billion ($5B → $5bn) is not.
		await expect(cues.nth(0)).toContainText('$5T → $5');
		await expect(cues.nth(0)).not.toContainText('$5B');
		await expect(cues.nth(0)).not.toContainText('bn');
		// Slide 3: a real change is named.
		await expect(cues.nth(1)).toContainText('$5b → $6b');
		await page.screenshot({ path: test.info().outputPath(`chat-figure-cue-${w}.png`) });
	});
}
