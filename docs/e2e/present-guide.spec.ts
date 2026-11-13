import { FRAME_MS, pauseFrames, stepFrame } from './frame-clock';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE GUIDE RUNG on the real Present surface (#1397).
//
// Guide points a Vetrina cursor at the part of the slide currently being narrated. Everything
// about it that can be wrong is a coordinate or a clock, and neither survives a unit test:
// jsdom has no layout, so the cursor's position there is whatever the test stubs, and the
// "one conductor" property is about a real reader driving a real cursor. HARD RULE #23.
//
// No key and no voice are needed. The reader's cue clock runs on the silent rung exactly as it
// does on a narrated one — the same reason the beat spec can measure a hold without audio.

test.describe.configure({ timeout: 180_000 });

const CURSOR = '.vetrina-cursor';

test('Guide points the cursor INTO the slide, and stops when it is switched off', async ({ page }) => {
	// On a fake clock, stepped one frame at a time from Play (frame-clock.ts): "held still for half a second" and "two
	// places within the reading" are then virtual time, the same on a loaded runner as an idle one (HARD RULE #32).
	await page.clock.install();
	await gotoStudio(page);
	// Expressive: its top moment still draws ink and shows the hand; restrained and somber spark
	// the element instead and show no cursor at all (present-delivery.spec.ts).
	await setEditorContent(page, SLIDE_WITH_ONE_PARAGRAPH);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();

	// Off by default — a delivery flourish should not surprise a presenter.
	await expect(page.locator(CURSOR)).toHaveCount(0);

	const guide = dialog.getByRole('button', { name: /^Guide (on|off)/ });
	await guide.click();
	await expect(page.locator(CURSOR)).toHaveCount(1);

	// Drive the narration. The cursor must land ON the slide card — the whole feature is
	// pointing INSIDE an iframe from a stage that never enters one, so a cursor that stays at
	// its spawn point (screen center) means the cross-frame mapping produced nothing.
	const card = dialog.locator('[aria-label="Presented slide"] iframe.live');
	await expect(card).toBeVisible();
	const frame = await card.boundingBox();
	expect(frame, 'no slide frame to point into').not.toBeNull();

	// "Is the cursor inside the slide" is NOT sufficient, and getting that wrong would have made
	// this spec worthless: the cursor spawns at the center of the screen, and in Present the
	// slide card IS the center of the screen. A cursor that never moved at all would have passed.
	//
	// So the oracle is where the cursor COMES TO REST: on every frame of the reading, watch it, and
	// each time it has held one position for `STILL` frames while visible, record that rest. There
	// must be at least one, and every one must sit inside the slide frame and away from the spawn
	// point. A stage that resolved nothing leaves the cursor at spawn forever; a stage that resolved
	// the wrong space rests it off the slide.
	//
	// (This used to ask for "two distinct places", sampled every 120 ms with no regard to whether
	// the cursor was showing. On this deck the hand glides in while still hidden and then rests,
	// visibly, in ONE place for the whole paragraph (a per-frame trace, 2026-11-12), so the second
	// "place" was always a frame of the hidden glide. A rest is the claim the comment above makes.)
	//
	// THE POINTER MUST NEVER COME TO REST ON THE TEXT IT IS READING — real frame, real layout.
	//
	// Guide shipped aiming INSIDE the matched block (Vetrina's `aimAt`: right for a walkthrough
	// pointing at a button, because that is where a click lands; wrong for a sentence, where the
	// arrow tip lands mid-first-line and its 28px body covers the opening words).
	//
	// AT REST, not at any instant, and that distinction is the whole design of this oracle. A
	// pointer that moves has to cross whatever lies between where it was and where it is going —
	// failing on a transit frame would be failing on physics, the same mistake the geometry spec
	// made first. What is a defect is SETTLING there: sitting on the words while they are read.
	// So a hit counts only once the cursor has held the same position for `STILL` frames.
	//
	// Scoped to the PRESENTED SLIDE, not to the dialog and certainly not to the document.
	// `document.querySelector('iframe.live')` returns the EDITOR's preview, which is behind the
	// overlay — measuring Present's cursor against that frame finds no overlap ever, and the
	// first version of this check passed against the defect twice. A dialog-scoped query is no
	// longer enough either: the console's own panel carries a second `iframe.live` for the next
	// slide (2026-08-24-stage-console-split.md), so only the slide card's own label is unambiguous.
	await pauseFrames(page);
	await page.evaluate(
		({ box, spawn, STILL }) => {
			const w = window as unknown as { __guide: { rests: { x: number; y: number; onSlide: boolean; awayFromSpawn: boolean }[]; hits: string[] } };
			const out = { rests: [] as { x: number; y: number; onSlide: boolean; awayFromSpawn: boolean }[], hits: [] as string[] };
			w.__guide = out;
			let last = '';
			let held = 0;
			const tick = () => {
				requestAnimationFrame(tick);
				const cur = document.querySelector('.vetrina-cursor');
				const frame = document.querySelector('[role="dialog"] [aria-label="Presented slide"] iframe.live') as HTMLIFrameElement | null;
				const doc = frame?.contentDocument;
				if (!cur || !frame || !doc || getComputedStyle(cur).opacity === '0') {
					held = 0;
					last = '';
					return;
				}
				const c = cur.getBoundingClientRect();
				const key = `${Math.round(c.left)},${Math.round(c.top)}`;
				held = key === last ? held + 1 : 0;
				last = key;
				if (held !== STILL) return;
				const p = { x: Math.round(c.left + c.width / 2), y: Math.round(c.top + c.height / 2) };
				out.rests.push({
					...p,
					onSlide: p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height,
					awayFromSpawn: Math.hypot(p.x - spawn.x, p.y - spawn.y) > 40,
				});
				const fr = frame.getBoundingClientRect();
				const S = frame.offsetWidth ? fr.width / frame.offsetWidth : 1;
				for (const el of doc.querySelectorAll('p, li, h1, h2, h3, h4, td, th, blockquote, code')) {
					if (!(el.textContent ?? '').trim()) continue;
					// THE WORDS, NOT THE BOX AROUND THEM. A card is mostly padding and a timeline
					// stage is mostly the gap above its label; the promise this spec exists to
					// hold is that the pointer never covers the TEXT it is asking you to read,
					// and the product's own do-not-cover check is against line boxes for exactly
					// that reason. Checking element boxes flagged a cursor standing in a card's
					// margin — the one place a presenter's hand actually goes.
					const r = doc.createRange();
					r.selectNodeContents(el);
					for (const t of Array.from(r.getClientRects())) {
						if (!t.width || !t.height) continue;
						const b = { l: fr.left + t.left * S, t: fr.top + t.top * S, r: fr.left + (t.left + t.width) * S, b: fr.top + (t.top + t.height) * S };
						if (c.left < b.r && c.right > b.l && c.top < b.b && c.bottom > b.t) out.hits.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 36)}"`);
					}
				}
			};
			requestAnimationFrame(tick);
		},
		// 30 frames is ~500 ms of not moving: a glide never holds a position that long.
		{ box: frame as { x: number; y: number; width: number; height: number }, spawn: { x: 1440 / 2, y: 900 * 0.42 }, STILL: 30 },
	);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	// The whole reading, plus room: 45 s of virtual time. The paragraph slide reads in well under that.
	for (let i = 0; i < Math.ceil(45_000 / FRAME_MS); i++) await stepFrame(page);
	await page.clock.resume();
	const { rests, hits } = await page.evaluate(() => (window as unknown as { __guide: { rests: { x: number; y: number; onSlide: boolean; awayFromSpawn: boolean }[]; hits: string[] } }).__guide);
	const resting = [...new Set(hits)];
	expect(rests.length, 'the Guide cursor never came to rest anywhere visible — it resolved no target').toBeGreaterThanOrEqual(1);
	expect(rests.filter((r) => !r.onSlide || !r.awayFromSpawn), `the Guide cursor rested off the slide or at its spawn point (rests ${JSON.stringify(rests)}) — it resolved the wrong coordinate space, or nothing`).toEqual([]);

	expect(resting, `the Guide cursor SETTLED on slide text — it covers what it is asking you to read: ${resting.join(' · ')}`).toEqual([]);

	// Switching Guide off tears the stage down; the real pointer is never left hidden.
	await guide.click();
	await expect(page.locator(CURSOR)).toHaveCount(0);
	await expect.poll(async () => page.evaluate(() => getComputedStyle(document.querySelector('.lx-ui.fixed.inset-0.z-\\[100\\]') as Element).cursor)).not.toBe('none');
});

const backdropCursor = (page: import('@playwright/test').Page) =>
	page.evaluate(() => getComputedStyle(document.querySelector('.lx-ui.fixed.inset-0.z-\\[100\\]') as Element).cursor);

test('the real pointer hides only over the slide, never over the dock', async ({ page }) => {
	await gotoStudio(page);
	// Expressive: its top moment still draws ink and shows the hand; restrained and somber spark
	// the element instead and show no cursor at all (present-delivery.spec.ts).
	await setEditorContent(page, SLIDE_WITH_ONE_PARAGRAPH);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	// Playback, because the pointer is only taken away while Guide is actually AIMING at
	// something. Turning Guide on is not enough and must not be — see the next spec.
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();

	// After a few seconds of stillness the backdrop hides the pointer…
	await expect.poll(() => backdropCursor(page), { timeout: 20_000 }).toBe('none');

	// …but the dock NEVER does. You must always be able to find and click Pause; a presenter
	// hunting an invisible cursor over the transport is the failure this rule exists to prevent.
	const transport = dialog.getByRole('button', { name: /^(Pause|Play the presentation)$/ });
	expect(await transport.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('none');

	// And it comes back INSTANTLY on any movement — before anything else happens.
	await page.mouse.move(400, 300);
	await expect.poll(() => backdropCursor(page), { timeout: 2_000 }).not.toBe('none');
});

// A slide narrated ENTIRELY by a speaker note says things the slide does not show, so Guide has
// nothing to point at. What it used to do then was the worst of both: return early, leaving the
// cursor parked on the previous sentence's target — a confident arrow resting on an unrelated
// line — while the real pointer stayed hidden. The viewer had one pointer, and it was lying.
//
// The two halves have to fail together: no target means the fake cursor goes away AND the real
// one comes back. That is the invariant this drives on the real surface.
test('with nothing on the slide to point at, the cursor hides and the real pointer returns', async ({ page }) => {
	await page.clock.install();
	await gotoStudio(page);
	await setEditorContent(
		page,
		[
			'---',
			'marp: true',
			'theme: indaco',
			'---',
			'',
			'<!-- _class: statement -->',
			'',
			'## Margins expanded across every region.',
			'',
			'<!-- note: The commentary for this slide lives only in the speaker notes and appears nowhere on the slide itself. -->',
			'',
		].join('\n'),
	);

	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(page.locator(CURSOR)).toHaveCount(1);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();

	// The narration is the note; nothing on the slide contains it. The cursor must go invisible.
	await expect
		.poll(() => page.locator(CURSOR).evaluate((el) => getComputedStyle(el).opacity), {
			timeout: 30_000,
			message: 'the Guide cursor stayed visible on a slide it could not aim at — it is parked on nothing, claiming something',
		})
		.toBe('0');

	// …and having hidden it, the real pointer may NOT be taken away. Held across the idle timer
	// that would otherwise hide it (PresentOverlay's 3 s), so this cannot pass by simply being
	// sampled too early: the clock is stopped and stepped past the timer, so it has fired.
	await pauseFrames(page);
	for (let i = 0; i < Math.ceil(4_000 / FRAME_MS); i++) await stepFrame(page);
	expect(await backdropCursor(page), 'the real pointer was hidden while Guide had nothing to point at — the viewer has no pointer at all').not.toBe('none');
});

// ── THE GESTURE VOCABULARY (#1404) ──────────────────────────────────────────────────────────
//
// Two claims that only the real surface can settle, because both are about a real reader driving
// a real cursor over real layout: the CADENCE (one gesture per block, not per sentence) and the
// VARIETY (more than one verb, chosen by shape). jsdom can answer neither — it has no line boxes
// and no clock.
//
// The oracle counts INK, not cursor positions. A cue node carries `data-vt-cue` naming its
// gesture, so "how many gestures happened" and "which ones" are both directly observable, and
// neither depends on catching the cursor at an instant — the mistake the geometry spec and the
// beat spec each made once (assert on rest, never on a moment).

// `delivery: expressive` so the salience budget does not decide the count. Under the default
// `restrained` the paragraph (no figure, no emphasis) is cut by the preset's floor and only the
// heading gestures, at the first cue — before this oracle can attach. What is under test here is
// the CADENCE (per block, not per sentence); the budget has its own spec, present-delivery.spec.ts.
const SLIDE_WITH_ONE_PARAGRAPH = [
	'---',
	'marp: true',
	'theme: indaco',
	'delivery: expressive',
	'---',
	'',
	'## The quarter in one paragraph',
	'',
	'Growth held across every region. Spend stayed disciplined through the second half. The quarter landed on plan with room to spare. Nothing in the pipeline moved against us.',
	'',
].join('\n');

/** Start watching the stage for cue ink; the returned function reports what was drawn so far.
 *
 *  Each node is timestamped, because ONE gesture adds several nodes: a `wash` paints one band per
 *  line, a `tap` spawns two or three rings. Grouping by ARRIVAL — nodes further apart than any
 *  single gesture's own paint burst belong to different gestures — is the only grouping that can
 *  separate "one gesture on a block" from "one gesture per sentence of it". Grouping by KIND
 *  cannot: a paragraph's four sentences all classify the same way, so a per-sentence regression
 *  emits four consecutive `wash` entries and collapses to one. That is exactly what the first
 *  version of this oracle did, and it is why it could not fail for the reason it was written.
 *
 *  The specs that read the stamps run on a fake clock stepped one frame at a time (frame-clock.ts), so an arrival
 *  gap is virtual time: a loaded runner cannot stretch one gesture's burst into two. */
async function watchCues(page: import('@playwright/test').Page): Promise<() => Promise<{ seen: string[]; at: number[]; error: string }>> {
	const error = await page.evaluate(() => {
		const w = window as unknown as { __cues: { seen: string[]; at: number[] } };
		w.__cues = { seen: [], at: [] };
		if (!document.querySelector('.vetrina-stage')) return 'no stage';
		// OBSERVE THE DOCUMENT, not the stage node found right now. The stage is torn down and
		// rebuilt whenever Guide's own effect re-runs, and an observer holding the OLD node then
		// watches a detached element for the rest of the window — it reports a clean empty list
		// and the spec fails (or worse, passes) for a reason that has nothing to do with the
		// gestures. Watching the document for `data-vt-cue` cannot go stale.
		new MutationObserver((records) => {
			for (const r of records) {
				for (const n of r.addedNodes) {
					const cue = (n as HTMLElement).dataset?.vtCue;
					if (cue) {
						w.__cues.seen.push(cue);
						w.__cues.at.push(Date.now());
					}
				}
			}
		}).observe(document.body, { childList: true, subtree: true });
		return '';
	});
	return async () => ({ ...(await page.evaluate(() => (window as unknown as { __cues: { seen: string[]; at: number[] } }).__cues)), error });
}

test('one gesture per BLOCK, not one per sentence', async ({ page }) => {
	await page.clock.install();
	await gotoStudio(page);
	await setEditorContent(page, SLIDE_WITH_ONE_PARAGRAPH);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(page.locator(CURSOR)).toHaveCount(1);
	await pauseFrames(page);
	const cues = await watchCues(page);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	// 22 s of virtual reading: the heading and four sentences are read inside it.
	for (let i = 0; i < Math.ceil(22_000 / FRAME_MS); i++) await stepFrame(page);

	// FIVE cues, TWO blocks. The slide narrates its heading and then four sentences of one
	// paragraph, and the cadence under test is that the hand names each BLOCK once: a burst for
	// the heading, a burst for the paragraph, and NOTHING for the three sentences that follow
	// inside it. Per-sentence would be five bursts.
	//
	// The count is of BURSTS, not of nodes: a `wash` paints one band per line of the phrase, so
	// one gesture can add several nodes in the same tick. Consecutive nodes of the same kind
	// collapse back into the gesture that produced them.
	//
	// Two KINDS here is correct and was briefly asserted against — the heading is one wide line
	// (underline) and the paragraph is a phrase inside a block (wash). Asserting one kind was
	// asserting that two different shapes get the same verb, which is the opposite of the design.
	const { seen, at, error } = await cues();
	const t0 = at[0] ?? 0;
	expect(error).toBe('');
	expect(seen.length, `no cue ink was drawn at all — the gesture never ran (saw ${JSON.stringify(seen)})`).toBeGreaterThan(0);
	// A gesture paints its nodes together; the next one is a sentence away. 400ms is well above any
	// single gesture's paint burst (a wash staggers its bands by 120ms) and well below the shortest
	// sentence, so it separates gestures without splitting one.
	const bursts = at.filter((t, i) => i === 0 || t - at[i - 1] > 400).length;
	expect(bursts, `the hand gestured once per SENTENCE, not once per block: ${JSON.stringify(seen.map((k, i) => `${k}@${at[i] - t0}`))}`).toBeLessThanOrEqual(2);
});

test('the vocabulary varies with what is named: words are underlined, a chart\'s marks are not', async ({ page }) => {
	// Motivated variety is the whole design: a hand that answers `underline` to everything is a
	// karaoke follower with extra steps. WHAT VARIES CHANGED ON PURPOSE (guide storyboards,
	// engineering/decisions/2026-09-27-guide-storyboards.md §7, built 2026-09-28): expressive
	// underlines WORDS — a heading, a paragraph, a bullet, a row — and keeps its other strokes for
	// a chart's marks (a visit taps, a peak circles, a frame brackets the plot). This spec used to
	// ask three TEXT shapes for two verbs, which that decision retired; it now asks text and marks.
	await page.clock.install();
	await gotoStudio(page);
	await setEditorContent(
		page,
		[
			'---',
			'marp: true',
			'theme: indaco',
			// Expressive inks every act; the other presets spark the element instead.
			'delivery: expressive',
			'---',
			'',
			'## Margins expanded across every region this year and the next',
			'',
			'Margins expanded across every region this year and the next, and the pipeline held its shape through the whole of the second half.',
			'',
			'---',
			'',
			'<!-- _class: bar -->',
			'',
			'## Revenue by region',
			'',
			'- North `42`',
			'- South `30`',
			'- West `18`',
			'',
			'---',
			'',
			'Growth held across every region. Spend stayed disciplined. The quarter landed on plan.',
			'',
		].join('\n'),
	);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	// WAIT FOR THE STAGE. The observer attaches once the stage exists, and a first version of
	// this spec ran `page.evaluate` in the same tick as the click — before React had mounted it.
	// A silent sampler is worse than no sampler.
	await expect(page.locator(CURSOR)).toHaveCount(1);
	// START AT SLIDE 1, and this is the whole reason the first version of this spec failed.
	// `setEditorContent` leaves the editor on the LAST slide and Present opens where the editor
	// is, so a three-slide deck opened on slide three and never advanced — which reads exactly
	// like Guide stopping after one gesture. The failure was the oracle's, not the feature's.
	await dialog.getByRole('button', { name: 'Go to slide 1' }).click();
	await expect(dialog.getByText('1 / 3')).toBeVisible();
	await pauseFrames(page);
	const cues = await watchCues(page);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	// Step the reading until the deck reaches slide 3: by then slide 1's words and slide 2's chart have both been read.
	// 45 s of virtual time is the cap, far past three short slides.
	const lastSlide = dialog.getByText('3 / 3');
	for (let i = 0; i < Math.ceil(45_000 / FRAME_MS) && !(i % 30 === 0 && (await lastSlide.isVisible())); i++) await stepFrame(page);

	const { seen, error } = await cues();
	expect(error).toBe('');
	expect(seen.length, 'no cue ink at all across three slides').toBeGreaterThan(0);
	// THE DECK MUST HAVE MOVED: the chart is slide 2, so a spec that never left slide 1 could not
	// see a mark at all.
	await expect(dialog.getByText('3 / 3')).toBeVisible();
	const kinds = new Set(seen);
	expect(kinds.has('underline'), `no word was underlined: ${JSON.stringify([...kinds])}`).toBe(true);
	expect([...kinds].filter((k) => k !== 'underline').length, `the chart's marks got the words' stroke — the ink is not discriminating: ${JSON.stringify([...kinds])}`).toBeGreaterThanOrEqual(1);
});
