import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aimTarget, type Box, chooseGesture, cueDisplayText, findCueTarget, type GuideShape, guideAimFor, guideCueFor, POINTER_BOX, pointerAnchor, sentenceRange } from './present-guide';

// THE GUIDE RUNG's target resolution (#1397).
//
// The design record assumed the speech projection could hand over a DOM node per sentence. It
// cannot: the projection holds a node per BLOCK and joins blocks into one string, and sentences
// are created later by `buildTrack` segmenting that string. So Guide resolves LATE, against the
// live slide, by matching the cue's display text back to the smallest block that contains it.
// These pin the properties that makes-or-breaks: smallest block, not first container; robust to
// the punctuation the projection rewrites; and honest silence when nothing matches.

/** The pointer's real ink footprint: a POINTER_BOX square centered on where it is placed. */
const atPoint = (x: number, y: number) => ({ left: x - POINTER_BOX / 2, top: y - POINTER_BOX / 2, width: POINTER_BOX, height: POINTER_BOX }) as DOMRect;
/** Do two boxes overlap at all? Touching edges do not count as covering. */
const pointerCovers = (p: { left: number; top: number; width: number; height: number }, t: { left: number; top: number; width: number; height: number }): boolean =>
	p.left < t.left + t.width && p.left + p.width > t.left && p.top < t.top + t.height && p.top + p.height > t.top;

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


// ── THE VOCABULARY, CHOSEN BY SHAPE (#1404) ─────────────────────────────────────────────────
//
// Motivated variety, never a die roll. `chooseGesture` is pure and takes measurements, so it is
// tested as measurements — the thresholds it encodes are the design, and a change to one of them
// should have to change a line here.

describe('chooseGesture', () => {
	const W = 1280;
	const shape = (box: Box, lines: number, extra: Partial<GuideShape> = {}): GuideShape => ({ box, lines, rects: null, slideW: W, coverage: 1, ...extra });

	it('underlines one wide, short line of prose — the workhorse', () => {
		expect(chooseGesture(shape({ left: 80, top: 300, width: 900, height: 30 }, 1))).toBe('underline');
	});

	it('rings a compact, roughly square thing — a stat, a chip, a table cell', () => {
		expect(chooseGesture(shape({ left: 400, top: 260, width: 180, height: 64 }, 1))).toBe('circle');
	});

	it('brackets a whole card — anything taller than a couple of lines', () => {
		expect(chooseGesture(shape({ left: 80, top: 120, width: 500, height: 300 }, 8))).toBe('bracket');
	});

	it('taps something small and discrete, where a ring would be a dot', () => {
		expect(chooseGesture(shape({ left: 500, top: 300, width: 70, height: 22 }, 1))).toBe('tap');
	});

	it('washes a phrase INSIDE a longer block, whatever shape the block is', () => {
		// A fact about the CUE, not about the box — which is why it is the first rule. The same
		// paragraph read WHOLE is a bracket; read one clause at a time it is a wash.
		const block = { left: 80, top: 120, width: 800, height: 300 };
		const rects = [{ left: 80, top: 150, width: 400, height: 24 }];
		expect(chooseGesture(shape(block, 8, { rects, coverage: 0.2 }))).toBe('wash');
		expect(chooseGesture(shape(block, 8, { rects, coverage: 0.95 }))).toBe('bracket');
	});

	it('does not wash when the sentence could not be located inside the block', () => {
		// No rects means no ink to follow, so a highlighter would have to be painted over the
		// whole paragraph — naming everything, which is naming nothing.
		expect(chooseGesture(shape({ left: 80, top: 120, width: 800, height: 300 }, 8, { rects: null, coverage: 0.2 }))).toBe('bracket');
	});

	it('is not fooled by a padded box — a one-line table cell is not a card', () => {
		// The text's geometry, not the element's: 20px of cell padding around one 24px line used
		// to read as 2.7 line-heights and get bracketed like a card.
		expect(chooseGesture(shape({ left: 500, top: 300, width: 70, height: 24 }, 1))).toBe('tap');
	});

	it('reads the same at 1280 and at 1920, because every threshold is in slide units', () => {
		// A deck rendered at a different size is the same deck. A pixel threshold would silently
		// reclassify every target on it.
		const at = (k: number) => chooseGesture({ box: { left: 0, top: 0, width: 180 * k, height: 64 * k }, lines: 1, rects: null, slideW: W * k, coverage: 1 });
		expect(at(1)).toBe(at(1.5));
	});
});

describe('aimTarget — escalation composes with `_focus:`', () => {
	const withFocus = (html: string) => doc(html).querySelector('p, table, ul') as Element;

	it('names the focused element inside a block, not the block', () => {
		// The deck said "row 4". Pointing at the table would be ignoring it — and because the
		// focused element is smaller, the shape rule then picks a stronger gesture on its own.
		const table = withFocus('<table><tbody><tr><td>a</td></tr><tr class="lat-focus"><td>b</td></tr></tbody></table>');
		const { el, notable } = aimTarget(table);
		expect(el.tagName).toBe('TR');
		expect(notable).toBe(true);
	});

	it('treats a block that IS focused, or sits inside one, as notable without moving the aim', () => {
		const li = doc('<ul><li class="lat-focus">Growth held.</li></ul>').querySelector('li') as Element;
		expect(aimTarget(li)).toEqual({ el: li, notable: true });
		const inner = doc('<li class="lat-focus"><p>Growth held.</p></li>').querySelector('p') as Element;
		expect(aimTarget(inner)).toEqual({ el: inner, notable: true });
	});

	it('is quiet on a slide that declared no focus at all', () => {
		const p = doc('<p>Growth held.</p>').querySelector('p') as Element;
		expect(aimTarget(p)).toEqual({ el: p, notable: false });
	});

	it('does NOT read slide atmosphere as emphasis', () => {
		// `mark-*` / `tint-*` are slide-level atmosphere, deliberately not inline emphasis. Reading
		// them here would be the parallel notion of "important" this design refuses to invent.
		const p = doc('<section class="mark-alarm tint-warm"><p>Growth held.</p></section>').querySelector('p') as Element;
		expect(aimTarget(p).notable).toBe(false);
	});
});

describe('sentenceRange — the sentence inside the block', () => {
	const rangeIn = (html: string, text: string) => {
		const d = doc(html);
		const block = findCueTarget(d, text) as Element;
		return sentenceRange(block, text);
	};

	it('selects exactly the spoken sentence, not the paragraph that holds it', () => {
		const r = rangeIn('<p>Growth held. Spend stayed disciplined. The quarter landed on plan.</p>', 'Spend stayed disciplined.');
		expect(r?.toString()).toBe('Spend stayed disciplined.');
	});

	it('spans element boundaries, so inline markup does not defeat it', () => {
		const r = rangeIn('<p>Growth held. Spend stayed <strong>disciplined</strong> all year. The quarter landed on plan.</p>', 'Spend stayed disciplined all year.');
		expect(r?.toString()).toBe('Spend stayed disciplined all year.');
	});

	it('lands on the right offsets when the projection rewrote the punctuation', () => {
		// The cue says `-`, the slide shows `—`. The MAP has to survive that or the range starts
		// mid-word: the whole reason the reconstruction is verified against `loose()` before use.
		const r = rangeIn('<p>Growth held — barely. Spend stayed disciplined.</p>', 'Growth held - barely.');
		expect(r?.toString()).toBe('Growth held — barely.');
	});

	it('is null when the sentence is not in the block, rather than guessing a span', () => {
		const d = doc('<p>Growth held.</p>');
		expect(sentenceRange(d.querySelector('p') as Element, 'Only in the notes.')).toBeNull();
	});
});

// ── THE CROSS-FRAME CUE ─────────────────────────────────────────────────────────────────────

describe('guideCueFor — the whole cue for one sentence', () => {
	/** A stand-in for the slide iframe: a real document behind a frame-shaped object, with the
	 *  matched block reporting the layout jsdom cannot produce. */
	function fakeFrame(html: string, opts: { rect?: { left: number; top: number; width: number }; offsetWidth?: number; box?: { left: number; top: number; width: number; height: number }; sel?: string } = {}) {
		const rect = opts.rect ?? { left: 0, top: 0, width: 100 };
		const box = opts.box ?? { left: 10, top: 20, width: 100, height: 30 };
		const d = doc(html);
		for (const el of d.querySelectorAll(opts.sel ?? 'p')) {
			(el as HTMLElement).getBoundingClientRect = () => ({ x: box.left, y: box.top, left: box.left, top: box.top, width: box.width, height: box.height, right: box.left + box.width, bottom: box.top + box.height, toJSON: () => ({}) }) as DOMRect;
		}
		return {
			contentDocument: d,
			offsetWidth: opts.offsetWidth ?? 100,
			getBoundingClientRect: () => ({ x: rect.left, y: rect.top, left: rect.left, top: rect.top, width: rect.width, height: 100, right: rect.left + rect.width, bottom: rect.top + 100, toJSON: () => ({}) }) as DOMRect,
		} as unknown as HTMLIFrameElement;
	}

	it('hands Vetrina the TARGET BOX, mapped through the frame scale', () => {
		// The Studio scales the slide iframe to fit its pane: 1280 layout px shown at 640 => S=0.5.
		// The matched <p> at inner (10,20) 100x30 is (205,60) 50x15 in the parent's coordinates.
		// It is the box, not an anchor beside it: WHERE the cursor goes is now the gesture's
		// business, derived from this box, rather than a point the host picked in advance.
		const frame = fakeFrame('<p>Growth held.</p>', { rect: { left: 200, top: 50, width: 640 }, offsetWidth: 1280 });
		const cue = guideCueFor(() => frame, 'Growth held.');
		expect(cue).not.toBeNull();
		expect(cue?.target.getBoundingClientRect()).toMatchObject({ left: 205, top: 60, width: 50, height: 15 });
	});

	it('re-measures on every call — the frame and the element both move (#1400)', () => {
		let left = 200;
		const d = doc('<p>Growth held.</p>');
		const el = d.querySelector('p') as HTMLElement;
		el.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10, toJSON: () => ({}) }) as DOMRect;
		const frame = {
			contentDocument: d,
			offsetWidth: 100,
			getBoundingClientRect: () => ({ x: left, y: 0, left, top: 0, width: 100, height: 100, right: left + 100, bottom: 100, toJSON: () => ({}) }) as DOMRect,
		} as unknown as HTMLIFrameElement;
		const cue = guideCueFor(() => frame, 'Growth held.');
		const first = cue?.target.getBoundingClientRect().left as number;
		left = 500; // the host reflowed — a snapshotted rect would still sit at the old offset
		expect((cue?.target.getBoundingClientRect().left as number) - first).toBeCloseTo(300, 5);
	});

	it('names the element the gesture cadence compares on', () => {
		// The BLOCK-change cadence is `cue.el === lastCue.el`. If this were a fresh object per
		// sentence the rest would never happen and Guide would still be a karaoke follower.
		const frame = fakeFrame('<p>Growth held. Spend stayed disciplined.</p>');
		expect(guideCueFor(() => frame, 'Growth held.')?.el).toBe(guideCueFor(() => frame, 'Spend stayed disciplined.')?.el);
	});

	it('escalates to notable when the deck declared focus', () => {
		const frame = fakeFrame('<ul><li class="lat-focus">Growth held.</li></ul>', { sel: 'li' });
		expect(guideCueFor(() => frame, 'Growth held.')?.strength).toBe('notable');
		const plain = fakeFrame('<ul><li>Growth held.</li></ul>', { sel: 'li' });
		expect(guideCueFor(() => plain, 'Growth held.')?.strength).toBe('quiet');
	});

	it('hands back a REST only when the stroke’s own ending will not do', () => {
		// A wide line with clear margins: the gesture's own end is fine and the host says nothing,
		// which is what keeps the withdrawal one continuous motion instead of two glides.
		const clear = fakeFrame('<p>Growth held.</p>', { rect: { left: 0, top: 0, width: 1280 }, offsetWidth: 1280, box: { left: 80, top: 300, width: 700, height: 30 } });
		expect(guideCueFor(() => clear, 'Growth held.')?.rest).toBeNull();
		// `circle` always needs one: its orbit ends a quarter turn past wherever the cursor came
		// in from, so it has no deterministic ending for a host to reason about.
		const ring = fakeFrame('<p>Growth held.</p>', { rect: { left: 0, top: 0, width: 1280 }, offsetWidth: 1280, box: { left: 400, top: 300, width: 150, height: 48 } });
		const cue = guideCueFor(() => ring, 'Growth held.');
		expect(cue?.kind).toBe('circle');
		expect(cue?.rest).not.toBeNull();
	});

	it('degrades to nowhere rather than throwing when the frame goes away', () => {
		const frame = fakeFrame('<p>Growth held.</p>');
		let live: HTMLIFrameElement | null = frame;
		const cue = guideCueFor(() => live, 'Growth held.');
		expect(cue?.target.getBoundingClientRect().width).toBeGreaterThan(0);
		// The presenter closed Present, or the slide re-rendered and replaced the frame, while a
		// stroke was still in flight. That has to be "nowhere", never a throw mid-animation.
		live = null;
		expect(() => cue?.target.getBoundingClientRect()).not.toThrow();
		expect(cue?.target.getBoundingClientRect()).toMatchObject({ left: 0, width: 0 });
		expect(cue?.target.getClientRects?.()).toEqual([]);
	});

	it('is null when nothing on the slide says it', () => {
		const frame = fakeFrame('<p>Growth held.</p>');
		expect(guideCueFor(() => frame, 'Only in the notes.')).toBeNull();
		expect(guideCueFor(() => null, 'Growth held.')).toBeNull();
	});
});

// ── THE FALLBACK — #1403's whitespace search, now reached only when geometry is not enough ──
//
// The pointer's position is a CONSEQUENCE of the gesture's stroke, so the search is no longer
// the placement mechanism. What geometry alone cannot know is what ELSE is near: "past the
// block's right edge" is the slide margin on a full-width paragraph and the second column on a
// two-column layout. These pin the fallback for exactly that case.

describe('pointerAnchor — the fallback placement', () => {
	it.each([
		['a paragraph mid-slide', { left: 300, top: 300, width: 600, height: 40 }],
		['a heading at the top edge', { left: 300, top: 4, width: 600, height: 60 }],
		['a block flush to the left edge', { left: 0, top: 300, width: 600, height: 40 }],
		['a block flush to the right edge', { left: 700, top: 300, width: 260, height: 40 }],
		['a block at the bottom edge', { left: 300, top: 500, width: 600, height: 40 }],
		['a tall multi-line block', { left: 200, top: 100, width: 500, height: 380 }],
		['a narrow chip', { left: 480, top: 260, width: 60, height: 22 }],
		['a corner-pinned kicker', { left: 0, top: 0, width: 180, height: 24 }],
	])('points at %s without covering it, and stays on the slide', (_name, box) => {
		const frame = { left: 0, top: 0, width: 960, height: 540 };
		const { x, y } = pointerAnchor(box, frame, [box]);
		expect(pointerCovers(atPoint(x, y), box), `the pointer box overlaps the text at (${x},${y})`).toBe(false);
		expect(x - POINTER_BOX / 2).toBeGreaterThanOrEqual(frame.left);
		expect(x + POINTER_BOX / 2).toBeLessThanOrEqual(frame.left + frame.width);
		expect(y - POINTER_BOX / 2).toBeGreaterThanOrEqual(frame.top);
		expect(y + POINTER_BOX / 2).toBeLessThanOrEqual(frame.top + frame.height);
	});

	it('clears the NEIGHBORING block too, not just its own target', () => {
		// This is what failed on the real Present surface after the first fix: the obvious place to
		// stand beside a heading is directly under it, and directly under a heading is where the
		// paragraph is. A slide is mostly text — the fallback has to find whitespace, not merely
		// step off one block.
		const frame = { left: 0, top: 0, width: 960, height: 540 };
		const heading = { left: 80, top: 120, width: 800, height: 70 };
		const body = { left: 80, top: 200, width: 800, height: 120 };
		const { x, y } = pointerAnchor(heading, frame, [heading, body]);
		expect(pointerCovers(atPoint(x, y), heading), 'covers its own target').toBe(false);
		expect(pointerCovers(atPoint(x, y), body), 'covers the paragraph beneath the heading').toBe(false);
	});

	it('scales its clearance with the frame — a preview at half size halves the pointer in slide units', () => {
		// The cursor's 28px is PARENT pixels and does not shrink with a scaled preview, so in the
		// slide's own coordinates it covers TWICE as much at S=0.5. Getting this backwards would
		// clear the text on an unscaled Playground and cover it in the scaled Studio.
		const frame = { left: 0, top: 0, width: 1280, height: 720 };
		const box = { left: 100, top: 300, width: 900, height: 40 };
		const atFull = pointerAnchor(box, frame, [box], POINTER_BOX / 2);
		const atHalf = pointerAnchor(box, frame, [box], POINTER_BOX / 2 / 0.5);
		expect(pointerCovers({ left: atHalf.x - POINTER_BOX, top: atHalf.y - POINTER_BOX, width: POINTER_BOX * 2, height: POINTER_BOX * 2 }, box)).toBe(false);
		expect(Math.abs(atHalf.x - box.left)).toBeGreaterThan(Math.abs(atFull.x - box.left));
	});

	it('falls back to a clamped position rather than off the slide when a block fills it', () => {
		// A block edge to edge leaves no clear side. Overlap becomes possible — a pointer half off
		// the card is the worse failure — but it must still be ON the slide.
		const frame = { left: 0, top: 0, width: 960, height: 540 };
		const full = { left: 0, top: 0, width: 960, height: 540 };
		const { x, y } = pointerAnchor(full, frame, [full]);
		expect(x).toBeGreaterThanOrEqual(POINTER_BOX / 2);
		expect(x).toBeLessThanOrEqual(960 - POINTER_BOX / 2);
		expect(y).toBeGreaterThanOrEqual(POINTER_BOX / 2);
		expect(y).toBeLessThanOrEqual(540 - POINTER_BOX / 2);
	});
});

// ── WITH LAYOUT ─────────────────────────────────────────────────────────────────────────────
//
// jsdom produces no line boxes, so everything above exercises the classifier's FALLBACK path
// (box height over line height). The text-geometry path — the one that actually ships, and the
// one that stops a padded cell reading as a card — needs line boxes, so these synthesize them
// on `Range` and drive `guideCueFor` through the real code.
//
// Keyed on the range's own text, so a stub cannot answer for a range the test did not mean.

describe('guideCueFor, with line boxes', () => {
	const LAYOUT = new Map<string, { left: number; top: number; width: number; height: number }[]>();
	let original: typeof Range.prototype.getClientRects;

	beforeEach(() => {
		LAYOUT.clear();
		original = Range.prototype.getClientRects;
		Range.prototype.getClientRects = function () {
			const boxes = LAYOUT.get(this.toString()) ?? [];
			return boxes.map((b) => ({ x: b.left, y: b.top, left: b.left, top: b.top, width: b.width, height: b.height, right: b.left + b.width, bottom: b.top + b.height, toJSON: () => ({}) })) as unknown as DOMRectList;
		};
	});
	afterEach(() => {
		Range.prototype.getClientRects = original;
	});

	function frameOf(html: string, elBox: { left: number; top: number; width: number; height: number }, sel = 'p') {
		const d = doc(html);
		for (const el of d.querySelectorAll(sel)) {
			(el as HTMLElement).getBoundingClientRect = () => ({ x: elBox.left, y: elBox.top, left: elBox.left, top: elBox.top, width: elBox.width, height: elBox.height, right: elBox.left + elBox.width, bottom: elBox.top + elBox.height, toJSON: () => ({}) }) as DOMRect;
		}
		return {
			contentDocument: d,
			offsetWidth: 1280,
			getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720, toJSON: () => ({}) }) as DOMRect,
		} as unknown as HTMLIFrameElement;
	}

	it('reads the TEXT, not the padded full-width box that contains it', () => {
		// A `<p>` holding "ARR 42%" has the whole column's width and a cell's worth of padding. Judged
		// on the element's box that is a wide line of prose; judged on its one short line box it
		// is the small discrete thing it looks like.
		LAYOUT.set('ARR 42%', [{ left: 100, top: 310, width: 70, height: 24 }]);
		const frame = frameOf('<p>ARR 42%</p>', { left: 80, top: 300, width: 900, height: 64 });
		expect(guideCueFor(() => frame, 'ARR 42%')?.kind).toBe('tap');
	});

	it('washes a sentence that is one clause of a paragraph, and follows its lines', () => {
		const full = 'Growth held. Spend stayed disciplined. The quarter landed on plan.';
		LAYOUT.set(full, [
			{ left: 80, top: 120, width: 800, height: 24 },
			{ left: 80, top: 148, width: 800, height: 24 },
			{ left: 80, top: 176, width: 400, height: 24 },
		]);
		LAYOUT.set('Spend stayed disciplined.', [{ left: 300, top: 120, width: 260, height: 24 }]);
		const frame = frameOf(`<p>${full}</p>`, { left: 80, top: 120, width: 800, height: 90 });
		const cue = guideCueFor(() => frame, 'Spend stayed disciplined.');
		expect(cue?.kind).toBe('wash');
		// …and the ink it hands over is the SENTENCE's line box, mapped out of the frame — not
		// the paragraph's three. S is 1 here (1280 shown at 1280), so the numbers pass through.
		expect(cue?.target.getClientRects?.()).toMatchObject([{ left: 300, top: 120, width: 260, height: 24 }]);
	});

	it('counts a line, not the fragments inline markup splits it into', () => {
		// A line with a `<strong>` in it is three rects at the same top and ONE line. Counting
		// rects would make every emphasized sentence a multi-line card.
		LAYOUT.set('Spend stayed disciplined.', [
			{ left: 300, top: 120, width: 90, height: 24 },
			{ left: 390, top: 120, width: 80, height: 24 },
			{ left: 470, top: 120, width: 60, height: 24 },
		]);
		const frame = frameOf('<p>Spend stayed <strong>disciplined</strong>.</p>', { left: 80, top: 118, width: 800, height: 28 });
		expect(guideCueFor(() => frame, 'Spend stayed disciplined.')?.kind).toBe('underline');
	});

	it('still has ink when the sentence could not be located inside the block', () => {
		// The `_focus:` case: the aim moves to the called-out element, so the sentence's rects are
		// not inside it. The cue falls back to that element's OWN lines rather than to no ink at
		// all — an underline drawn on the padded box instead of on the words is the thing this
		// avoids, and a wash with nothing to follow would simply not appear.
		LAYOUT.set('Spend stayed disciplined.', [{ left: 300, top: 120, width: 150, height: 24 }]);
		const frame = frameOf('<p>Growth held. <span class="lat-focus">Spend stayed disciplined.</span></p>', { left: 80, top: 118, width: 800, height: 28 }, 'p, span');
		const cue = guideCueFor(() => frame, 'Growth held.');
		expect(cue?.strength).toBe('notable');
		expect(cue?.target.getClientRects?.()).toMatchObject([{ left: 300, top: 120, width: 150, height: 24 }]);
	});

	it('brackets the same paragraph when the narration reads it whole', () => {
		const full = 'Growth held and spend stayed disciplined and the quarter landed on plan.';
		LAYOUT.set(full, [
			{ left: 80, top: 120, width: 800, height: 24 },
			{ left: 80, top: 148, width: 800, height: 24 },
			{ left: 80, top: 176, width: 400, height: 24 },
		]);
		const frame = frameOf(`<p>${full}</p>`, { left: 80, top: 120, width: 800, height: 90 });
		expect(guideCueFor(() => frame, full)?.kind).toBe('bracket');
	});
});

describe('looseIndex — refusing to guess', () => {
	it('returns no range rather than a wrong one when the case fold changes a length', () => {
		// `İ`.toLowerCase() is two code points, so a character-for-character map would silently
		// slide by one from there on and the ink would start mid-word. Refusing is the answer;
		// every caller degrades to the block's own box, which is merely less precise.
		const d = doc('<p>İstanbul revenue held. Spend stayed disciplined.</p>');
		expect(sentenceRange(d.querySelector('p') as Element, 'Spend stayed disciplined.')).toBeNull();
	});

	it('reconstructs `loose()` exactly over the punctuation a real slide carries', () => {
		// The equality guard above is only a backstop because this holds. If it stops holding,
		// the guard turns every one of these into a null and the wash quietly stops appearing —
		// so the property is pinned here rather than left to the guard to absorb silently.
		for (const raw of ['Growth  held —  barely.', '“Quoted,” he said; then left.', 'A/B tests: 12.4% lift!', 'Ends with a dash -', '  leading and trailing  ']) {
			const d = doc(`<p>${raw}</p>`);
			const p = d.querySelector('p') as Element;
			const words = (p.textContent ?? '').trim().split(/\s+/).slice(0, 2).join(' ');
			if (words.replace(/[^\p{L}\p{N}]/gu, '').length < 3) continue;
			expect(sentenceRange(p, words), `no range for "${raw}"`).not.toBeNull();
		}
	});
});

describe('guideAimFor — the cheap question, asked once per sentence', () => {
	/** A frame whose document counts every rect read, so "reads no layout" is measured rather
	 *  than asserted about the source. The cadence calls this on EVERY cue; a reflow per spoken
	 *  sentence on the narration path is the shape of defect that made audio chop once already. */
	function countingFrame(html: string) {
		const d = doc(html);
		let reads = 0;
		for (const el of d.querySelectorAll('*')) {
			(el as HTMLElement).getBoundingClientRect = () => {
				reads += 1;
				return { x: 0, y: 0, left: 0, top: 0, width: 100, height: 30, right: 100, bottom: 30, toJSON: () => ({}) } as DOMRect;
			};
		}
		const frame = {
			contentDocument: d,
			offsetWidth: 100,
			getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, toJSON: () => ({}) }) as DOMRect,
		} as unknown as HTMLIFrameElement;
		return { frame, reads: () => reads };
	}

	it('names the same element the full decision does', () => {
		const { frame } = countingFrame('<p>Growth held. Spend stayed disciplined.</p>');
		expect(guideAimFor(() => frame, 'Growth held.')).toBe(guideCueFor(() => frame, 'Growth held.')?.el);
	});

	it('follows the focus refinement, so the cadence compares the thing actually named', () => {
		const { frame } = countingFrame('<ul><li>Growth held.</li><li class="lat-focus">Spend stayed disciplined.</li></ul>');
		expect((guideAimFor(() => frame, 'Spend stayed disciplined.') as Element).className).toBe('lat-focus');
	});

	it('reads no layout at all', () => {
		const { frame, reads } = countingFrame('<p>Growth held. Spend stayed disciplined.</p>');
		guideAimFor(() => frame, 'Growth held.');
		expect(reads(), 'the cheap pre-check measured the slide — it is no longer cheap').toBe(0);
		guideCueFor(() => frame, 'Growth held.');
		expect(reads(), 'the full decision measured nothing — it cannot have classified a shape').toBeGreaterThan(0);
	});

	it('is null when nothing on the slide says it', () => {
		const { frame } = countingFrame('<p>Growth held.</p>');
		expect(guideAimFor(() => frame, 'Only in the notes.')).toBeNull();
		expect(guideAimFor(() => null, 'Growth held.')).toBeNull();
	});
});
