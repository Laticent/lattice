// Callouts on the two charts the browser lays out, on the real Studio (engineering/decisions/2026-10-20-callout-placement.md § 12).
//
// The server half names each note's shape and carries the notes in the model; the Trama pass in the preview
// iframe places them once the layout has put every shape in its place. A unit test holds the placer on a made-up
// geometry; this holds the whole path: the engine's payload, the runtime's pass, the painted ring and note, and
// the figure growing to hold them. A callout that parses but never draws is the failure to catch.
import type { Page } from '@playwright/test';
import { expect, gotoStudio, LIVE_PREVIEW, test, typeDeck } from './studio-fixture';

const live = (page: Page) => page.frameLocator(LIVE_PREVIEW);

const FLOW = '<!-- _class: flowchart -->\n\n## The queue clears in three steps.\n\n- Intake `pill` => Triage => Severity?\n- Severity? `diamond`\n  - =SEV1=> Page on-call\n  - -SEV2-> Open ticket => Mitigate\n- Page on-call => Mitigate\n';
const STATE = '<!-- _class: state-chart -->\n\n## A release moves one way.\n\n- Draft => Review => Approved => Live\n- Review =changes=> Draft\n';

for (const [name, svg, deck, notes, shape, nodes] of [
	['flowchart', 'svg.flowchart-svg', FLOW, '`@callout{[{Pages the secondary after five minutes, for=Page on-call}, {The slowest step, for=Mitigate}]}`', 'Page on-call', 'svg.flowchart-svg .fc-shape'],
	['state chart', 'svg.state-chart-edges', STATE, '`@callout{[{Two reviewers sign off here, for=Approved}, {Rollback is one click, for=Live}]}`', 'Approved', 'svg.state-chart-edges .state-node-shape'],
] as const) {
	// The deck is typed once: on the phone's one-pane layout a second replacement of the editor's content lost its first
	// characters, and the preview showed the source as text. That is how the harness types there, not what a person does.
	test(`@smoke @webkit-tablet @webkit-phone @gecko a ${name} callout rings its shape and sets its note under the figure, in the live preview`, async ({ page }) => {
		await gotoStudio(page);
		await typeDeck(page, `${deck}\n${notes}\n`);
		const note = notes.match(/\[\{([^,]+),/)?.[1] ?? '';
		const noteText = live(page).locator(`${svg} text`, { hasText: note }).first();
		await expect(noteText).toBeVisible({ timeout: 30_000 });
		await expect(live(page).locator(`${svg} .legend-target`).first()).toBeAttached();
		// The notes sit UNDER the figure: the note's text starts below the lowest shape the chart drew. Both are read in the
		// frame's own coordinates (`getBoundingClientRect`); `boundingBox()` on SVG text in an iframe disagreed with the
		// shapes' boxes in WebKit.
		// One read, in one script in the frame, polled until the drawing holds it. The live preview repaints the chart each
		// layout round and once more when it settles (trama/pipeline.ts `writeSvg` replaces the SVG's children), and a
		// locator's `evaluate` resolves the element in one round trip and runs in another: a repaint between them measured
		// a detached `<text>`, whose box is all zeros (noteTop 0 against lowest 373, once in a full webkit-tablet run).
		const placement = () =>
			live(page)
				.locator('body')
				.evaluate(
					(body, [svgSel, nodeSel, text]) => {
						const noteEl = [...body.querySelectorAll(`${svgSel} text`)].find((t) => (t.textContent ?? '').includes(text));
						const bottoms = [...body.querySelectorAll(nodeSel)].map((el) => el.getBoundingClientRect().bottom);
						return { noteTop: noteEl ? noteEl.getBoundingClientRect().top : null, lowest: bottoms.length ? Math.max(...bottoms) : null };
					},
					[svg, nodes, note] as const,
				);
		// The gap from the lowest shape's bottom to the note's top; a missing note or shape reads as no gap at all.
		await expect
			.poll(async () => {
				const { noteTop, lowest } = await placement();
				return noteTop === null || lowest === null ? Number.NEGATIVE_INFINITY : noteTop - lowest;
			}, { message: 'the note is set under the lowest shape' })
			.toBeGreaterThan(-1);
		// The notes are words the author wrote, so the callout source is not left on the slide as text.
		await expect(live(page).getByText('@callout{')).toHaveCount(0);
		// And the shape the first note names carries its ring.
		await expect(live(page).locator(`${svg} [data-label="${shape}"]`).first()).toBeAttached();
	});
}

test('@webkit-phone a callout that names no shape is reported in the description, not drawn and not lost', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, `${FLOW}\n\`@callout{[{Orphan note, for=Nowhere}]}\`\n`);
	await expect(live(page).locator('svg.flowchart-svg [data-mark]').first()).toBeAttached({ timeout: 30_000 });
	await expect(live(page).locator('svg.flowchart-svg text', { hasText: 'Orphan note' })).toHaveCount(0);
	await expect(live(page).locator('svg.flowchart-svg desc').first()).toContainText('Not drawn: "Orphan note"');
});
