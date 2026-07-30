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
	// PRECISION MATTERS HERE, and two weaker signals were tried and thrown away. The DOM selection came
	// back empty (a rail click moves focus off the editor). "Slide i's first line is in the rendered
	// DOM" PASSED with the bug reintroduced, because CodeMirror builds a margin of lines around the
	// viewport — a one-slide error still leaves the target line in the DOM. So this measures the SCROLL
	// POSITION: `revealSlide` calls `scrollIntoView(..., { y: 'center' })`, so the selected slide's
	// first line must sit near the scroller's vertical center, and centering the slide before it puts
	// that line a whole slide (~10 lines) away — a difference this can actually see.
	//
	// A sample across the deck rather than all 58: each step scrolls and measures. Slide 0 and the last
	// slide are included deliberately (0 is the front-matter case) and handled below, since CodeMirror
	// clamps scrolling at the document edges and cannot center them.
	const indices = [0, 1, 2, 3, 7, 20, 40, authored.length - 1];
	for (const i of indices) {
		await railButtons(page).nth(i).click();
		await page.waitForTimeout(350); // let the scroll settle before measuring geometry
		// `revealSlide` centers the whole slide RANGE, not its first line — so the first line sits half a
		// slide above center (measured 120–191px, which is why "first line near center" was the wrong
		// assertion). The property that actually means "this slide is framed" is that the editor's
		// vertical center falls INSIDE slide i: between its first line and the first line of slide i+1.
		// An off-by-one puts the center inside slide i-1, which this sees.
		const want = authored[i].split('\n')[0].trim();
		const next = i + 1 < authored.length ? authored[i + 1].split('\n')[0].trim() : null;
		const m = await page.evaluate(
			({ text, nextText }: { text: string; nextText: string | null }) => {
				const scroller = document.querySelector('.cm-scroller');
				if (!scroller) return null;
				const lines = [...scroller.querySelectorAll('.cm-line')];
				const find = (t: string | null) => (t === null ? null : lines.find((l) => (l.textContent ?? '').trim() === t));
				const first = find(text);
				if (!first) return { found: false, inside: false, clamped: false };
				const s = scroller.getBoundingClientRect();
				const center = s.top + s.height / 2;
				const top = first.getBoundingClientRect().top;
				const nextEl = find(nextText);
				const bottom = nextEl ? nextEl.getBoundingClientRect().top : s.bottom;
				const atTop = scroller.scrollTop <= 2;
				const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
				return {
					found: true,
					inside: center >= top && center <= bottom,
					// At a scroll extreme, centering is impossible; the honest assertion is "fully on screen".
					clamped: (atTop || atBottom) && top >= s.top - 2 && top <= s.bottom,
				};
			},
			{ text: want, nextText: next },
		);
		if (!m) {
			wrong.push(`rail ${i}: no editor scroller found`);
		} else if (!m.found) {
			wrong.push(`rail ${i}: slide ${i}'s first line ${JSON.stringify(want)} is not rendered at all`);
		} else if (!m.inside && !m.clamped) {
			wrong.push(`rail ${i}: the editor's center is not inside slide ${i} (starts ${JSON.stringify(want)}) — a different slide is framed`);
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
		await page.waitForTimeout(300);
		const ownLines = authored[i].split('\n').map((l) => l.trim()).filter((l) => l.length > 8);
		const target = ownLines[ownLines.length - 1];
		const line = page.locator('.cm-line', { hasText: target }).first();
		if (!(await line.count())) continue; // line not built (virtualized away) — skip rather than fake it
		await line.click();
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
