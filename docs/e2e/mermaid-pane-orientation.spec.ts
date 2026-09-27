import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// A MERMAID FLOWCHART IN A TALL PANE FLOWS DOWN IT (lib/runtime/index.js `fenceJob`).
//
// Under a bare headline a 35% side pane on a 16:9 slide is taller than wide, and the engine
// stamps its `<lat-pane>` portrait. The live preview renders Mermaid in the browser, so the
// runtime has to read that stamp rather than the host slide's (landscape): kept left-to-right,
// the five-node chain drew as a thin strip with unreadable labels. The CLI's half is pinned in
// test/unit/runtime/mermaid-pane-orientation.test.js; this is the real preview.
const DECK = [
	'---',
	'theme: indaco',
	'---',
	'',
	'## In a tall pane, the same flow runs down the page.',
	'',
	'<!-- panes: 35/65 -->',
	'<!-- pane: diagram -->',
	'',
	'```mermaid',
	'flowchart LR',
	'  A[Intake] --> B[Triage] --> C[Build] --> D[Review] --> E[Ship]',
	'```',
	'',
	'<!-- pane: list -->',
	'',
	'- Intake takes a day',
	'- Review holds work for a week',
	'',
].join('\n');

test('the preview draws a tall pane\'s flowchart top to bottom', async ({ page }, info) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	const svg = livePreview(page).locator('lat-pane[data-orientation="portrait"] .mermaid svg').first();
	await expect(svg).toBeVisible({ timeout: 30_000 });
	// The drawing's direction, from its first and last node: the SVG element's own box is the
	// pane's slot, not the diagram's shape.
	const nodes = svg.locator('g.node');
	await expect(nodes).toHaveCount(5, { timeout: 30_000 });
	const first = await nodes.first().boundingBox();
	const last = await nodes.last().boundingBox();
	expect(first && last).toBeTruthy();
	if (!first || !last) return;
	expect(Math.abs(last.y - first.y)).toBeGreaterThan(Math.abs(last.x - first.x) * 4);
	const path = info.outputPath('mermaid-pane.png');
	await page.screenshot({ path });
	await info.attach('mermaid-pane.png', { path, contentType: 'image/png' });
});
