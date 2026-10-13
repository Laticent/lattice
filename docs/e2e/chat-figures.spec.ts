import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// A FIGURE IN A CHAT REPLY IS DRAWN, ON THE REAL SURFACE.
//
// A reply that carries a ```mermaid, ```math or ```lattice fence shows the diagram, the equation or
// the slide in the bubble — drawn by the engine and runtime the deck is drawn by, in the deck's
// theme — instead of printing source. Each figure is a tile in the chat's own PreviewPool, so the
// number of live frames stays small however many figures a conversation holds
// (engineering/decisions/2026-10-12-chat-figures-bakeoff.md). The model is MOCKED, not spent (HARD
// RULE #24): the seeded key is a throwaway string and every openrouter.ai request is fulfilled here.

const FIG = (i: number) => ['```mermaid', 'flowchart LR', `  A["Raw ${i}"] --> B["Classify"]`, '  B --> C["Decide"]', '```'].join('\n');
const REPLY = ["Here's the pipeline:", '', FIG(1), '', 'The identity behind slide 3:', '', '```math', 'E = mc^2 + \\frac{1}{2}', '```', '', 'And how the slide would read:', '', '```lattice', '<!-- _class: content -->', '## The one slide', '', '- First point', '- Second point', '```', '', ...Array.from({ length: 11 }, (_, i) => FIG(i + 2).concat('\n')), 'Done.'].join('\n');

const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;

for (const [w, h] of [
	[1440, 900],
	[820, 1180],
	[390, 844],
] as const) {
	test.describe(`at ${w}px`, () => {
		test.use({ viewport: { width: w, height: h } });
		test('a reply with a diagram, an equation and a slide draws them, and only a few frames stay live', async ({ page }) => {
			test.setTimeout(120_000);
			await page.addInitScript(() => {
				try {
					localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
					localStorage.setItem('lattice-db-dedup', 'off');
				} catch {
					/* storage unavailable — the spec fails loudly on the missing control */
				}
			});
			await page.route('https://openrouter.ai/**', async (route) => {
				if (!route.request().url().includes('/chat/completions')) {
					await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
					return;
				}
				const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.01 };
				await route.fulfill({
					status: 200,
					contentType: 'text/event-stream',
					body: sse([
						{ id: 'g1', choices: [{ index: 0, delta: { content: REPLY } }] },
						{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
					]),
				});
			});

			await gotoStudio(page);
			await openChatAtWidth(page, w);
			await page.getByRole('textbox', { name: 'Message the Architect' }).fill('show me the pipeline');
			await page.getByRole('button', { name: 'Send', exact: true }).click();
			await expect(page.getByText('Done.')).toBeVisible({ timeout: 30_000 });

			// Fourteen fences became fourteen figures — none printed as source.
			const figures = page.getByTestId('chat-figure');
			await expect(figures).toHaveCount(14);
			await expect(page.locator('.cm-chat-md pre')).toHaveCount(0);

			// The first figures (the ones in view) are DRAWN by the runtime: an svg for the diagram,
			// KaTeX for the equation. Read from the pooled frames themselves.
			const drawn = () =>
				page.evaluate(() => {
					// Only the CHAT's frames: the Studio's own preview is an iframe that draws a diagram too.
					const sc = document.querySelector('[data-testid="chat-figure"]')?.closest('.overflow-y-auto');
					const docs = [...(sc?.querySelectorAll('iframe') ?? [])].map((f) => (f as HTMLIFrameElement).contentDocument).filter(Boolean) as Document[];
					return {
						frames: docs.length,
						svg: docs.some((d) => !!d.querySelector('section svg')),
						katex: docs.some((d) => !!d.querySelector('.katex')),
						slide: docs.some((d) => /The one slide/.test(d.body?.textContent ?? '')),
					};
				});
			// Scroll each figure into the pool's band in turn and wait for its content.
			await figures.nth(0).scrollIntoViewIfNeeded();
			await expect.poll(async () => (await drawn()).svg, { timeout: 30_000, message: 'the mermaid diagram never drew' }).toBe(true);
			await figures.nth(1).scrollIntoViewIfNeeded();
			await expect.poll(async () => (await drawn()).katex, { timeout: 30_000, message: 'the equation never typeset' }).toBe(true);
			await figures.nth(2).scrollIntoViewIfNeeded();
			await expect.poll(async () => (await drawn()).slide, { timeout: 30_000, message: 'the slide never drew' }).toBe(true);
			await page.screenshot({ path: test.info().outputPath(`chat-figures-${w}.png`) });

			// Fourteen figures, a handful of frames: the pool is doing its job, not one iframe each. Counted inside the
			// transcript only — the Studio's own preview is an iframe too.
			const scroller = figures.nth(0).locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]');
			const held = await scroller.locator('iframe').count();
			expect(held, 'the pool holds no frames for the figures it drew').toBeGreaterThan(0);
			// The pool covers whatever is on screen, plus the chat's floor of 4 slots (`baseSlots`), and
			// nothing for the figures scrolled far away. A narrow docked column shows many short figures
			// at once, so the bound is the visible count, not a constant.
			const visible = await scroller.evaluate((sc) => {
				const box = sc.getBoundingClientRect();
				return [...sc.querySelectorAll('[data-testid="chat-figure"]')].filter((el) => {
					const r = el.getBoundingClientRect();
					return r.bottom > box.top && r.top < box.bottom;
				}).length;
			});
			expect(held, `${held} frames for ${visible} visible figures out of 14 — the pool grew toward one frame per figure`).toBeLessThanOrEqual(Math.max(4, visible) + 3);
			expect(held, 'every figure holds its own frame').toBeLessThan(14);
			expect(await scroller.locator('.cm-chat-md iframe').count(), 'frames live inside the bubbles instead of the pool layer').toBe(0);

			// The source is one tap away and the figure comes back.
			await figures.nth(0).getByRole('button', { name: /source/i }).click();
			await expect(figures.nth(0).locator('pre')).toContainText('flowchart LR');
			await figures.nth(0).getByRole('button', { name: /^Show the diagram$/ }).click();
			await expect(figures.nth(0).locator('pre')).toHaveCount(0);

			// No sideways scroll on the transcript at this width.
			expect(await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
		});
	});
}
