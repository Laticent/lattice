import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// A flowchart pasted into a deck that had none must draw WITHOUT a reload (owner report on
// #2385). The Studio builds the preview frame once and patches later edits into it, and the
// frame builder only adds the dagre tag when the first build already holds a chart, so the
// pasted chart stayed as its measuring tiles until a reload rebuilt the frame. The runtime
// now fetches dagre from beside itself (`ensureDagre` in lib/runtime/index.js). Measured:
// with that change reverted this spec fails at `data-fc-drawn`; with it, all four lines draw.
const PLAIN = '---\ntheme: indaco\n---\n\n<!-- _class: title -->\n\n# Before\n';
const FLOW = `${PLAIN}\n---\n\n<!-- _class: flowchart -->\n\n## Every page reaches a human.\n\n- Alert => Triage\n- Triage -real-> Page on-call\n- Triage -noise-> Close\n- Page on-call -> Close\n`;

test('a flowchart pasted into a deck with none draws without a reload', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, PLAIN);
	await expect(livePreview(page).locator('h1', { hasText: 'Before' }).first()).toBeVisible();
	// The precondition that makes this a test of the paste path: the frame has no engine.
	expect(await livePreview(page).locator('script[src*="lattice-dagre"]').count()).toBe(0);
	await setEditorContent(page, FLOW);
	const fig = livePreview(page).locator('.flowchart-figure').first();
	await fig.waitFor({ state: 'attached' });
	await expect(fig).toHaveAttribute('data-fc-drawn', /.*/, { timeout: 15_000 });
	// Every line, counted by index: a labeled line is cut under its label into two paths.
	const lines = await livePreview(page)
		.locator('.flowchart-figure svg .fc-edge')
		.evaluateAll((els) => new Set(els.map((e) => e.getAttribute('data-edge') ?? e.parentElement?.getAttribute('data-edge'))).size);
	expect(lines).toBe(4);
});
