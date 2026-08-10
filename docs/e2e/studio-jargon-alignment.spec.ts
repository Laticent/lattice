// RAIL SELECTION vs WHAT THE PREVIEW SHOWS, on the real reported deck.
//
// Reported: "the slide I am previewing via the preview slide selection is not the slide text that is
// in full view in the editor. I feel like the count or something is off." That is an INDEX/COUNT
// misalignment, not staleness — and `examples/gallery-jargon.md` is the deck it was seen on. It sets
// `paginate: true` and a running `header:`, so the deck-context gate renders the WHOLE deck and
// narrows by index, which is exactly the path where an index can name the wrong section.
//
// The deck is not perturbed with markers: each slide is identified by its OWN first heading, read out
// of the source, so nothing about the deck's layout or splitting changes to accommodate the test.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fenceRanges } from '../src/components/studio/slide-directives';
import { expect, gotoStudio, livePreview, railButtons, setEditorContent, test } from './studio-fixture';

// These specs are ES modules, so `__dirname` does not exist.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DECK = fs.readFileSync(path.join(HERE, '../../examples/gallery-jargon.md'), 'utf8');

/** `splitSlides` from docs/src/components/studio/lint.ts, replicated so the test cannot drift from a
 *  local import path — same regex, same fence masking, same drop-empties behavior. */
function splitSlides(src: string): string[] {
	const fences = fenceRanges(src);
	const inFence = (i: number) => fences.some(([a, b]) => i >= a && i < b);
	const re = /\n-{3,}\n/g;
	const out: string[] = [];
	let pos = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(src))) {
		if (inFence(m.index + 1)) continue;
		out.push(src.slice(pos, m.index));
		pos = m.index + m[0].length;
	}
	out.push(src.slice(pos));
	return out.map((s) => s.trim()).filter(Boolean);
}
const stripFm = (s: string) => s.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, '');

/** The first heading text of a slide, as the reader would see it. */
function headingOf(slide: string): string | null {
	const m = slide.match(/^#{1,3}[ \t]+(.+?)[ \t]*$/m);
	if (!m) return null;
	// Strip inline markup and the authored trailing period the engine normalizes.
	return m[1].replace(/[*`_[\]]/g, '').replace(/\.$/, '').trim() || null;
}

test('jargon deck: every rail selection previews THAT slide', async ({ page }) => {
	test.setTimeout(600_000);
	const authored = splitSlides(stripFm(DECK));
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	// The rail count IS the Studio's slide count. If it disagrees with the splitter the test
	// replicates, that alone is the "count is off" the report describes — so assert it explicitly
	// rather than adapting to whatever the UI says.
	await expect
		.poll(() => railButtons(page).count(), { timeout: 60_000 })
		.toBe(authored.length);

	const wrong: string[] = [];
	for (let i = 0; i < authored.length; i++) {
		const want = headingOf(authored[i]);
		if (!want) continue; // a slide with no heading cannot be identified this way
		await railButtons(page).nth(i).click();
		try {
			await expect
				.poll(async () => (await livePreview(page).locator('.lattice section').first().innerText()).replace(/\s+/g, ' '), { timeout: 8_000 })
				.toContain(want);
		} catch {
			const got = (await livePreview(page).locator('.lattice section').first().innerText()).replace(/\s+/g, ' ').slice(0, 90);
			wrong.push(`rail ${i + 1}/${authored.length}: expected ${JSON.stringify(want)}, preview showed ${JSON.stringify(got)}`);
		}
	}
	expect(wrong, `${wrong.length} of ${authored.length} rail selections previewed the wrong slide:\n${wrong.join('\n')}`).toEqual([]);
});

/** The line `revealSlide` scrolls to: a slide's first line of actual CONTENT. Mirrors
 *  `slideEditableOffset` in docs/src/components/studio/lint.ts — skip blank lines and lone directive
 *  comments (`<!-- _class: … -->` and siblings), fall back to the slide's first line when a slide is
 *  nothing but directives. Replicated rather than imported for the same reason `splitSlides` is: the
 *  test states the contract independently of the module it is checking. */
function editableLineOf(slide: string): string {
	const isDirective = (l: string) => /^<!--(?:(?!-->).)*-->$/.test(l);
	const lines = slide.split('\n').map((l) => l.trim());
	return lines.find((l) => l && !isDirective(l)) ?? lines[0];
}

// THE REPORTED PAIR: rail selection vs what the EDITOR frames. The test above checks rail→preview,
// which was already correct; the report was that the editor shows a DIFFERENT slide than the one
// selected. `slideStartOffset` counted the front matter's closing `---` as separator #0, so
// `revealSlide(k)` framed slide k-1 on every deck with front matter.
test('jargon deck: the editor frames the slide the rail selected', async ({ page }) => {
	test.setTimeout(600_000);
	const authored = splitSlides(stripFm(DECK));
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 60_000 }).toBe(authored.length);

	const wrong: string[] = [];
	// PRECISION MATTERS HERE, and two weaker signals were tried and thrown away before any of this. The
	// DOM selection came back empty (a rail click moves focus off the editor). "Slide i's first line is
	// in the rendered DOM" PASSED with the bug reintroduced, because CodeMirror builds a margin of lines
	// around the viewport — a one-slide error still leaves the target line in the DOM. So this measures
	// the SCROLL POSITION, against the contract `revealSlide` ACTUALLY implements:
	//
	//   `v.dispatch({ effects: EditorView.scrollIntoView(caret, { y: 'start', yMargin: 8 }) })`
	//   where `caret = slideEditableOffset(doc, index)`
	//
	// — TOP-ANCHOR the slide's first editable line, which is the line after its `<!-- _class: … -->`
	// directive. So the discriminating measurement is that line's distance from the TOP of the
	// scroller: 0 (± the 8px margin and sub-pixel rounding) when slide i is framed, and a whole slide
	// away (≥ ~150px; the deck's slides are 6–16 lines at ~26px) under an off-by-one. Measured on a
	// real run, all eight sampled rails land it at +5px.
	//
	// THIS ASSERTION WAS REWRITTEN, and the old one is why (#1315). It read "the editor's vertical
	// center falls inside slide i", which was correct for the reveal of the day — `scrollIntoView` over
	// the whole slide RANGE with `y: 'center'`. #1301 deliberately replaced that with the top-anchored
	// editable line (centering leaves the previous slide's tail above the one you picked, and how much
	// of it you see depends on how long that slide happens to be), and did not update this spec. It has
	// been failing 7 of 8 rails on main ever since — on a suite that is NIGHTLY, off the PR gate — while
	// the behavior it guards was correct the whole time. A guard pinned to a superseded contract reports
	// nothing about the contract that replaced it.
	//
	// A sample across the deck rather than all 58: each step scrolls and measures. Index 0 and the last
	// slide are in deliberately — 0 is the front-matter case, and the last is the one CodeMirror could
	// not clamp-free center under the old contract. Both top-anchor cleanly here, because `scrollPastEnd`
	// gives the scroller enough slack to bring the final line to the top.
	const indices = [0, 1, 2, 3, 7, 20, 40, authored.length - 1];
	// Matching a rendered line by its TEXT is only sound while that text is unique in the document —
	// otherwise a duplicate elsewhere could stand in for the line under test. Assert it rather than
	// assume it, so editing the deck surfaces here instead of silently weakening the measurement.
	const docLines = DECK.split('\n').map((l) => l.trim());
	for (const i of indices) {
		const t = editableLineOf(authored[i]);
		expect(docLines.filter((l) => l === t).length, `sampled slide ${i}'s first editable line ${JSON.stringify(t)} is not unique in the deck, so it cannot identify a rendered line`).toBe(1);
	}
	const TOLERANCE = 40; // ~1.5 lines: absorbs yMargin + rounding, far under one slide
	const measure = (text: string) =>
		page.evaluate(
			({ text }: { text: string }) => {
				const scroller = document.querySelector('.cm-scroller');
				if (!scroller) return null;
				const s = scroller.getBoundingClientRect();
				const lines = [...scroller.querySelectorAll('.cm-line')];
				const el = lines.find((l) => (l.textContent ?? '').trim() === text);
				// What IS at the top right now — an off-by-one names the slide it framed instead. Skip
				// blank lines: the line above a slide's first content is usually its directive's blank
				// neighbor, and reporting "" tells the reader nothing.
				const atTopEl = lines.find((l) => l.getBoundingClientRect().bottom > s.top + 1 && (l.textContent ?? '').trim());
				const atTopText = (atTopEl?.textContent ?? '').trim().slice(0, 60);
				if (!el) return { found: false, offset: 0, atTopText };
				return { found: true, offset: Math.round(el.getBoundingClientRect().top - s.top), atTopText };
			},
			{ text },
		);
	for (const i of indices) {
		await railButtons(page).nth(i).click();
		const want = editableLineOf(authored[i]);
		// POLL to the settled state rather than sleeping a guessed interval. The scroll is a synchronous
		// CodeMirror dispatch, so this normally converges on the first read and costs nothing — but a
		// fixed wait is a bet that a loaded CI box finishes in the time the author guessed, and losing
		// that bet reads as a real failure. Bounded so a genuinely wrong position still reports: the loop
		// exits on the deadline with the LAST measurement, which the assertions below then judge.
		//
		// Safe to poll to success here — unlike the settle in the caret→preview test below — because the
		// state being measured is the one this click is supposed to produce, not a state that was already
		// correct before the click. There is no window in which a stale-but-passing reading can be
		// mistaken for the click's effect.
		const deadline = Date.now() + 5_000;
		let m = await measure(want);
		while ((!m?.found || Math.abs(m.offset) > TOLERANCE) && Date.now() < deadline) {
			await page.waitForTimeout(100);
			m = await measure(want);
		}
		if (!m) {
			wrong.push(`rail ${i}: no editor scroller found`);
		} else if (!m.found) {
			wrong.push(`rail ${i}: slide ${i}'s first editable line ${JSON.stringify(want)} is not rendered at all`);
		} else if (Math.abs(m.offset) > TOLERANCE) {
			wrong.push(
				`rail ${i}: slide ${i}'s first editable line ${JSON.stringify(want)} sits ${m.offset}px from the top of the editor (want 0 ±${TOLERANCE}) — a different slide is framed; the line at the top is ${JSON.stringify(m.atTopText)}`,
			);
		}
	}
	expect(wrong, `the editor framed the wrong slide:\n${wrong.join('\n')}`).toEqual([]);
});

// THE OTHER DIRECTION, and the one the report named FIRST: "the slide I am editing is not the slide
// displayed in the preview." Moving the caret drives the shown slide — Editor.tsx feeds
// `slideIndexAt(doc, selection.head)` to `onCursorSlide`, which sets the active slide. The fix to
// `slideIndexAt` is unit-covered, but the property a human checks is this one: click into a slide's
// text and the preview must show THAT slide.
test('jargon deck: clicking into a slide previews THAT slide', async ({ page }) => {
	test.setTimeout(600_000);
	const authored = splitSlides(stripFm(DECK));
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 60_000 }).toBe(authored.length);

	const wrong: string[] = [];
	for (const i of [1, 2, 3, 7, 20, 40, authored.length - 1]) {
		const want = headingOf(authored[i]);
		if (!want) continue;
		// Reveal the slide first so its lines are built, then CLICK one of its own lines — the caret
		// move is what has to drive the preview, so it must come from a real click, not from the rail
		// selection that revealed it. Clicking the slide's LAST line (not its first) also guards the
		// boundary: an off-by-one at the chunk edge would map it to the next slide.
		await railButtons(page).nth(i).click();
		const ownLines = authored[i].split('\n').map((l) => l.trim()).filter((l) => l.length > 8);
		const target = ownLines[ownLines.length - 1];
		const line = page.locator('.cm-line', { hasText: target }).first();
		// Wait for the SIGNAL (the reveal built this slide's lines) instead of a guessed interval. A line
		// that never appears was virtualized away — the timeout is this loop's SKIP condition, not a
		// failure, which is why it is caught rather than allowed to fail the test.
		try {
			await expect.poll(() => line.count(), { timeout: 5_000 }).toBeGreaterThan(0);
		} catch {
			continue; // line not built (virtualized away) — skip rather than fake it
		}
		await line.click();
		// THIS SETTLE IS LOAD-BEARING — do not replace it with a poll, and do not delete it. The rail
		// click above ALREADY put the preview on slide i — that is not a guess, it is exactly what the
		// FIRST test in this file proves — so the assertion below is true before the line click does
		// anything. Polling it would pass instantly against that stale-but-correct state and never see
		// the click's effect at all. What an off-by-one does here is MOVE the preview to slide i+1
		// shortly after the click, so the test's power comes from reading the preview only AFTER the
		// click has had time to land. There is no positive signal to poll for; "no change" is the pass,
		// and a poll cannot distinguish "no change" from "not yet changed".
		await page.waitForTimeout(400);
		try {
			await expect
				.poll(async () => (await livePreview(page).locator('.lattice section').first().innerText()).replace(/\s+/g, ' '), { timeout: 8_000 })
				.toContain(want);
		} catch {
			const got = (await livePreview(page).locator('.lattice section').first().innerText()).replace(/\s+/g, ' ').slice(0, 90);
			wrong.push(`clicked into slide ${i} (line ${JSON.stringify(target.slice(0, 40))}): preview showed ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
		}
	}
	expect(wrong, `the preview showed a different slide than the one being edited:\n${wrong.join('\n')}`).toEqual([]);
});
