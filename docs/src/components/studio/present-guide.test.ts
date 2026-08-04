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
