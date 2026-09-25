import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE DECLARED HANDLE, on the real Present surface (#2251).
//
// A component may declare, in its manifest, the rendered part a narrated sentence can name and
// the token inside it that names it (`handles`, projected into `guide-handles.generated.ts`).
// `team-profile` declares `{ part: ".person", names: ".person-name" }`, and the Guide is
// supposed to do two things with it: place a sentence no element on the slide holds, and put
// the ink on the NAME rather than around the whole card.
//
// NEITHER SURVIVES A UNIT TEST, which is why this file exists (HARD RULE #23). The unit tier
// runs in jsdom, which has no layout: every range reports no client rects, so `anchorFor`'s
// handle is whatever the test stubs and the ink has no geometry at all. The defect this change
// fixes is a GEOMETRIC one — a `bracket` drawn around a card that already has a border — and
// only a real browser can say whether the ink is on the name or around the card.
//
// No key and no voice are needed: the reader's cue clock runs on the silent rung, the same way
// the beat and guide specs measure without audio.

test.describe.configure({ timeout: 180_000 });

/** A roster with no image references, so the monogram path renders and nothing 404s in a
 *  preview served from the Studio's own origin. The anatomy under test is the text spans.
 *
 *  `delivery: expressive` so the salience budget does not decide whether a person is named at
 *  all: under the default `restrained`, a roster (no figures, no emphasis) spends its one move
 *  on the headline. What is under test is WHERE the ink lands on a person, not whether the
 *  budget reaches one; the budget has its own spec, present-delivery.spec.ts. */
const ROSTER = `---
marp: true
delivery: expressive
---

<!-- _class: team-profile -->

## The people on this program.

- Ada Okafor
  - \`Executive Sponsor\`
  - Clears blockers above the program.
- Marcus Vale
  - \`Program Director\`
  - Runs the weekly cadence.
- Priya Raman
  - \`Head of Delivery\`
  - Staffs the pods; holds the dates.
`;

test('the Guide inks a person’s NAME, not the card around it', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, ROSTER);

	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(page.locator('.vetrina-cursor')).toHaveCount(1);

	const card = dialog.locator('[aria-label="Presented slide"] iframe.live');
	await expect(card).toBeVisible();

	// The slide has to have RENDERED the anatomy before the oracle means anything — a frame
	// still painting reports no `.person`, and "no ink on a name" would then pass for the wrong
	// reason. Asserted, not waited out.
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					const f = document.querySelector('[role="dialog"] [aria-label="Presented slide"] iframe.live') as HTMLIFrameElement | null;
					return f?.contentDocument?.querySelectorAll('.person .person-name').length ?? 0;
				}),
			{ timeout: 30_000 },
		)
		.toBeGreaterThan(0);

	// WATCH THE INK, don't sample it. Vetrina's strokes self-dispose, so an interval poll lands
	// between them; the observer records each node as it is inserted and the reader measures
	// whatever is still alive. This is the showcase spec's own arrangement, for its own reason.
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

	// THE ORACLE: some stroke lands on a name span, and no stroke wraps the card.
	//
	// Both halves matter and they fail differently. Ink ON the name is the declaration doing its
	// job. Ink NOT around the card is the defect the declaration removes — before it, the whole
	// `<li class="person">` was the handle, so `bracket` drew a second boundary around a bordered
	// card. Checking only the first would pass on a build that inked both.
	const seen = await page.evaluate(async () => {
		const w = window as unknown as { __ink: { kind: string; box: DOMRect }[] };
		const onName: string[] = [];
		const roundCard: string[] = [];
		// WATCH THE WHOLE WINDOW, not up to the first hit. Stopping at the first stroke that lands on
		// a name checks the second assertion over a PREFIX of the presentation only: a build that
		// inks Ada's name and then brackets Marcus's whole card would pass. An independent check
		// caught that; the loop now runs the full window and both tallies see every stroke.
		const deadline = Date.now() + 60_000;
		const overlaps = (a: DOMRect, b: { l: number; t: number; r: number; b: number }) => a.left < b.r && a.right > b.l && a.top < b.b && a.bottom > b.t;
		while (Date.now() < deadline) {
			const frame = document.querySelector('[role="dialog"] [aria-label="Presented slide"] iframe.live') as HTMLIFrameElement | null;
			const doc = frame?.contentDocument;
			if (frame && doc) {
				const fr = frame.getBoundingClientRect();
				// The preview is SCALED: the frame's `offsetWidth` is the deck's own width and its
				// rect is what it is shown at, so their ratio maps an inner rect out to the stage
				// the ink is drawn on. Comparing raw inner rects to stage rects finds no overlap
				// ever, which is the mistake the guide spec records making once.
				const S = frame.offsetWidth ? fr.width / frame.offsetWidth : 1;
				const out = (r: DOMRect) => ({ l: fr.left + r.left * S, t: fr.top + r.top * S, r: fr.left + (r.left + r.width) * S, b: fr.top + (r.top + r.height) * S });
				for (const { kind, box } of w.__ink) {
					if (!box.width || !box.height) continue;
					for (const person of doc.querySelectorAll('.person')) {
						const name = person.querySelector('.person-name');
						if (!name) continue;
						const nb = out(name.getBoundingClientRect());
						const pb = out(person.getBoundingClientRect());
						const label = `${kind} "${(name.textContent ?? '').trim()}"`;
						// ON THE NAME: overlapping the name's box and no wider than it plus the
						// stroke's own overhang. An `underline` runs the width of what it names, so
						// a generous but bounded multiple is the honest bound — the card is several
						// times wider, which is what this has to tell apart.
						if (overlaps(box, nb) && box.width <= (nb.r - nb.l) * 1.6) onName.push(label);
						// ROUND THE CARD: as wide as the card itself. That is the whole-container
						// handle, whatever verb drew it. Tallied INDEPENDENTLY of the first test — as an
						// `else if` a stroke counted on a name was never checked for wrapping, so the
						// two conditions could never both be reported for the same stroke.
						if (overlaps(box, pb) && box.width >= (pb.r - pb.l) * 0.9) roundCard.push(label);
					}
				}
			}
			await new Promise((r) => setTimeout(r, 120));
		}
		return { onName: [...new Set(onName)], roundCard: [...new Set(roundCard)] };
	});

	expect(
		seen.onName.length,
		'no Guide stroke ever landed on a `.person-name` — the declared handle did not reach the real surface',
	).toBeGreaterThan(0);
	expect(seen.roundCard, `a Guide stroke wrapped the whole person card: ${seen.roundCard.join(' · ')}`).toEqual([]);
});
