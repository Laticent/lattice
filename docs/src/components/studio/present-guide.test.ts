import { describe, expect, it } from 'vitest';
import { cueDisplayText, findCueTarget, guideTargetFor } from './present-guide';

// THE GUIDE RUNG's target resolution (#1397).
//
// The design record assumed the speech projection could hand over a DOM node per sentence. It
// cannot: the projection holds a node per BLOCK and joins blocks into one string, and sentences
// are created later by `buildTrack` segmenting that string. So Guide resolves LATE, against the
// live slide, by matching the cue's display text back to the smallest block that contains it.
// These pin the properties that makes-or-breaks: smallest block, not first container; robust to
// the punctuation the projection rewrites; and honest silence when nothing matches.

const doc = (html: string): Document => new DOMParser().parseFromString(`<html><body><section class="lattice">${html}</section></body></html>`, 'text/html');

describe('findCueTarget', () => {
	it('points at the smallest block containing the sentence, not the container', () => {
		// The blockquote AND its paragraph both contain the sentence and both are candidates;
		// only the paragraph is worth pointing at. Document order would pick the blockquote.
		const d = doc('<blockquote><p>Expansion outran churn every month.</p></blockquote>');
		expect(findCueTarget(d, 'Expansion outran churn every month.')?.tagName).toBe('P');
	});

	it('picks the right item out of a list of siblings', () => {
		const d = doc('<ul><li>Expansion outran churn every month.</li><li>Net churn held at 1.2%.</li></ul>');
		expect(findCueTarget(d, 'Net churn held at 1.2%.')?.textContent).toContain('Net churn');
	});

	it('matches across the punctuation the projection rewrites', () => {
		const d = doc('<p>Expansion outpaced new business again — the platform bet is compounding</p>');
		// The projection terminates sentences and normalizes dashes and curly quotes; the slide
		// still shows the original. A match must survive that or Guide points at nothing on
		// exactly the decks that read best.
		expect(findCueTarget(d, 'Expansion outpaced new business again - the platform bet is compounding.')).not.toBeNull();
	});

	it('finds a sentence inside a longer block', () => {
		const d = doc('<p>Growth held. Spend stayed disciplined. The quarter landed on plan.</p>');
		expect(findCueTarget(d, 'Spend stayed disciplined.')?.tagName).toBe('P');
	});

	// ── CONTAINMENT RUNS ONE WAY ────────────────────────────────────────────────────────────
	//
	// The first version also accepted a block whose text was a SUBSTRING of the sentence, for
	// reach. Every such block is by definition shorter than the paragraph that really holds the
	// sentence, so smallest-wins preferred it every time — and the four shapes below are not
	// exotic, they are the everyday Lattice slide: a heading, a kicker, a table cell, or an
	// inline `<code>` chip whose words recur in the prose beneath it. Measured over the 124 decks
	// in `examples/` + `test/integration/baseline-decks/` (5,551 cues), that branch raised the
	// match rate from 83.5% to 90.7% and produced 639 hits on an element holding under half the
	// spoken sentence. It bought reach by pointing somewhere wrong.
	it('points at the paragraph, not at an inline code chip whose name it contains', () => {
		const d = doc('<p>Set the retry ceiling to <code>maxRetries</code> before the deploy window closes.</p>');
		expect(findCueTarget(d, 'Set the retry ceiling to maxRetries before the deploy window closes.')?.tagName).toBe('P');
	});

	it('points at the paragraph, not at a table cell that repeats a phrase from it', () => {
		const d = doc('<p>Net revenue grew and margins expanded across the board.</p><table><tr><td>Margins expanded</td></tr></table>');
		expect(findCueTarget(d, 'Net revenue grew and margins expanded across the board.')?.tagName).toBe('P');
	});

	it('points at the paragraph, not at the heading above it', () => {
		const d = doc('<h2>Operating leverage</h2><p>Operating leverage is finally showing up in the numbers this quarter.</p>');
		expect(findCueTarget(d, 'Operating leverage is finally showing up in the numbers this quarter.')?.tagName).toBe('P');
	});

	it('points at the paragraph, not at a one-word bullet it echoes', () => {
		const d = doc('<ul><li>Compounding</li></ul><p>The platform bet is compounding faster than we modeled.</p>');
		expect(findCueTarget(d, 'The platform bet is compounding faster than we modeled.')?.tagName).toBe('P');
	});

	// ── LETTERS OF EVERY SCRIPT ─────────────────────────────────────────────────────────────
	//
	// `[^a-z0-9' -]` did not merely fail on a Cyrillic deck, it failed DANGEROUSLY: the sentence
	// collapsed to a run of SPACES, which still cleared the length guard, so containment degraded
	// into "does this block have at least as many words" and the cursor went to an arbitrary line,
	// confidently. `frontMatterLang` makes non-English decks a supported surface.
	it('resolves a Cyrillic sentence to the block that actually holds it', () => {
		const d = doc('<h2>Итоги квартала</h2><ul><li>Выручка выросла на двадцать процентов</li></ul><p>Рост удержан в этом квартале.</p>');
		const hit = findCueTarget(d, 'Рост удержан в этом квартале.');
		expect(hit?.tagName).toBe('P');
		expect(hit?.textContent).toContain('Рост удержан');
	});

	it('resolves a CJK sentence rather than going silent on it', () => {
		const d = doc('<h2>四半期の総括</h2><p>成長は今四半期も維持されました。</p>');
		expect(findCueTarget(d, '成長は今四半期も維持されました。')?.tagName).toBe('P');
	});

	it('refuses a needle with no letters or digits at all', () => {
		// A sentence of pure punctuation loosens to separators, which would otherwise match the
		// first block carrying as many of them. Nothing is the honest answer.
		const d = doc('<p>Growth held.</p><p>— — —</p>');
		expect(findCueTarget(d, '— — —')).toBeNull();
	});

	it('returns null rather than guessing', () => {
		const d = doc('<p>Growth held.</p>');
		// A slide narrated by a speaker note says nothing that is ON the slide. Pointing anyway
		// would teach the viewer to look at the wrong thing, which is worse than not pointing.
		expect(findCueTarget(d, 'This line exists only in the presenter notes.')).toBeNull();
		expect(findCueTarget(d, 'a')).toBeNull(); // too short to identify anything honestly
		expect(findCueTarget(null, 'Growth held.')).toBeNull();
	});

	it('prefers the table cell over the table', () => {
		const d = doc('<table><tr><td>Net revenue four point six million</td><td>On plan</td></tr></table>');
		expect(findCueTarget(d, 'Net revenue four point six million')?.tagName).toBe('TD');
	});
});

describe('cueDisplayText', () => {
	it('joins a cue’s DISPLAY words — never the spoken ones', () => {
		// The spoken form has acronyms expanded and say-as applied ("N R R" for "NRR"), which the
		// slide does not contain. Matching on it would fail on exactly the decks with a lexicon.
		const cue = { words: [{ display: 'NRR' }, { display: 'held' }, { display: 'at' }, { display: '127%.' }] };
		expect(cueDisplayText(cue)).toBe('NRR held at 127%.');
	});

	it('is empty for an empty or absent cue', () => {
		expect(cueDisplayText(null)).toBe('');
		expect(cueDisplayText(undefined)).toBe('');
		expect(cueDisplayText({ words: [] })).toBe('');
	});
});

describe('guideTargetFor — the cross-frame seam', () => {
	/** A stand-in for the slide iframe: a real document behind a frame-shaped object. */
	function fakeFrame(html: string, rect: { left: number; top: number; width: number }, offsetWidth: number) {
		const d = doc(html);
		const el = d.querySelector('p') as HTMLElement;
		// jsdom has no layout, so the element reports what the test says it does.
		el.getBoundingClientRect = () => ({ x: 10, y: 20, left: 10, top: 20, width: 100, height: 30, right: 110, bottom: 50, toJSON: () => ({}) }) as DOMRect;
		const frame = {
			contentDocument: d,
			offsetWidth,
			getBoundingClientRect: () => ({ x: rect.left, y: rect.top, left: rect.left, top: rect.top, width: rect.width, height: 100, right: rect.left + rect.width, bottom: rect.top + 100, toJSON: () => ({}) }) as DOMRect,
		} as unknown as HTMLIFrameElement;
		return frame;
	}

	it('maps an inner rect into parent-viewport coordinates through the frame scale', () => {
		// The Studio scales the slide iframe to fit its pane: 1280 layout px shown at 640 => S=0.5.
		const frame = fakeFrame('<p>Growth held.</p>', { left: 200, top: 50, width: 640 }, 1280);
		const target = guideTargetFor(() => frame, 'Growth held.');
		expect(target).not.toBeNull();
		const r = target?.getBoundingClientRect();
		// left = frameLeft + innerLeft * S = 200 + 10*0.5; width = 100*0.5
		expect(r?.left).toBeCloseTo(205, 5);
		expect(r?.top).toBeCloseTo(60, 5);
		expect(r?.width).toBeCloseTo(50, 5);
	});

	it('re-measures on every call — the frame and the element both move', () => {
		let left = 200;
		const d = doc('<p>Growth held.</p>');
		const el = d.querySelector('p') as HTMLElement;
		el.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10, toJSON: () => ({}) }) as DOMRect;
		const frame = {
			contentDocument: d,
			offsetWidth: 100,
			getBoundingClientRect: () => ({ x: left, y: 0, left, top: 0, width: 100, height: 100, right: left + 100, bottom: 100, toJSON: () => ({}) }) as DOMRect,
		} as unknown as HTMLIFrameElement;
		const target = guideTargetFor(() => frame, 'Growth held.');
		expect(target?.getBoundingClientRect().left).toBe(200);
		left = 500; // the host reflowed — a snapshotted rect would still say 200 (#1400)
		expect(target?.getBoundingClientRect().left).toBe(500);
	});

	it('degrades to nowhere rather than throwing when the frame goes away', () => {
		const frame = fakeFrame('<p>Growth held.</p>', { left: 0, top: 0, width: 100 }, 100);
		let live: HTMLIFrameElement | null = frame;
		const target = guideTargetFor(() => live, 'Growth held.');
		expect(target?.getBoundingClientRect().width).toBeGreaterThan(0);
		// The presenter closed Present, or the slide re-rendered and replaced the frame, while a
		// cue glide was still in flight. That has to be "nowhere", never a throw mid-animation.
		live = null;
		expect(() => target?.getBoundingClientRect()).not.toThrow();
		expect(target?.getBoundingClientRect()).toMatchObject({ left: 0, width: 0 });
	});

	it('is null when nothing on the slide says it', () => {
		const frame = fakeFrame('<p>Growth held.</p>', { left: 0, top: 0, width: 100 }, 100);
		expect(guideTargetFor(() => frame, 'Only in the notes.')).toBeNull();
		expect(guideTargetFor(() => null, 'Growth held.')).toBeNull();
	});
});
