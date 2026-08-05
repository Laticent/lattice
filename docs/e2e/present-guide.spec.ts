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
	await gotoStudio(page);
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
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();

	const card = dialog.locator('iframe.live');
	await expect(card).toBeVisible();
	const frame = await card.boundingBox();
	expect(frame, 'no slide frame to point into').not.toBeNull();

	// "Is the cursor inside the slide" is NOT sufficient, and getting that wrong would have made
	// this spec worthless: the cursor spawns at the center of the screen, and in Present the
	// slide card IS the center of the screen. A cursor that never moved at all would have passed.
	//
	// So the oracle is MOVEMENT ONTO TARGETS: sample where the cursor sits as cues advance, and
	// require at least two DISTINCT resting positions, each of them inside the slide frame, and
	// each away from the spawn point. A stage that resolved nothing leaves the cursor at spawn
	// forever; a stage that resolved the wrong space leaves it off the slide.
	const spawn = { x: 1440 / 2, y: 900 * 0.42 };
	const seen: { x: number; y: number }[] = [];
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline && seen.length < 2) {
		const box = await page.locator(CURSOR).boundingBox();
		if (box && frame) {
			const p = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
			const onSlide = p.x >= frame.x && p.x <= frame.x + frame.width && p.y >= frame.y && p.y <= frame.y + frame.height;
			const movedFromSpawn = Math.hypot(p.x - spawn.x, p.y - spawn.y) > 40;
			const isNew = !seen.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 24);
			if (onSlide && movedFromSpawn && isNew) seen.push(p);
		}
		await page.waitForTimeout(120);
	}
	expect(seen.length, `the Guide cursor never settled on two distinct places inside the slide (saw ${JSON.stringify(seen)}) — it either resolved no target or resolved the wrong coordinate space`).toBeGreaterThanOrEqual(2);

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
	// So a hit counts only once the cursor has held the same position for `STILL` samples.
	//
	// Scoped to the DIALOG. There are two `iframe.live` on this page — the editor's live preview
	// and Present's slide card — and `document.querySelector` returns the editor's, which is
	// behind the overlay. Measuring Present's cursor against the editor's frame finds no overlap
	// ever: the first version of this check passed against the defect, twice.
	const resting = await page.evaluate(async () => {
		const STILL = 5; // ~500ms of not moving. A glide never holds a position that long.
		const hits: string[] = [];
		let last = '';
		let held = 0;
		const deadline = Date.now() + 30_000;
		while (Date.now() < deadline) {
			const cur = document.querySelector('.vetrina-cursor');
			const frame = document.querySelector('[role="dialog"] iframe.live') as HTMLIFrameElement | null;
			const doc = frame?.contentDocument;
			if (cur && frame && doc && getComputedStyle(cur).opacity !== '0') {
				const c = cur.getBoundingClientRect();
				const key = `${Math.round(c.left)},${Math.round(c.top)}`;
				held = key === last ? held + 1 : 0;
				last = key;
				if (held === STILL) {
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
							if (c.left < b.r && c.right > b.l && c.top < b.b && c.bottom > b.t) hits.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 36)}"`);
						}
					}
				}
			} else {
				held = 0;
				last = '';
			}
			await new Promise((r) => setTimeout(r, 100));
		}
		return [...new Set(hits)];
	});
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
	// that would otherwise hide it, so this cannot pass by simply being sampled too early.
	await page.waitForTimeout(5_000);
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

const SLIDE_WITH_ONE_PARAGRAPH = [
	'---',
	'marp: true',
	'theme: indaco',
	'---',
	'',
	'## The quarter in one paragraph',
	'',
	'Growth held across every region. Spend stayed disciplined through the second half. The quarter landed on plan with room to spare. Nothing in the pipeline moved against us.',
	'',
].join('\n');

/** Watch the stage for cue ink and report what was drawn, for `ms`.
 *
 *  Each node is timestamped, because ONE gesture adds several nodes: a `wash` paints one band per
 *  line, a `tap` spawns two or three rings. Grouping by ARRIVAL — nodes further apart than any
 *  single gesture's own paint burst belong to different gestures — is the only grouping that can
 *  separate "one gesture on a block" from "one gesture per sentence of it". Grouping by KIND
 *  cannot: a paragraph's four sentences all classify the same way, so a per-sentence regression
 *  emits four consecutive `wash` entries and collapses to one. That is exactly what the first
 *  version of this oracle did, and it is why it could not fail for the reason it was written. */
async function watchCues(page: import('@playwright/test').Page, ms: number) {
	return page.evaluate(async (duration) => {
		const seen: string[] = [];
		const at: number[] = [];
		const t0 = Date.now();
		if (!document.querySelector('.vetrina-stage')) return { seen, at, error: 'no stage' };
		// OBSERVE THE DOCUMENT, not the stage node found right now. The stage is torn down and
		// rebuilt whenever Guide's own effect re-runs, and an observer holding the OLD node then
		// watches a detached element for the rest of the window — it reports a clean empty list
		// and the spec fails (or worse, passes) for a reason that has nothing to do with the
		// gestures. Watching the document for `data-vt-cue` cannot go stale.
		const obs = new MutationObserver((records) => {
			for (const r of records) {
				for (const n of r.addedNodes) {
					const cue = (n as HTMLElement).dataset?.vtCue;
					if (cue) {
						seen.push(cue);
						at.push(Date.now() - t0);
					}
				}
			}
		});
		obs.observe(document.body, { childList: true, subtree: true });
		await new Promise((r) => setTimeout(r, duration));
		obs.disconnect();
		return { seen, at, error: '' };
	}, ms);
}

test('one gesture per BLOCK, not one per sentence', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, SLIDE_WITH_ONE_PARAGRAPH);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(page.locator(CURSOR)).toHaveCount(1);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();

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
	const { seen, at, error } = await watchCues(page, 22_000);
	expect(error).toBe('');
	expect(seen.length, `no cue ink was drawn at all — the gesture never ran (saw ${JSON.stringify(seen)})`).toBeGreaterThan(0);
	// A gesture paints its nodes together; the next one is a sentence away. 400ms is well above any
	// single gesture's paint burst (a wash staggers its bands by 120ms) and well below the shortest
	// sentence, so it separates gestures without splitting one.
	const bursts = at.filter((t, i) => i === 0 || t - at[i - 1] > 400).length;
	expect(bursts, `the hand gestured once per SENTENCE, not once per block: ${JSON.stringify(seen.map((k, i) => `${k}@${at[i]}`))}`).toBeLessThanOrEqual(2);
});

test('the vocabulary varies with the shape of what is named', async ({ page }) => {
	// Motivated variety is the whole design: a rule set that answers `underline` to everything is
	// a karaoke follower with extra steps. Three deliberately different shapes on three slides —
	// a paragraph read whole, a compact stat, and a phrase inside a longer paragraph.
	await gotoStudio(page);
	await setEditorContent(
		page,
		[
			'---',
			'marp: true',
			'theme: indaco',
			'---',
			'',
			'## Margins expanded across every region this year and the next',
			'',
			'Margins expanded across every region this year and the next, and the pipeline held its shape through the whole of the second half.',
			'',
			'---',
			'',
			'<!-- _class: statement -->',
			'',
			'## Growth held.',
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
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();

	const { seen, error } = await watchCues(page, 45_000);
	expect(error).toBe('');
	expect(seen.length, 'no cue ink at all across three slides').toBeGreaterThan(0);
	// THE DECK MUST HAVE MOVED. Without this the spec is satisfied by slide 1 alone (its heading and
	// its paragraph are already two shapes), so "three deliberately different shapes on three
	// slides" would be a claim the oracle never checks.
	await expect(dialog.getByText('3 / 3')).toBeVisible();
	expect(new Set(seen).size, `only one gesture across three different shapes — the classifier is not discriminating: ${JSON.stringify([...new Set(seen)])}`).toBeGreaterThanOrEqual(2);
});
