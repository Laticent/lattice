import { expect, gotoStudio, livePreview, openChat, setEditorContent, test } from './studio-fixture';

// THE CHAT AGENT SEES WHETHER ITS SLIDES FIT.
//
// The agent edits a draft and its checker answers with each edit. Lint and review cannot
// tell a slide that overflows from one that fits, so the checker also renders the DRAFT the
// way export does — off-screen, every slide laid out — and reads back the runtime's own
// `.overflow` verdict (draft-fit.ts → deck-export.js `measureDeckFit`). This spec is the
// real-surface proof (HARD RULE #23): the real Studio, a real render, and a scripted model.
//
// THE MODEL IS MOCKED, NOT SPENT (HARD RULE #24). The seeded key is a throwaway string and
// every openrouter.ai request is fulfilled here.
//
// Round one asks for an edit that writes a deliberately overfull slide. The checker must
// call it out from the render, and — because it is a slide this turn wrote — hold the turn
// open for a second round instead of ending on the edit. Round two's request is where the
// verdict is read: it is the tool result the model would act on.

const DECK = ['---', 'theme: indaco', '---', '', '<!-- _class: title -->', '# Fit check', '', '---', '', '<!-- _class: content -->', '## Short and fine', '', '- One line'].join('\n');

const OVERFULL = ['<!-- _class: content -->', '## Everything we did this quarter, in full', '', ...Array.from({ length: 28 }, (_, i) => `- Item ${i + 1}: a long line that keeps going past the point where any slide could hold it all`)].join('\n');

function sse(frames: unknown[]): string {
	return `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
}

test('an overfull draft slide comes back flagged from a real render, and holds the turn open', async ({ page }) => {
	test.setTimeout(120_000);
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-dedup', 'off');
		} catch {
			/* storage unavailable — the spec fails loudly on the missing control */
		}
	});
	const bodies: { messages: { role: string; content: unknown }[] }[] = [];
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
			return;
		}
		const body = route.request().postDataJSON();
		bodies.push(body);
		const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 };
		const frames =
			bodies.length === 1
				? [
						{ id: 'gen-1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'edit_slides', arguments: JSON.stringify({ edits: [{ action: 'replace', slide: 2, body: OVERFULL }], summary: 'Expanded slide 2 with every item.' }) } }] } }] },
						{ id: 'gen-1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage },
					]
				: [
						{ id: 'gen-2', choices: [{ index: 0, delta: { content: 'The checker says slide 2 overflows; I would split it.' } }] },
						{ id: 'gen-2', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
					];
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
	});

	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await openChat(page);
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('Put every item on slide 2.');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(page.getByText('The checker says slide 2 overflows')).toBeVisible({ timeout: 60_000 });

	// A second round happened at all: an overflow on a slide the turn wrote is an error, so
	// the turn did not end on the edit's summary.
	expect(bodies.length, 'the turn ended on the edit — the overflow did not hold it open').toBe(2);
	const tool = bodies[1].messages.filter((m) => m.role === 'tool').at(-1);
	const text = typeof tool?.content === 'string' ? tool.content : JSON.stringify(tool?.content);
	expect(text).toContain('Fit, measured from a real render of the draft');
	expect(text).toMatch(/slide 2 overflows its frame[^\n]*\(you changed this slide: an error/);
	// The untouched title slide fits, so it is not named.
	expect(text).not.toMatch(/slide 1 (overflows|has text cut)/);

	// The review card still offers the change; the author decides.
	await page.screenshot({ path: test.info().outputPath('chat-agent-fit-card.png') });
	await page.getByRole('button', { name: /^Apply/ }).first().click();
	// The same slide in the live preview, after Apply: the overflow the checker named.
	await page.getByRole('button', { name: 'Slide 2 — content' }).click();
	await expect(livePreview(page).getByText('Everything we did this quarter')).toBeVisible({ timeout: 30_000 });
	await page.screenshot({ path: test.info().outputPath('chat-agent-fit-applied.png') });
});
