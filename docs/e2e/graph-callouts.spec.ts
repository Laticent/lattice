// Callouts on the two charts the browser lays out, on the real Studio (engineering/decisions/2026-10-20-callout-placement.md § 12).
//
// The server half names each note's shape and carries the notes in the model; the Trama pass in the preview
// iframe places them once the layout has put every shape in its place. A unit test holds the placer on a made-up
// geometry; this holds the whole path: the engine's payload, the runtime's pass, the painted ring and note, and
// the figure growing to hold them. A callout that parses but never draws is the failure to catch.
import type { Page } from '@playwright/test';
import { expect, gotoStudio, LIVE_PREVIEW, setEditorContent, test } from './studio-fixture';

const live = (page: Page) => page.frameLocator(LIVE_PREVIEW);

const FLOW = '<!-- _class: flowchart -->\n\n## The queue clears in three steps.\n\n- Intake `pill` => Triage => Severity?\n- Severity? `diamond`\n  - =SEV1=> Page on-call\n  - -SEV2-> Open ticket => Mitigate\n- Page on-call => Mitigate\n';
const STATE = '<!-- _class: state-chart -->\n\n## A release moves one way.\n\n- Draft => Review => Approved => Live\n- Review =changes=> Draft\n';

/** The drawn figure's viewBox height: it grows when notes are set under the chart. */
async function viewBoxHeight(page: Page, svg: string): Promise<number> {
	const vb = await live(page).locator(svg).first().getAttribute('viewBox');
	return Number((vb ?? '').split(/\s+/)[3]);
}

for (const [name, svg, deck, notes, shape] of [
	['flowchart', 'svg.flowchart-svg', FLOW, '`@callout{[{Pages the secondary after five minutes, for=Page on-call}, {The slowest step, for=Mitigate}]}`', 'Page on-call'],
	['state chart', 'svg.state-chart-edges', STATE, '`@callout{[{Two reviewers sign off here, for=Approved}, {Rollback is one click, for=Live}]}`', 'Approved'],
] as const) {
	test(`@smoke a ${name} callout rings its shape and sets its note under the figure, in the live preview`, async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, deck);
		await expect(live(page).locator(`${svg} [data-mark]`).first()).toBeAttached({ timeout: 30_000 });
		const plain = await viewBoxHeight(page, svg);

		await setEditorContent(page, `${deck}\n${notes}\n`);
		const note = notes.match(/\[\{([^,]+),/)?.[1] ?? '';
		await expect(live(page).locator(`${svg} text`, { hasText: note }).first()).toBeVisible({ timeout: 30_000 });
		await expect(live(page).locator(`${svg} .legend-target`).first()).toBeAttached();
		expect(await viewBoxHeight(page, svg), 'the figure grows to hold its notes').toBeGreaterThan(plain);
		// The notes are words the author wrote, so the callout source is not left on the slide as text.
		await expect(live(page).getByText('@callout{')).toHaveCount(0);
		// And the shape the first note names carries its ring.
		await expect(live(page).locator(`${svg} [data-label="${shape}"]`).first()).toBeAttached();
	});
}

test('a callout that names no shape is reported in the description, not drawn and not lost', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, `${FLOW}\n\`@callout{[{Orphan note, for=Nowhere}]}\`\n`);
	await expect(live(page).locator('svg.flowchart-svg [data-mark]').first()).toBeAttached({ timeout: 30_000 });
	await expect(live(page).locator('svg.flowchart-svg text', { hasText: 'Orphan note' })).toHaveCount(0);
	await expect(live(page).locator('svg.flowchart-svg desc').first()).toContainText('Not drawn: "Orphan note"');
});
