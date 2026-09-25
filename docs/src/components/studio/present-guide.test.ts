import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	aimTarget,
	anchorFor,
	type Box,
	chooseGesture,
	cueDisplayText,
	findCueTarget,
	findMarkTarget,
	findNamedTarget,
	findParaphraseTarget,
	findSpanningTarget,
	type GuideShape,
	guideAimFor,
	guideCueFor,
	guideCueIn,
	guideStillShown,
	hasOwnBoundary,
	headerRange,
	isAside,
	markContent,
	markerBox,
	POINTER_BOX,
	planSlide,
	pointerAnchor,
	salience,
	sentenceRange,
} from './present-guide';

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

describe('findParaphraseTarget — an authored caption in other words', () => {
	// The Q3 board fixture's list-steps slide, verbatim: the caption and the items share the words
	// that carry the meaning and not one whole sentence (followups.d/2363-p3).
	const steps = () =>
		doc(`<h2>How the exit would run.</h2><ol>
			<li>Announce — November, with twelve months' notice to every SMB account.</li>
			<li>Migrate — the certified partner onboards accounts from January to June.</li>
			<li>Redeploy — nine sellers join mid-market on 1 December.</li>
			<li>Report — churn impact at every board meeting until the last account moves.</li></ol>`);

	it('names the item a paraphrase is about, through findCueTarget', () => {
		const d = steps();
		const items = [...d.querySelectorAll('li')];
		expect(findCueTarget(d, "First, we announce to customers in November with twelve months' notice.")).toBe(items[0]);
		expect(findCueTarget(d, 'Second, the partner migration runs January through June.')).toBe(items[1]);
		expect(findCueTarget(d, 'Third, the nine sellers move to mid-market on the first of December.')).toBe(items[2]);
		expect(findCueTarget(d, 'Fourth, we report the churn impact at every board meeting until it closes.')).toBe(items[3]);
	});

	it('goes to the headline for a framing sentence that shares a word only with it', () => {
		const d = steps();
		expect(findCueTarget(d, 'If the board agrees to exit, this is the plan.')?.tagName).toBe('H2');
	});

	it('leaves a chart slide\'s frame sentence to the figure, not the headline', () => {
		const d = doc('<h2>Wedges read by value and texture.</h2><div class="chart-body"><svg></svg></div>');
		expect(findParaphraseTarget(d, "Each wedge is that item's share of the whole.")).toBeNull();
		expect(findCueTarget(d, "Each wedge is that item's share of the whole.")?.className).toBe('chart-body');
		// A deck logo is not a figure: the headline fallback still works beside one.
		const logo = doc('<img class="deck-logo" src="x.svg"><h2>How the exit would run.</h2>');
		expect(findParaphraseTarget(logo, 'If the board agrees to exit, this is the plan.')?.tagName).toBe('H2');
	});

	it('names nothing for a sentence with no content on the slide', () => {
		const d = steps();
		expect(findParaphraseTarget(d, 'Thank you.')).toBeNull();
		expect(findParaphraseTarget(d, 'No.')).toBeNull();
		expect(findParaphraseTarget(d, 'It keeps SOC 2 scope narrow.')).toBeNull();
	});

	it('refuses one shared word on a block that is not the headline', () => {
		const d = doc('<h2>Options</h2><ul><li>Why not fix it</li><li>Why not wait</li></ul>');
		expect(findParaphraseTarget(d, 'We did look hard at the fix.')).toBeNull();
	});

	it('hides on a tie between two unrelated blocks rather than guessing', () => {
		const d = doc('<ul><li>Proposal sent 870</li><li>Signed 214</li></ul>');
		expect(findParaphraseTarget(d, '870 reached a proposal, and 214 signed.')).toBeNull();
	});

	it('reads an amount spelled out in the caption as the digits on the slide', () => {
		const d = doc('<ul><li>Hiring continued on plan.</li><li>ARR closed at $48.6M, ahead of plan.</li><li>Proposal sent 870</li><li>Qualified leads 12,400</li></ul>');
		const li = [...d.querySelectorAll('li')];
		expect(findParaphraseTarget(d, 'Recurring revenue closed at forty-eight point six million dollars, ahead of plan.')).toBe(li[1]);
		expect(findParaphraseTarget(d, 'Only eight hundred seventy got a proposal.')).toBe(li[2]);
		expect(findParaphraseTarget(d, 'We generated twelve thousand four hundred qualified leads.')).toBe(li[3]);
	});

	it('lets a number of two or more digits carry a match on its own', () => {
		const d = doc('<ol><li>48.6M ARR</li><li>118% Net dollar retention</li></ol>');
		expect(findParaphraseTarget(d, 'NDR held at 118%.')).toBe(d.querySelectorAll('li')[1]);
	});

	it("matches a chart mark by its declared name and value when it has no text", () => {
		const d = doc(`<div class="chart-body"><svg>
			<polygon data-mark="0" data-label="Qualified leads" data-value="12,400"></polygon>
			<polygon data-mark="1" data-label="Demo held" data-value="3,100"></polygon></svg></div>`);
		expect(findParaphraseTarget(d, 'We generated 12,400 qualified leads.')?.getAttribute('data-mark')).toBe('0');
		expect(findParaphraseTarget(d, '3,100 took a demo.')?.getAttribute('data-mark')).toBe('1');
	});

	it('gives up when more than one slide is in scope and none is known to be showing', () => {
		const d = new DOMParser().parseFromString(
			'<section><ol><li>Announce in November with notice</li></ol></section><section><p>Other</p></section>',
			'text/html',
		);
		expect(findParaphraseTarget(d, 'We announce in November with notice.')).toBeNull();
	});

	it('leaves every exact match to the tiers above it', () => {
		// The paraphrase tier runs after them, so an exact containment still names the smallest block.
		const d = doc('<p>Growth held. Margins rose.</p><p>Growth held steady all year and margins rose.</p>');
		expect(findCueTarget(d, 'Growth held.')).toBe(d.querySelector('p'));
	});
});

describe('planSlide — the salience budget', () => {
	// The Q3 board fixture's KPI slide in miniature: a headline, a number, two plain lines.
	const slide = () =>
		doc(`<h2>Revenue ahead of plan; payback is slipping.</h2><ul>
			<li>Hiring continued on plan across every team.</li>
			<li>ARR closed at $48.6M, ahead of plan.</li>
			<li>The office move finished in August.</li>
			<li>CAC payback stretched to <strong>19 months</strong>.</li></ul>`);
	const cues = [
		'Revenue ahead of plan; payback is slipping.',
		'Hiring continued on plan across every team.',
		'ARR closed at $48.6M, ahead of plan.',
		'The office move finished in August.',
		'CAC payback stretched to 19 months.',
	];
	const aimIn = (d: Document) => (t: string) => findCueTarget(d, t);

	it('spends the budget on the salient moments, not on the first ones spoken', () => {
		const plan = planSlide(cues, aimIn(slide()), 2);
		// The number with emphasis outranks the bare number, which outranks the headline and prose.
		expect([...plan.gesture].sort()).toEqual([2, 4]);
		expect(plan.top).toBe(4);
		expect(plan.aimed.size).toBe(5);
	});

	it('spends in spoken order when nothing is salient', () => {
		const d = doc('<ul><li>We met the team.</li><li>We toured the site.</li><li>We had lunch.</li></ul>');
		const plan = planSlide(['We met the team.', 'We toured the site.', 'We had lunch.'], aimIn(d), 1);
		expect([...plan.gesture]).toEqual([0]);
	});

	it('holds plain prose to one move under a floor, and lets a teaching preset walk it', () => {
		const d = doc('<h2>Section 01</h2><ul><li>We met the team.</li><li>We toured the site.</li></ul>');
		const texts = ['We met the team.', 'We toured the site.'];
		expect(planSlide(texts, aimIn(d), 2, 1).gesture.size).toBe(1);
		expect(planSlide(texts, aimIn(d), 2, 0).gesture.size).toBe(2);
	});

	it('never cuts an authored _focus moment, even past the budget', () => {
		const d = slide();
		d.querySelectorAll('li')[0].classList.add('lat-focus');
		const plan = planSlide(cues, aimIn(d), 1);
		expect(plan.gesture.has(1)).toBe(true);
		expect(plan.top).toBe(1);
	});

	it('counts an authored series as one moment, not one per point', () => {
		const d = doc(`<div class="chart-body"><svg>
			<circle class="lat-focus" data-series="2" data-label="Q1" data-value="1.2"/>
			<circle class="lat-focus" data-series="2" data-label="Q2" data-value="1.6"/>
			<circle class="lat-focus" data-series="2" data-label="Q3" data-value="2.3"/></svg></div>`);
		const dots = [...d.querySelectorAll('circle')];
		const plan = planSlide(['a', 'b', 'c'], (t) => dots['abc'.indexOf(t)], 2, 1);
		expect([...plan.gesture]).toEqual([0]);
	});

	it('scores a chart frame below the bar the headline names', () => {
		const d = doc(`<h2>EMEA is where the quarter was won.</h2><div class="chart-body"><svg>
			<rect data-mark="0" data-label="LATAM" data-value="$1.2M"/><rect data-mark="1" data-label="EMEA" data-value="$6.8M"/>
			<rect data-mark="2" data-label="APAC" data-value="$2.9M"/><text>EMEA $6.8M</text></svg></div>`);
		const body = d.querySelector('.chart-body') as Element;
		expect(salience(body)).toBeLessThan(salience(d.querySelectorAll('rect')[1]));
	});

	it('gestures a focused series on its own cue, not on the chart frame spoken first', () => {
		const d = new DOMParser().parseFromString(`<section data-focus="series 1"><div class="chart-body"><svg>
			<path class="lat-focus" data-series="0"/><path class="lat-recede" data-series="1"/></svg></div></section>`, 'text/html');
		const [body, path] = [d.querySelector('.chart-body') as Element, d.querySelector('path') as Element];
		const plan = planSlide(['frame', 'series'], (t) => (t === 'frame' ? body : path), 1, 1);
		expect([...plan.gesture]).toEqual([1]);
	});

	it('counts the rows of a focused column as one moment', () => {
		const d = new DOMParser().parseFromString(`<section data-focus="col 2"><table><tbody>
			<tr><td>Speed</td><td class="lat-focus">yes</td></tr><tr><td>Audit</td><td class="lat-focus">no</td></tr>
			<tr><td>Adoption</td><td class="lat-focus">yes</td></tr></tbody></table></section>`, 'text/html');
		const rows = [...d.querySelectorAll('tr')];
		const plan = planSlide(['a', 'b', 'c'], (t) => rows['abc'.indexOf(t)], 2, 1);
		expect([...plan.gesture]).toEqual([0]);
	});

	it('gestures only on the first cue that names a target', () => {
		const d = doc('<p>Growth held. Margins rose to 40%.</p>');
		const plan = planSlide(['Growth held.', 'Margins rose to 40%.'], aimIn(d), 4);
		expect([...plan.gesture]).toEqual([0]);
	});

	it('ranks the bar the headline names above the smallest bar spoken first', () => {
		const d = doc(`<h2>EMEA is where the quarter was won.</h2><div class="chart-body"><svg>
			<rect data-mark="0" data-label="North America" data-value="$4.1M"/><rect data-mark="1" data-label="LATAM" data-value="$1.2M"/>
			<rect data-mark="2" data-label="EMEA" data-value="$6.8M"/><rect data-mark="3" data-label="APAC" data-value="$2.9M"/></svg></div>`);
		const [, latam, emea] = [...d.querySelectorAll('rect')];
		expect(salience(emea)).toBeGreaterThan(salience(latam));
	});

	it('scores a chart extreme above its peers', () => {
		const d = doc(`<div class="chart-body"><svg>
			<rect data-mark="0" data-label="North" data-value="4.1"/><rect data-mark="1" data-label="LATAM" data-value="2.2"/>
			<rect data-mark="2" data-label="EMEA" data-value="6.8"/><rect data-mark="3" data-label="APAC" data-value="2.9"/></svg></div>`);
		const [north, , emea, apac] = [...d.querySelectorAll('rect')];
		expect(salience(emea)).toBeGreaterThan(salience(north));
		expect(salience(apac)).toBe(salience(north));
	});
});

describe('markContent — the live content gesture', () => {
	it('spotlights the top-level item a nested bullet belongs to, and undoes itself cleanly', () => {
		const d = doc('<ul><li>One<ul><li>detail</li></ul></li><li>Two</li><li>Three</li></ul>');
		const sec = d.querySelector('section') as Element;
		const [one, detail, two, three] = [...d.querySelectorAll('li')];
		const undo = markContent(detail);
		expect(one.classList.contains('lat-focus')).toBe(true);
		expect([two, three].every((li) => li.classList.contains('lat-recede'))).toBe(true);
		expect(detail.classList.length).toBe(0);
		expect(sec.getAttribute('data-focus-axis')).toBe('item');
		expect(sec.getAttribute('data-focus-style')).toBe('spotlight');
		undo();
		expect([one, two, three].some((li) => li.className)).toBe(false);
		expect(sec.hasAttribute('data-focus-resolved')).toBe(false);
		// The live scope stays so the peers fade back instead of snapping.
		expect(sec.hasAttribute('data-focus-live')).toBe(true);
	});

	it('rings a table body row, as `_focus: row` would', () => {
		const d = doc('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>r1</td></tr><tr><td>r2</td></tr></tbody></table>');
		const [r1, r2] = [...d.querySelectorAll('tbody tr')];
		markContent(r2.querySelector('td') as Element);
		expect(r2.classList.contains('lat-focus')).toBe(true);
		expect(r1.classList.contains('lat-recede')).toBe(true);
		expect(d.querySelector('section')?.getAttribute('data-focus-style')).toBe('ring');
	});

	it('marks every twin of a chart mark and recedes the other marks', () => {
		const d = doc(`<div class="chart-body"><svg><rect data-mark="0"/><rect data-mark="1"/><rect data-mark="2"/></svg>
			<template class="chart-detail" data-mark="1"></template></div>`);
		const [a, b, c] = [...d.querySelectorAll('rect')];
		markContent(b);
		expect(b.classList.contains('lat-focus')).toBe(true);
		expect([a, c].every((r) => r.classList.contains('lat-recede'))).toBe(true);
		expect(d.querySelector('template')?.className).toBe('chart-detail');
		expect(d.querySelector('section')?.getAttribute('data-focus-axis')).toBe('mark');
	});

	it('leaves a slide the deck already focused alone', () => {
		const d = doc('<ul><li class="lat-focus">One</li><li class="lat-recede">Two</li></ul>');
		d.querySelector('section')?.setAttribute('data-focus-resolved', '');
		const two = d.querySelectorAll('li')[1];
		markContent(two)();
		expect(two.className).toBe('lat-recede');
		expect(d.querySelector('li')?.className).toBe('lat-focus');
	});

	it('does nothing to a plain paragraph', () => {
		const d = doc('<h2>Title</h2><p>Growth held.</p>');
		markContent(d.querySelector('p') as Element)();
		expect(d.querySelector('section')?.hasAttribute('data-focus-live')).toBe(false);
	});
});

describe('isAside — which empty sentences the hand holds through', () => {
	it('holds through a short aside and leaves on commentary the slide does not carry', () => {
		expect(isAside('Thank you.')).toBe(true);
		expect(isAside('No.')).toBe(true);
		expect(isAside('We did look hard at the fix.')).toBe(true);
		expect(isAside('The commentary for this slide lives only in the speaker notes and appears nowhere on the slide itself.')).toBe(false);
	});
});

describe('the checker round (#2371)', () => {
	it('never reads the Guide\'s own live mark back as authored focus', () => {
		const d = doc('<ul><li>We met the team.</li><li>We toured the site.</li><li>We had lunch.</li></ul>');
		const [a, , c] = [...d.querySelectorAll('li')];
		expect(salience(a)).toBe(0);
		markContent(a);
		expect(salience(a)).toBe(0);
		const plan = planSlide(['We met the team.', 'We toured the site.', 'We had lunch.'], (t) => findCueTarget(d, t), 1, 0);
		expect(plan.top).toBe(0);
		expect(salience(c)).toBe(0);
	});

	it('does not take radar\'s container, which counts series, for a series', () => {
		const d = doc(`<div class="chart-body radar-figure" data-series="2"><svg>
			<polygon data-series="0"/><polygon data-series="1"/><text class="key">Enterprise tier</text></svg></div>`);
		const undo = markContent(d.querySelector('text') as Element);
		expect(d.querySelector('.radar-figure')?.classList.contains('lat-focus')).toBe(false);
		expect(d.querySelectorAll('.lat-recede').length).toBe(0);
		undo();
	});

	it('skips the paraphrase tier on a deck in another language', () => {
		const d = new DOMParser().parseFromString('<html lang="it"><body><section><h1>Il piano per crescere</h1></section></body></html>', 'text/html');
		expect(findParaphraseTarget(d, 'Grazie per la vostra attenzione')).toBeNull();
	});

	it('wants a substantial shared word before it claims the headline', () => {
		const d = doc('<h1>Revenue grew in every region</h1><p>Other text.</p>');
		expect(findParaphraseTarget(d, 'Every region has a new lead.')).toBeNull();
		expect(findParaphraseTarget(d, 'Revenue is the story this quarter.')?.tagName).toBe('H1');
	});

	it('counts amounts as figures and indexes as not', () => {
		const li = (t: string) => doc(`<ul><li>${t}</li></ul>`).querySelector('li') as Element;
		for (const t of ['3 million users', '40 percent churn', '$4.2M', '118%', '19 mo']) expect(salience(li(t)), t).toBe(3);
		for (const t of ['Section 01', '2.1 Scope and goals', 'in 2026']) expect(salience(li(t)), t).toBe(0);
	});
});

describe('guideStillShown — the hold', () => {
	it('is false for nothing, a detached element, or a slide hidden by the Stage', () => {
		expect(guideStillShown(null)).toBe(false);
		expect(guideStillShown(document.createElement('p'))).toBe(false);
		// Mounted in the test window, so computed style answers the question the Stage asks.
		const host = document.createElement('div');
		host.innerHTML = '<section><p>Shown</p></section><section style="visibility:hidden"><p>Gone</p></section>';
		document.body.append(host);
		const [shown, gone] = [...host.querySelectorAll('p')];
		expect(guideStillShown(shown)).toBe(true);
		expect(guideStillShown(gone)).toBe(false);
		host.remove();
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
	const shape = (box: Box, lines: number, extra: Partial<GuideShape> = {}): GuideShape => ({ box, lines, slideW: W, role: 'body', enclosed: false, textless: false, ...extra });

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
		// paragraph read WHOLE is a bracket; read one clause at a time it is a wash. Whether a cue
		// IS a phrase is decided upstream, by `anchorFor`, and arrives here as the role.
		const block = { left: 80, top: 120, width: 800, height: 300 };
		expect(chooseGesture(shape(block, 8, { role: 'phrase' }))).toBe('wash');
		expect(chooseGesture(shape(block, 8, { role: 'body' }))).toBe('bracket');
	});

	it('is not fooled by a padded box — a one-line table cell is not a card', () => {
		// The text's geometry, not the element's: 20px of cell padding around one 24px line used
		// to read as 2.7 line-heights and get bracketed like a card.
		expect(chooseGesture(shape({ left: 500, top: 300, width: 70, height: 24 }, 1))).toBe('tap');
	});

	it('reads the same at 1280 and at 1920, because every threshold is in slide units', () => {
		// A deck rendered at a different size is the same deck. A pixel threshold would silently
		// reclassify every target on it.
		const at = (k: number) => chooseGesture({ box: { left: 0, top: 0, width: 180 * k, height: 64 * k }, lines: 1, slideW: W * k, role: 'body', enclosed: false, textless: false });
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
		//
		// The neighbor sits where the NEAREST candidate would go, which is the whole point. An
		// earlier fixture put the body below the heading, and there the left-margin candidate wins
		// on distance alone — so deleting the obstacle term from the score left the test green.
		const frame = { left: 0, top: 0, width: 960, height: 540 };
		const heading = { left: 300, top: 120, width: 400, height: 70 };
		const leftNeighbor = { left: 0, top: 100, width: 290, height: 110 };
		const { x, y } = pointerAnchor(heading, frame, [heading, leftNeighbor]);
		expect(pointerCovers(atPoint(x, y), heading), 'covers its own target').toBe(false);
		expect(pointerCovers(atPoint(x, y), leftNeighbor), 'covers the block in the margin it stepped into').toBe(false);
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
		//
		// The frame is LARGER than the slot the block leaves, deliberately. With a block exactly the
		// frame's size, the two slide-margin candidates still fit inside the frame and score
		// finite, so `pointerAnchor` returns before the clamp — an earlier version of this test was
		// named for the clamp and never reached it (removing the clamp entirely left it green).
		// The frame is SMALLER than the cursor's own footprint, so no candidate can sit inside it
		// and the clamp is the only branch left. At 960x540 the slide-margin candidates still fit
		// and score finite, so `pointerAnchor` returned before the clamp — removing the clamp
		// entirely left the earlier version of this test green.
		const frame = { left: 0, top: 0, width: 20, height: 20 };
		const full = { left: 0, top: 0, width: 20, height: 20 };
		const { x, y } = pointerAnchor(full, frame, [full]);
		// A frame this small has no in-bounds answer at all, so the clamp's job is only to keep the
		// result ON the card. Without it the fallback returns the under-the-line position, which is
		// twice the frame's height below its top.
		expect(x, 'the clamped x left the card').toBeLessThanOrEqual(20);
		expect(y, 'the clamped y left the card').toBeLessThanOrEqual(20);
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

	function frameOf(html: string, elBox: { left: number; top: number; width: number; height: number }, sel = 'p', slideW = 1280, shownAt = slideW) {
		const d = doc(html);
		// The SLIDE's own box. jsdom gives the root a zero-area rect, which falls through to the
		// classifier's constant — so a test that means to exercise the frame has to state one.
		d.documentElement.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: slideW, height: 720, right: slideW, bottom: 720, toJSON: () => ({}) }) as DOMRect;
		for (const el of d.querySelectorAll(sel)) {
			(el as HTMLElement).getBoundingClientRect = () => ({ x: elBox.left, y: elBox.top, left: elBox.left, top: elBox.top, width: elBox.width, height: elBox.height, right: elBox.left + elBox.width, bottom: elBox.top + elBox.height, toJSON: () => ({}) }) as DOMRect;
		}
		return {
			contentDocument: d,
			// `offsetWidth` is the frame's UNTRANSFORMED width and the rect is what it is shown at,
			// so their ratio is the preview's scale — the thing `frameGeom` reads.
			offsetWidth: slideW,
			getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: shownAt, height: (720 * shownAt) / slideW, right: shownAt, bottom: (720 * shownAt) / slideW, toJSON: () => ({}) }) as DOMRect,
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
		// Tops that DIFFER by a pixel or two, because that is what real inline fragments do — a line
		// carrying a `<code>` measures 11 / 12 / 11 in Chromium. Identical tops make any grouping
		// rule look correct, which is how the first version of this test stayed green against a
		// mutation that counted every rect as its own line.
		LAYOUT.set('Spend stayed disciplined.', [
			{ left: 300, top: 120, width: 90, height: 24 },
			{ left: 390, top: 121.5, width: 80, height: 21 },
			{ left: 470, top: 120.5, width: 60, height: 24 },
		]);
		const frame = frameOf('<p>Spend stayed <strong>disciplined</strong>.</p>', { left: 80, top: 118, width: 800, height: 28 });
		expect(guideCueFor(() => frame, 'Spend stayed disciplined.')?.kind).toBe('underline');
	});

	it('names the focused element only when the focused element holds the spoken words', () => {
		// `_focus:` names an ORDINAL — `row 4`, `item 3` — with no relation to which sentence is
		// being read. An unconditional re-aim is the one path here that can point at text nobody is
		// saying, which is the failure #1403 set the bar against. So the deck's call-out takes the
		// aim only when it contains the sentence; otherwise the block keeps it, at notable weight.
		LAYOUT.set('Spend stayed disciplined.', [{ left: 300, top: 120, width: 150, height: 24 }]);
		const html = '<p>Growth held. <span class="lat-focus">Spend stayed disciplined.</span></p>';
		const other = guideCueFor(() => frameOf(html, { left: 80, top: 118, width: 800, height: 28 }, 'p, span'), 'Growth held.');
		expect(other?.el.tagName, 'the aim moved to a focused element that does not hold the spoken sentence').toBe('P');
		expect(other?.strength, 'the deck still declared focus on this block').toBe('notable');
		const named = guideCueFor(() => frameOf(html, { left: 80, top: 118, width: 800, height: 28 }, 'p, span'), 'Spend stayed disciplined.');
		expect(named?.el.tagName).toBe('SPAN');
		expect(named?.target.getClientRects?.()).toMatchObject([{ left: 300, top: 120, width: 150, height: 24 }]);
	});

	it('measures the SLIDE it is on, not a constant, through the whole cue path', () => {
		// The classifier's width thresholds are fractions of the slide, and `guideCueIn` is handed
		// the frame's real width. jsdom reports a zero-area root, so a fallback constant is what
		// every other test in this file silently exercises — the wiring needs the root stubbed.
		LAYOUT.set('Growth held.', [{ left: 100, top: 100, width: 200, height: 30 }]);
		const narrow = frameOf('<p>Growth held.</p>', { left: 100, top: 100, width: 200, height: 30 }, 'p', 640);
		const wide = frameOf('<p>Growth held.</p>', { left: 100, top: 100, width: 200, height: 30 }, 'p', 3840);
		expect(guideCueFor(() => narrow, 'Growth held.')?.kind).toBe('underline');
		expect(guideCueFor(() => wide, 'Growth held.')?.kind).toBe('tap');
	});

	it('converts the cursor’s footprint into the SLIDE’s units, not the parent’s', () => {
		// The cursor's 28px lives in the parent document and does NOT shrink with the preview, so
		// inside a slide shown at half size it covers twice as much. Getting this backwards clears
		// the text on an unscaled Playground and covers it in the scaled Studio — which is why the
		// conversion has a name in `POINTER_BOX`'s comment. Same slide, same neighbor, two scales:
		// at 1:1 the hand fits in the gap and the stroke's own ending stands; at 1:2 it does not.
		const html = '<p>Growth held.</p><p>Neighbor.</p>';
		const withGap = (shownAt: number) => {
			const d = doc(html);
			d.documentElement.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720, toJSON: () => ({}) }) as DOMRect;
			const [a, b] = [...d.querySelectorAll('p')] as HTMLElement[];
			a.getBoundingClientRect = () => ({ x: 0, y: 0, left: 100, top: 100, width: 300, height: 24, right: 400, bottom: 124, toJSON: () => ({}) }) as DOMRect;
			b.getBoundingClientRect = () => ({ x: 0, y: 0, left: 440, top: 165, width: 260, height: 35, right: 700, bottom: 200, toJSON: () => ({}) }) as DOMRect;
			return {
				contentDocument: d,
				offsetWidth: 1280,
				getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: shownAt, height: 720, right: shownAt, bottom: 720, toJSON: () => ({}) }) as DOMRect,
			} as unknown as HTMLIFrameElement;
		};
		expect(guideCueFor(() => withGap(1280), 'Growth held.')?.rest, 'at 1:1 the hand fits the gap').toBeNull();
		expect(guideCueFor(() => withGap(640), 'Growth held.')?.rest, 'at 1:2 the footprint is twice as wide in slide units and no longer fits').not.toBeNull();
	});

	it('treats a resting place off the slide card as occupied', () => {
		// `pointerAnchor` has always refused a candidate that is not inside the frame — a pointer
		// half off the card reads as a bug, not a gesture. The geometry path checked only against
		// BLOCKS, so "past the block's right edge" could run off the slide with nothing there to
		// object; measured, ten gestures in the corpus came to rest on the Present backdrop.
		LAYOUT.set('Growth held.', [{ left: 300, top: 100, width: 90, height: 24 }]);
		const frame = frameOf('<p>Growth held.</p>', { left: 300, top: 100, width: 90, height: 24 }, 'p', 400);
		expect(guideCueFor(() => frame, 'Growth held.')?.rest, 'the stroke ends past the right edge of the slide itself').not.toBeNull();
	});

	it('always hands back a rest for `circle`, whose orbit has no deterministic ending', () => {
		// Every other kind rides its own stroke's end. `circle` ends a quarter turn past wherever
		// the cursor came in from, so the host has nothing to reason about unless it supplies one.
		LAYOUT.set('Growth held.', [{ left: 400, top: 300, width: 180, height: 64 }]);
		const frame = frameOf('<p>Growth held.</p>', { left: 400, top: 300, width: 180, height: 64 });
		const cue = guideCueFor(() => frame, 'Growth held.');
		expect(cue?.kind).toBe('circle');
		expect(cue?.rest).not.toBeNull();
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

	it('checks the rest against the WORDS on the slide, not the boxes around them', () => {
		// A block's bounding box is not its text: a card is mostly padding, a table cell mostly
		// gap. Checking boxes rejected the clear space beside a target and pushed the cue onto the
		// fallback search — the mechanism this pins is that the check reads line rects.
		//
		// The cell below is positioned so its BOX covers where the underline would leave the hand
		// and its TEXT does not. `rest` is null when the stroke's own ending was fine and non-null
		// when the search had to be asked, so it is the observable.
		LAYOUT.set('Growth held.', [{ left: 80, top: 120, width: 300, height: 24 }]);
		LAYOUT.set('Q3 actuals', [{ left: 450, top: 260, width: 100, height: 20 }]);
		const d = doc('<p>Growth held.</p><table><tbody><tr><td>Q3 actuals</td></tr></tbody></table>');
		d.documentElement.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720, toJSON: () => ({}) }) as DOMRect;
		const put = (sel: string, b: { left: number; top: number; width: number; height: number }) => {
			const el = d.querySelector(sel) as HTMLElement;
			el.getBoundingClientRect = () => ({ x: b.left, y: b.top, left: b.left, top: b.top, width: b.width, height: b.height, right: b.left + b.width, bottom: b.top + b.height, toJSON: () => ({}) }) as DOMRect;
		};
		put('p', { left: 80, top: 120, width: 300, height: 24 });
		put('td', { left: 400, top: 100, width: 300, height: 200 });
		const frame = {
			contentDocument: d,
			offsetWidth: 1280,
			getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720, toJSON: () => ({}) }) as DOMRect,
		} as unknown as HTMLIFrameElement;
		const cue = guideCueFor(() => frame, 'Growth held.');
		expect(cue?.kind).toBe('underline');
		expect(cue?.rest, 'the stroke ended in clear space, so nothing should have overridden it').toBeNull();
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

describe('the geometry the classifier is handed, and the units it is handed in', () => {
	// Every one of these was a silent mutant: change the source and nothing failed, because jsdom
	// reports a zero-area root and a zero-area element, so the real inputs were never exercised.

	it('measures the slide, not a constant, when the frame can be measured', () => {
		// `guideCueIn` takes the slide's own width and every width threshold is a fraction of it.
		// A 200px-wide target is "small" on a 3840 deck and "wide" on a 640 one.
		const box = { left: 0, top: 0, width: 200, height: 30 };
		const wide = chooseGesture({ box, lines: 1, slideW: 3840, role: 'body', enclosed: false, textless: false });
		const narrow = chooseGesture({ box, lines: 1, slideW: 640, role: 'body', enclosed: false, textless: false });
		expect(wide).toBe('tap');
		expect(narrow).toBe('underline');
	});

	it('keeps a cue out when the element it named has gone', () => {
		// The rect source answers "nowhere" once its element leaves the document, which is the
		// contract Vetrina's `liveRect` reads as no position at all. Without it a detached node's
		// all-zero rect maps to the frame's own corner and the cursor flies there.
		const d = doc('<p>Growth held.</p>');
		const p = d.querySelector('p') as HTMLElement;
		p.getBoundingClientRect = () => ({ x: 0, y: 0, left: 10, top: 20, width: 100, height: 30, right: 110, bottom: 50, toJSON: () => ({}) }) as DOMRect;
		const frame = {
			contentDocument: d,
			offsetWidth: 100,
			getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, toJSON: () => ({}) }) as DOMRect,
		} as unknown as HTMLIFrameElement;
		const cue = guideCueFor(() => frame, 'Growth held.');
		expect(cue?.target.getBoundingClientRect().width).toBeGreaterThan(0);
		p.remove();
		expect(cue?.target.getBoundingClientRect()).toMatchObject({ left: 0, width: 0 });
		expect(cue?.target.getClientRects?.()).toEqual([]);
	});

	it('refuses a target with no area rather than gesturing at a point', () => {
		const d = doc('<p>Growth held.</p>');
		const p = d.querySelector('p') as HTMLElement;
		p.getBoundingClientRect = () => ({ x: 0, y: 0, left: 10, top: 20, width: 0, height: 0, right: 10, bottom: 20, toJSON: () => ({}) }) as DOMRect;
		const frame = {
			contentDocument: d,
			offsetWidth: 100,
			getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, toJSON: () => ({}) }) as DOMRect,
		} as unknown as HTMLIFrameElement;
		expect(guideCueFor(() => frame, 'Growth held.')).toBeNull();
	});

	it('checks the resting place against the slide’s OWN blocks', () => {
		// §"position is a consequence" leans on exactly one mechanical check: the geometric rest,
		// tested against every block on the slide. With the obstacle list empty nothing ever falls
		// back, and the fallback is what stops the hand landing on the next column.
		const d = doc('<p>Growth held.</p><p>Another block sits exactly where the hand would go.</p>');
		const [a, b] = [...d.querySelectorAll('p')] as HTMLElement[];
		a.getBoundingClientRect = () => ({ x: 0, y: 0, left: 10, top: 20, width: 100, height: 24, right: 110, bottom: 44, toJSON: () => ({}) }) as DOMRect;
		b.getBoundingClientRect = () => ({ x: 0, y: 0, left: 110, top: 20, width: 200, height: 60, right: 310, bottom: 80, toJSON: () => ({}) }) as DOMRect;
		const frame = {
			contentDocument: d,
			offsetWidth: 400,
			getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, toJSON: () => ({}) }) as DOMRect,
		} as unknown as HTMLIFrameElement;
		expect(guideCueFor(() => frame, 'Growth held.')?.rest, 'the hand rests past the block, straight onto its neighbor').not.toBeNull();
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

// ── THE HANDLE — what a hand actually points AT (round three) ────────────────────────────────
//
// Round two picked a gesture from the container's geometry, and drew a box around a card that had
// a border, a box around a timeline stage that was a node on a rail, and an underline under a
// bullet whose bullet was right there. These pin the three mechanisms that replaced it.
//
// SCOPE, STATED: jsdom has no layout and no pseudo-elements, so the geometry here is STUBBED —
// which makes these tests about the RULES, not about real slides. The real-surface evidence for
// the rules is `npm run sweep:guide` (126 committed decks rendered in Chromium, driving this
// module) and `docs/e2e/present-guide.spec.ts`. Neither of those is replaced by anything below.

describe('hasOwnBoundary — the redundant-boundary rule', () => {
	// A DOMParser document has NO defaultView, so `getComputedStyle` is unreachable there and every
	// style-driven rule degrades to "no boundary / no marker" — which is the safe fallback and is
	// what the older suites in this file exercise. To test the rules themselves the element has to
	// live in a document that HAS a window, so these mount into the real one.
	const styled = (css: Partial<CSSStyleDeclaration>) => {
		const host = document.createElement('div');
		host.innerHTML = '<p>x</p>';
		document.body.appendChild(host);
		const el = host.querySelector('p') as Element;
		const view = window as unknown as { getComputedStyle: (e: Element, p?: string | null) => CSSStyleDeclaration };
		const base: Record<string, string> = {
			'border-top-width': '0px',
			'border-right-width': '0px',
			'border-bottom-width': '0px',
			'border-left-width': '0px',
			'border-top-style': 'none',
			'border-right-style': 'none',
			'border-bottom-style': 'none',
			'border-left-style': 'none',
			'border-top-color': 'rgb(0, 0, 0)',
			'border-right-color': 'rgb(0, 0, 0)',
			'border-bottom-color': 'rgb(0, 0, 0)',
			'border-left-color': 'rgb(0, 0, 0)',
		};
		const decl = {
			getPropertyValue: (k: string) => base[k] ?? '',
			backgroundColor: 'rgba(0, 0, 0, 0)',
			backgroundImage: 'none',
			boxShadow: 'none',
			...css,
		} as unknown as CSSStyleDeclaration;
		view.getComputedStyle = () => decl;
		return el;
	};
	const realStyle = window.getComputedStyle;
	afterEach(() => {
		window.getComputedStyle = realStyle;
		document.body.innerHTML = '';
	});

	it('sees a real border', () => {
		const el = styled({
			getPropertyValue: (k: string) =>
				k === 'border-left-width' ? '1px' : k === 'border-left-style' ? 'solid' : k === 'border-left-color' ? 'rgb(20, 30, 40)' : k.endsWith('style') ? 'none' : k.endsWith('color') ? 'rgb(0, 0, 0)' : '0px',
		} as unknown as Partial<CSSStyleDeclaration>);
		expect(hasOwnBoundary(el)).toBe(true);
	});

	it('sees a fill', () => {
		expect(hasOwnBoundary(styled({ backgroundColor: 'rgb(242, 245, 250)' } as Partial<CSSStyleDeclaration>))).toBe(true);
	});

	// ── SVG PAINT ────────────────────────────────────────────────────────────────────────────
	// A chart mark is a solid region and has no `background-color` — its paint is `fill`. Reading
	// only the CSS box properties reported "no boundary" for every filled mark, so `bracket` drew
	// a second outline around an already-filled cell: measured at 15 of 90 on a real heatmap.
	// Those elements became targets for the first time when the mark tier landed, so this is a
	// regression that change would have introduced rather than a pre-existing one.
	const svgStyled = (css: Record<string, string>) => {
		const host = document.createElement('div');
		host.innerHTML = '<svg><polygon points="0,0 10,0 10,10"></polygon></svg>';
		document.body.appendChild(host);
		const el = host.querySelector('polygon') as Element;
		const view = window as unknown as { getComputedStyle: (e: Element, p?: string | null) => CSSStyleDeclaration };
		view.getComputedStyle = () =>
			({
				getPropertyValue: (k: string) => css[k] ?? (k.endsWith('style') ? 'none' : k.endsWith('color') ? 'rgb(0, 0, 0)' : '0px'),
				backgroundColor: 'rgba(0, 0, 0, 0)',
				backgroundImage: 'none',
				boxShadow: 'none',
			}) as unknown as CSSStyleDeclaration;
		return el;
	};

	it('sees an SVG mark’s fill as its own boundary', () => {
		expect(hasOwnBoundary(svgStyled({ fill: 'oklab(0.515679 0.02 -0.08)' }))).toBe(true);
	});

	it('does not read `fill: none` or a transparent fill as a boundary', () => {
		expect(hasOwnBoundary(svgStyled({ fill: 'none' }))).toBe(false);
		expect(hasOwnBoundary(svgStyled({ fill: 'rgba(0, 0, 0, 0)' }))).toBe(false);
	});

	it('does NOT see a fully transparent shadow, which half the slide inherits', () => {
		// Chromium reports `rgba(0, 0, 0, 0) 0px 0px 0px 0px` for an element that merely sits in a
		// shadow token's scope. Reading that as a boundary would exempt most of a deck from
		// `bracket` and quietly turn the redundant-boundary rule into "never bracket anything".
		expect(hasOwnBoundary(styled({ boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 0px' } as Partial<CSSStyleDeclaration>))).toBe(false);
		expect(hasOwnBoundary(styled({ backgroundColor: 'rgba(0, 0, 0, 0)' } as Partial<CSSStyleDeclaration>))).toBe(false);
	});

	it('sees a real shadow', () => {
		expect(hasOwnBoundary(styled({ boxShadow: 'rgba(10, 12, 20, 0.18) 0px 2px 8px 0px' } as Partial<CSSStyleDeclaration>))).toBe(true);
	});

	it('reads EVERY layer of a shadow list, not the first', () => {
		// Lattice's finish tokens compose a shadow out of a transparent placeholder plus a real
		// layer (`box-shadow: var(--tone-rail, 0 0 transparent), var(--fin-frame, …)`). Reading only
		// the first color reported a genuine drop shadow as no boundary at all, and `bracket` drew
		// its second outline around a card that already had one.
		expect(hasOwnBoundary(styled({ boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(10, 12, 20, 0.35) 0px 2px 6px 0px' } as Partial<CSSStyleDeclaration>))).toBe(true);
		expect(hasOwnBoundary(styled({ boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 2px 6px 0px' } as Partial<CSSStyleDeclaration>))).toBe(false);
	});

	it('understands the color syntaxes Chromium actually serializes', () => {
		// `color-mix(… 0%, transparent)` computes to `color(srgb 0 0 0 / 0)` and an `oklch` fill to
		// `oklch(… / 0)`. An unparsed color reads as OPAQUE, which invents a boundary and silently
		// retires `bracket` on whatever carries it — and `dist/lattice.css` is full of `color-mix`.
		expect(hasOwnBoundary(styled({ backgroundColor: 'color(srgb 0 0 0 / 0)' } as Partial<CSSStyleDeclaration>))).toBe(false);
		expect(hasOwnBoundary(styled({ backgroundColor: 'oklch(0.6 0.2 250 / 0)' } as Partial<CSSStyleDeclaration>))).toBe(false);
		expect(hasOwnBoundary(styled({ backgroundColor: 'oklab(0.6 0.1 -0.1 / 0.4)' } as Partial<CSSStyleDeclaration>))).toBe(true);
		expect(hasOwnBoundary(styled({ backgroundColor: 'rgb(20 30 40 / 0)' } as Partial<CSSStyleDeclaration>))).toBe(false);
	});
});

describe('chooseGesture — the semantic rules that come before the measurements', () => {
	const W = 1280;
	const shape = (extra: Partial<GuideShape>): GuideShape => ({
		box: { left: 0, top: 0, width: 400, height: 200 },
		lines: 6,
		slideW: W,
		role: 'body',
		enclosed: false,
		textless: false,
		...extra,
	});

	it('never draws a second boundary around something that already has one', () => {
		// Gestalt common region: a bordered card is ALREADY grouped, and an outline around it makes
		// the eye choose between two nested regions. This is the "no box on the timeline items"
		// report, stated as a rule.
		expect(chooseGesture(shape({ enclosed: false }))).toBe('bracket');
		expect(chooseGesture(shape({ enclosed: true }))).toBe('wash');
	});

	it('rings a substantial marker and taps a small one', () => {
		// A rail disc or a criteria index has enough of itself to ring. A `disc` bullet is ~9px on a
		// 1280 deck, and a ring around it would be mostly empty space.
		expect(chooseGesture(shape({ role: 'marker', box: { left: 0, top: 0, width: 23, height: 23 } }))).toBe('circle');
		expect(chooseGesture(shape({ role: 'marker', box: { left: 0, top: 0, width: 9, height: 9 } }))).toBe('tap');
	});

	it('names a marker as a marker whatever its container measures', () => {
		// The container is 1152x98 and encloses itself; none of that reaches the choice. This is
		// the whole point of asking what the thing IS before asking how big it is.
		expect(chooseGesture(shape({ role: 'marker', box: { left: 0, top: 0, width: 75, height: 98 }, lines: 9, enclosed: true }))).toBe('circle');
	});

	it('still lets a phrase win over everything', () => {
		expect(chooseGesture(shape({ role: 'phrase', enclosed: true }))).toBe('wash');
	});
});

describe('markerBox — deriving a bullet nobody can measure', () => {
	const realStyle = window.getComputedStyle;
	afterEach(() => {
		window.getComputedStyle = realStyle;
		document.body.innerHTML = '';
	});

	/** A `<li>` with a stubbed box, first line, computed style and `::before`. */
	function li(opts: {
		box: { left: number; top: number; width: number; height: number };
		line: { left: number; top: number; width: number; height: number };
		style?: Record<string, string>;
		before?: Record<string, string>;
		gutter?: string;
	}) {
		const host = document.createElement('div');
		host.innerHTML = '<ul><li>Renewal risk clustered at the ceiling.</li></ul>';
		document.body.appendChild(host);
		const el = host.querySelector('li') as Element;
		const r = (b: { left: number; top: number; width: number; height: number }) =>
			({ x: b.left, y: b.top, left: b.left, top: b.top, width: b.width, height: b.height, right: b.left + b.width, bottom: b.top + b.height, toJSON: () => ({}) }) as DOMRect;
		(el as HTMLElement).getBoundingClientRect = () => r(opts.box);
		const view = window as unknown as { getComputedStyle: (e: Element, p?: string | null) => CSSStyleDeclaration };
		view.getComputedStyle = (target: Element, pseudo?: string | null) => {
			if (pseudo === '::before') return { content: 'none', display: 'inline', width: 'auto', height: 'auto', ...(opts.before ?? {}) } as unknown as CSSStyleDeclaration;
			if (pseudo === '::marker') return { fontSize: '21.4px' } as unknown as CSSStyleDeclaration;
			if (target !== el) return { paddingLeft: opts.gutter ?? '24px' } as unknown as CSSStyleDeclaration;
			return { listStyleType: 'disc', listStylePosition: 'outside', listStyleImage: 'none', fontSize: '21.4px', ...(opts.style ?? {}) } as unknown as CSSStyleDeclaration;
		};
		return { el, line: opts.line };
	}

	it('finds a `list-style: disc` marker in the parent list’s gutter, OUTSIDE the item', () => {
		// `list-style-position: outside` is the default and what every Lattice list uses: the
		// bullet is painted left of the item's own box, in the list's padding.
		const { el, line } = li({ box: { left: 529, top: 111, width: 294, height: 70 }, line: { left: 529, top: 113, width: 258, height: 27 } });
		const m = markerBox(el, line) as Box;
		expect(m).not.toBeNull();
		expect(m.left + m.width).toBeCloseTo(529, 6); // flush against the item's leading edge
		expect(m.width).toBeCloseTo(21.4 * 0.42, 3); // the GLYPH, not the 24px gutter it sits in
	});

	it('measures the glyph, not the gutter — the difference decides ring vs tap', () => {
		// A gutter is authored for the widest marker the list will hold. Measuring it reported a
		// 9px bullet at 19px, which crossed the ring threshold that the real bullet does not.
		const wide = li({ box: { left: 0, top: 0, width: 300, height: 40 }, line: { left: 0, top: 4, width: 280, height: 27 }, gutter: '96px' });
		expect((markerBox(wide.el, wide.line) as Box).width).toBeLessThan(12);
	});

	it('finds a `::before` rail disc ABOVE its label, centered when the label is', () => {
		// list-steps.timeline: the disc is a flex child at the top of a centered column.
		const { el, line } = li({
			box: { left: 112, top: 3187, width: 162, height: 181 },
			line: { left: 133, top: 3218, width: 120, height: 39 },
			style: { listStyleType: 'none', listStylePosition: 'outside', listStyleImage: 'none', fontSize: '15px' },
			before: { content: 'counter(x)', display: 'flex', width: '23.4px', height: '23.4px' },
		});
		const m = markerBox(el, line) as Box;
		expect(m.top).toBeCloseTo(3187, 6);
		expect(m.width).toBeCloseTo(23.4, 3);
		expect(m.left + m.width / 2).toBeCloseTo(112 + 162 / 2, 1); // centered on the item
	});

	it('finds a `::before` index in the LEFT gutter, spanning the item', () => {
		// list takeaway numbered (lead + gloss row): an absolutely-placed number, as tall as the row.
		const { el, line } = li({
			box: { left: 64, top: 3778, width: 1152, height: 98 },
			line: { left: 577, top: 3790, width: 182, height: 34 },
			style: { listStyleType: 'none', listStylePosition: 'outside', listStyleImage: 'none', fontSize: '22px' },
			before: { content: 'counter(x)', display: 'flex', width: '74.6px', height: '97.5px' },
		});
		const m = markerBox(el, line) as Box;
		expect(m.left).toBeCloseTo(64, 6);
		expect(m.width).toBeCloseTo(74.6, 3);
	});

	it('refuses when there is no marker at all', () => {
		const { el, line } = li({
			box: { left: 0, top: 0, width: 300, height: 40 },
			line: { left: 0, top: 4, width: 280, height: 27 },
			style: { listStyleType: 'none', listStylePosition: 'outside', listStyleImage: 'none', fontSize: '21.4px' },
		});
		expect(markerBox(el, line)).toBeNull();
	});

	it('refuses when the gap does not agree with the pseudo’s own size', () => {
		// A `::before` that is neither above the text nor left of it is not a marker — it is
		// decoration this has no business locating. Guessing would put ink on empty space.
		const { el, line } = li({
			box: { left: 0, top: 0, width: 300, height: 40 },
			line: { left: 1, top: 1, width: 280, height: 27 },
			style: { listStyleType: 'none', listStylePosition: 'outside', listStyleImage: 'none', fontSize: '21.4px' },
			before: { content: '""', display: 'block', width: '40px', height: '40px' },
		});
		expect(markerBox(el, line)).toBeNull();
	});

	it('is only ever asked of a list item', () => {
		const d = doc('<p>Renewal risk clustered at the ceiling.</p>');
		expect(markerBox(d.querySelector('p') as Element, { left: 0, top: 0, width: 100, height: 20 })).toBeNull();
	});

	it('degrades to "no marker" where computed styles are unreachable', () => {
		// A parsed, window-less document — which is exactly what a torn-down preview frame looks
		// like. The answer has to be "no handle", never a throw and never a guessed rectangle.
		const d = doc('<ul><li>Renewal risk clustered at the ceiling.</li></ul>');
		expect(markerBox(d.querySelector('li') as Element, { left: 0, top: 0, width: 100, height: 20 })).toBeNull();
	});
});

describe('headerRange — a card’s own leading text', () => {
	it('takes a `<strong>` label before a nested list', () => {
		const d = doc('<ul><li><strong>Build everything</strong><ul><li>Owns the plumbing.</li></ul></li></ul>');
		expect(headerRange(d.querySelector('li') as Element)?.toString().trim()).toBe('Build everything');
	});

	it('takes a BARE TEXT NODE before a nested list — cards-grid ships no element for its title', () => {
		// One range covers both shapes, which is why this is a range and not a `querySelector` for
		// whatever tag a given component happens to use for its header.
		const d = doc('<ul><li>Ship the connectors<ul><li>Six weeks, two engineers.</li></ul></li></ul>');
		expect(headerRange(d.querySelector('li') as Element)?.toString().trim()).toBe('Ship the connectors');
	});

	it('accepts a one-character header — a stats value is "7"', () => {
		// A two-character floor handed back a header for "42%" and "18 days" and the whole card for
		// "7", so the same slide cued its three figures three different ways.
		const d = doc('<ul><li><strong>7</strong><ul><li>Competitive losses.</li></ul></li></ul>');
		expect(headerRange(d.querySelector('li') as Element)?.toString().trim()).toBe('7');
	});

	it('is null when there is no nested block — that is just text, not a card', () => {
		const d = doc('<ul><li>Renewal risk clustered at the ceiling.</li></ul>');
		expect(headerRange(d.querySelector('li') as Element)).toBeNull();
	});

	it('is null when the nested block comes FIRST — there is no leading text to take', () => {
		expect(headerRange(doc('<ul><li><ul><li>a</li></ul>trailing</li></ul>').querySelector('li') as Element)).toBeNull();
	});

	it('is ended by a BLOCK, not by any element — inline markup stays inside the header', () => {
		// A card title is routinely `Ship the <strong>connectors</strong>`. Ending the header at the
		// first element child would cut it at "Ship the", which is what the header is supposed to
		// stop happening.
		const d = doc('<ul><li>Ship the <strong>connectors</strong> now<ul><li>Six weeks.</li></ul></li></ul>');
		expect(headerRange(d.querySelector('li') as Element)?.toString().trim()).toBe('Ship the connectors now');
	});
});

describe('findSpanningTarget — a cue the projection built out of two blocks', () => {
	const OPTION = '<div class="option"><strong>Build everything</strong><ul><li>Owns the plumbing and the scoring alike</li><li>Two engineer-quarters before anyone scores</li></ul></div>';
	const STAT = '<ul><li><strong>42%</strong><ul><li>Renewal risk caught before the CRM noticed</li></ul></li><li><strong>7</strong><ul><li>Competitive losses, one competitor</li></ul></li></ul>';

	it('names the card when a cue joins its label to its first body line', () => {
		// The reported symptom: split-compare's FIRST bullet was not cued and the others were,
		// because "Build everything: Owns the plumbing…" is in no single block.
		const d = doc(OPTION);
		expect(findCueTarget(d, 'Build everything: Owns the plumbing and the scoring alike.')?.className).toBe('option');
	});

	it('resolves a stats figure whose VALUE is too short to search on its own', () => {
		// `loose('7.')` is one character. Requiring two SEARCHABLE parts threw the whole cue away
		// and every stats slide went dark; the SPLIT is the evidence the cue was joined.
		const d = doc(STAT);
		const el = findCueTarget(d, 'Competitive losses, one competitor: 7.');
		expect(el?.tagName).toBe('LI');
		expect(el?.textContent).toContain('7');
	});

	it('cues every figure on a stats slide the same way, whatever its digits', () => {
		const d = doc(STAT);
		const a = findCueTarget(d, 'Renewal risk caught before the CRM noticed: 42%.');
		const b = findCueTarget(d, 'Competitive losses, one competitor: 7.');
		expect(a?.tagName).toBe(b?.tagName);
		expect(a).not.toBe(b);
	});

	it('refuses to climb to the group when the container is much bigger than the cue', () => {
		// "Widen the search until something matches" is how a cursor ends up pointing at the slide.
		const d = doc(`<div class="wrap">${OPTION}<p>${'Unrelated prose. '.repeat(40)}</p></div>`);
		const el = findCueTarget(d, 'Build everything: Owns the plumbing and the scoring alike.');
		expect(el?.className).toBe('option'); // the option still fits; the wrapper never would
	});

	it('falls back to the longest matching block when the only container that holds it all is the slide', () => {
		// The halves of this cue live in DIFFERENT cards, so the smallest element containing both is
		// the wrapper holding everything on the slide. Without the bound the climb hands that back
		// and the cursor names the whole slide; with it, the answer is the block that carries most
		// of what is being said. The other test cannot reach this branch — there the option holds
		// both halves and the climb returns before the bound is ever consulted.
		const d = doc(
			'<div class="wrap">' +
				`<div class="card"><p>Connectors ship in six weeks</p><p>${'Filler prose that pads this card out. '.repeat(6)}</p></div>` +
				`<div class="card"><p>Engineering stays on the scoring</p><p>${'More filler prose padding the second card. '.repeat(6)}</p></div>` +
				'</div>',
		);
		const el = findCueTarget(d, 'Connectors ship in six weeks: Engineering stays on the scoring.');
		expect(el?.tagName).toBe('P');
		expect(el?.textContent).toContain('Engineering stays on the scoring');
	});

	it('never names the slide itself, however sparse it is', () => {
		// The bound that was inert: `node !== root` compared an Element with a Document, so it could
		// never be true, and a slide holding one heading and one paragraph climbed to the `<section>`
		// and underlined 1,152px of itself. Found by the red team in a real Chromium.
		const d = new DOMParser().parseFromString('<html><body><section><h1>Build everything</h1><p>Owns the plumbing</p></section></body></html>', 'text/html');
		const el = findCueTarget(d, 'Build everything: Owns the plumbing');
		expect(el?.tagName).not.toBe('SECTION');
		expect(el?.tagName).not.toBe('BODY');
	});

	it('hides rather than name a block carrying a fraction of the sentence', () => {
		// The reach guard. Round two measured that relaxing the matcher bought reach by landing on
		// elements holding less than half the spoken sentence, and refused it. A partial answer that
		// small is worse than the hide it replaced, so it IS the hide.
		//
		// The half that has to be true for this to reach the guard at all: the FIRST part is on the
		// slide, so the piecewise matcher finds a real block and gets as far as weighing it. A cue
		// whose halves are both absent would return null one branch earlier and prove nothing.
		expect(findCueTarget(doc('<p>Legal review</p>'), 'Legal review: and then a great many further words that this slide does not contain anywhere at all')).toBeNull();
		// …and the same SHAPE — one half on the slide, one half not — still resolves when the half
		// that matched is most of what is being said.
		expect(findCueTarget(doc('<p>Legal review surfaced as the pipeline chokepoint</p>'), 'Legal review surfaced as the pipeline chokepoint: yes')?.tagName).toBe('P');
	});

	it('leaves an ordinary sentence alone — no split, no fallback', () => {
		const d = doc('<p>Expansion outran churn every month.</p>');
		expect(findSpanningTarget(d, 'Expansion outran churn every month.')).toBeNull();
	});

	it('is null when neither half of a joined cue is on the slide', () => {
		expect(findSpanningTarget(doc('<p>Something else entirely.</p>'), 'Build everything: Owns the plumbing.')).toBeNull();
	});
});

describe('guideCueIn — the whole decision, on an item with a real marker', () => {
	// The one test that drives the marker path end to end. It has to live in the REAL document
	// (a parsed one has no `defaultView`, so `getComputedStyle` is unreachable and every marker
	// rule degrades to "no handle") with both layout seams stubbed: `getComputedStyle` for the
	// marker's own metrics, `Range.prototype.getClientRects` for where the words are.
	const realStyle = window.getComputedStyle;
	const realRects = Range.prototype.getClientRects;
	const LAYOUT = new Map<string, { left: number; top: number; width: number; height: number }[]>();
	const rect = (b: { left: number; top: number; width: number; height: number }) =>
		({ x: b.left, y: b.top, left: b.left, top: b.top, width: b.width, height: b.height, right: b.left + b.width, bottom: b.top + b.height, toJSON: () => ({}) }) as DOMRect;

	afterEach(() => {
		window.getComputedStyle = realStyle;
		Range.prototype.getClientRects = realRects;
		document.body.innerHTML = '';
		LAYOUT.clear();
	});

	function slide() {
		const host = document.createElement('div');
		host.innerHTML = '<ul><li>Renewal risk clustered at the segment ceiling.</li></ul>';
		document.body.appendChild(host);
		const li = host.querySelector('li') as HTMLElement;
		const ul = host.querySelector('ul') as HTMLElement;
		li.getBoundingClientRect = () => rect({ left: 100, top: 200, width: 400, height: 30 });
		LAYOUT.set('Renewal risk clustered at the segment ceiling.', [{ left: 100, top: 202, width: 380, height: 26 }]);
		Range.prototype.getClientRects = function () {
			return (LAYOUT.get(this.toString()) ?? []).map(rect) as unknown as DOMRectList;
		};
		window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
			if (pseudo === '::before') return { content: 'none', display: 'inline', width: 'auto', height: 'auto' } as unknown as CSSStyleDeclaration;
			if (pseudo === '::marker') return { fontSize: '20px' } as unknown as CSSStyleDeclaration;
			if (el === ul) return { paddingLeft: '24px' } as unknown as CSSStyleDeclaration;
			return {
				listStyleType: 'disc',
				listStylePosition: 'outside',
				listStyleImage: 'none',
				fontSize: '20px',
				lineHeight: '26px',
				backgroundColor: 'rgba(0, 0, 0, 0)',
				backgroundImage: 'none',
				boxShadow: 'none',
				paddingLeft: '0px',
				getPropertyValue: (k: string) => (k.endsWith('-width') ? '0px' : k.endsWith('-style') ? 'none' : 'rgb(0, 0, 0)'),
			} as unknown as CSSStyleDeclaration;
		}) as typeof window.getComputedStyle;
		return host;
	}

	it('names the bullet, and leaves the hand in the margin OUTSIDE it — not on the words', () => {
		const host = slide();
		const d = guideCueIn(host, 'Renewal risk clustered at the segment ceiling.', { left: 0, top: 0, width: 1280, height: 720 }, 14, 19);
		expect(d?.role).toBe('marker');
		expect(d?.kind).toBe('tap');
		// The bullet: one glyph-width, flush against the item's leading edge, in the list's gutter.
		expect(d?.box.width).toBeCloseTo(20 * 0.42, 3);
		expect((d as NonNullable<typeof d>).box.left + (d as NonNullable<typeof d>).box.width).toBeCloseTo(100, 6);
		// THE ENDING IS ON THE FAR SIDE. Every library ending is derived from a stroke over text,
		// and a bullet's text is to its RIGHT — so `tap`'s own down-and-right ending lands on the
		// words. `fellBack` is the sharp half of this oracle: the search is not merely unused, the
		// geometric answer was never occupied in the first place.
		expect(d?.rest?.x).toBeLessThan((d as NonNullable<typeof d>).box.left);
		expect(d?.fellBack, 'the marker rest was occupied, so the search had to be asked').toBe(false);
	});
});

describe('findMarkTarget — a cue whose words are not on the slide at all', () => {
	// The real funnel, as `funnel.transform.js` emits it: the band carries what it means, and
	// the value is rendered in DIGITS while `chart-narration.js` narrates it in WORDS.
	const FUNNEL = `<svg><g>
		<polygon class="funnel-band" data-mark="0" data-label="Visitors" data-value="12,000"></polygon>
		<polygon class="funnel-band" data-mark="1" data-label="Signups" data-value="4,800"></polygon>
		<polygon class="funnel-band" data-mark="2" data-label="Paid" data-value="864"></polygon>
	</g></svg>`;

	it('names the band a spelled-out cue is about, though the words are nowhere in the DOM', () => {
		// The measured defect: `funnel` resolved 15.8% of its cues, because the slide says
		// "12,000" and the narration says "twelve thousand". No text matcher can join those.
		const d = doc(FUNNEL);
		const el = findCueTarget(d, 'Visitors: twelve thousand.');
		expect(el?.getAttribute('data-label')).toBe('Visitors');
	});

	it('tells the bands apart — each cue lands on its own', () => {
		const d = doc(FUNNEL);
		expect(findCueTarget(d, 'Signups: four thousand eight hundred, forty percent of the prior stage.')?.getAttribute('data-mark')).toBe('1');
		expect(findCueTarget(d, 'Paid: eight hundred sixty-four, forty percent of the prior stage.')?.getAttribute('data-mark')).toBe('2');
	});

	it('accepts the digits too, for a cue that was never spelled out', () => {
		const d = doc(FUNNEL);
		expect(findCueTarget(d, 'Visitors: 12,000.')?.getAttribute('data-label')).toBe('Visitors');
	});

	it('refuses a mark whose value the cue never says, in either spelling', () => {
		// The corroboration is the guard: a label that leads the sentence but names a different
		// number is a different mark, and answering it would be the reverse-containment mistake
		// in a new costume.
		const d = doc(FUNNEL);
		expect(findCueTarget(d, 'Visitors: nine hundred.')).toBeNull();
	});

	it('refuses a recurring label EVEN WHEN the value corroborates', () => {
		// The case that isolates the lead guard from the value guard. The sentence carries both
		// "Visitors" and "twelve thousand", so corroboration passes and only the lead rule can
		// refuse it — a sentence ABOUT the funnel is not a sentence about one band. Written
		// because the first version of the test above was killed by the value guard instead,
		// and relaxing the lead rule to `includes` left it green.
		//
		// Asserted on THIS tier. Through the whole chain the paraphrase tier now names the Visitors
		// band, which is right: the sentence says its label and its value.
		const d = doc(FUNNEL);
		expect(findMarkTarget(d, 'In total, Visitors reached twelve thousand.')).toBeNull();
	});

	it('hides rather than guesses when two marks both pass', () => {
		const d = doc(`<svg><g>
			<polygon data-label="Region" data-value="40"></polygon>
			<polygon data-label="Region" data-value="40"></polygon>
		</g></svg>`);
		expect(findCueTarget(d, 'Region: forty.')).toBeNull();
	});

	it('runs LAST — a cue a real block holds still resolves to the block', () => {
		// The tier is a pure addition by construction. If it could outrank the block matcher it
		// would be changing answers that were already right, which no measurement here covers.
		//
		// The label must sit on something OTHER than the block holding the words, or both orders
		// return the same node and the arm proves nothing — which is what the first version did.
		const d = doc(`<p>Visitors: twelve thousand.</p>${FUNNEL}`);
		expect(findCueTarget(d, 'Visitors: twelve thousand.')?.tagName).toBe('P');
	});

	it('ignores a mark with a label too short to identify anything', () => {
		const d = doc('<svg><polygon data-label="A" data-value="3"></polygon></svg>');
		expect(findCueTarget(d, 'A: three.')).toBeNull();
	});

	// ── THE WORD BOUNDARY ────────────────────────────────────────────────────────────────────
	// `loose()` strips punctuation but does not tokenize, so a bare `startsWith` / `includes` is a
	// CHARACTER test and every short label becomes a prefix of some word. Both arms below failed
	// against the first version of this tier.

	it('a label must lead as WHOLE WORDS — not as the first letters of a longer word', () => {
		// Measured on the real corpus: `scatter` and `quadrant` emit two-letter labels with no
		// value, so this is the shape that had ONE guard and that guard was a character prefix.
		const d = doc('<svg><circle data-label="AI" data-mark="7"></circle></svg>');
		expect(findCueTarget(d, 'Airlines were the worst performer.')).toBeNull();
		expect(findCueTarget(d, 'AI adoption doubled.')?.getAttribute('data-mark')).toBe('7');
	});

	it('a value corroborates as WHOLE WORDS — "eight" does not satisfy "eighteen"', () => {
		const d = doc('<svg><polygon data-label="Budget" data-value="8"></polygon></svg>');
		expect(findCueTarget(d, 'Budget: eighteen.')).toBeNull();
		expect(findCueTarget(d, 'Budget: eight.')?.getAttribute('data-label')).toBe('Budget');
	});

	it('a non-numeric value cannot corroborate by accident', () => {
		// `toSpokenText('N/A')` is `N/A`, which looses to "na" — a substring of "analysis", of
		// "national", of "narrow". Unbounded, such a mark corroborated practically any cue.
		const d = doc('<svg><polygon data-label="Region" data-value="N/A"></polygon></svg>');
		expect(findCueTarget(d, 'Region analysis pending.')).toBeNull();
	});

	// ── THE RANKING ──────────────────────────────────────────────────────────────────────────

	it('the longer label wins, and corroboration only breaks its ties', () => {
		// Ranking corroboration first let a short, wrong, value-bearing mark beat the exact one.
		const d = doc(`<svg>
			<circle id="exact" data-label="Revenue growth"></circle>
			<circle id="short" data-label="Revenue" data-value="40"></circle>
		</svg>`);
		expect(findCueTarget(d, 'Revenue growth: forty million dollars.')?.id).toBe('exact');
	});

	it('corroboration decides between two marks whose labels are the same length', () => {
		// THE UNCORROBORATED ONE COMES FIRST IN THE DOM, deliberately. Sort is stable, so with the
		// corroboration key dropped the answer falls back to document order — and with the right
		// mark listed first, that accident gives the correct answer and the arm certifies nothing.
		// The first version of this test was written that way and survived the mutation.
		const d = doc(`<svg>
			<circle id="other" data-label="North"></circle>
			<circle id="right" data-label="North" data-value="40"></circle>
		</svg>`);
		expect(findCueTarget(d, 'North: forty.')?.id).toBe('right');
	});
});

describe('chooseGesture — a mark is geometry, not words', () => {
	const W = 1280;
	const shape = (extra: Partial<GuideShape>): GuideShape => ({
		box: { left: 0, top: 0, width: 400, height: 200 },
		lines: 1,
		slideW: W,
		role: 'body',
		enclosed: false,
		textless: false,
		...extra,
	});

	it('never underlines or washes something that carries no text', () => {
		// `underline` names the EXTENT of words and `wash` sweeps them; a chart mark has none, so
		// both lay their ink along the element's bounding box instead. On a funnel trapezoid that
		// is the wide end's width drawn under the narrow end — 1107px of ink under a 443px edge.
		for (const lines of [1, 6]) {
			for (const enclosed of [false, true]) {
				const kind = chooseGesture(shape({ textless: true, lines, enclosed }));
				expect(['circle', 'tap'], `lines=${lines} enclosed=${enclosed}`).toContain(kind);
			}
		}
	});

	it('a wide mark is tapped and a compact one is ringed', () => {
		expect(chooseGesture(shape({ textless: true, box: { left: 0, top: 0, width: 1100, height: 160 } }))).toBe('tap');
		expect(chooseGesture(shape({ textless: true, box: { left: 0, top: 0, width: 120, height: 120 } }))).toBe('circle');
	});

	it('text still classifies by its own measurements', () => {
		expect(chooseGesture(shape({ box: { left: 0, top: 0, width: 900, height: 30 } }))).toBe('underline');
	});
});

describe('findNamedTarget — a cue the projection composed out of a part’s own spans', () => {
	// The real roster, as `team-profile.transform.js` emits it. Nothing here is a BLOCK, so
	// `headerRange` finds no cut and `findCueTargetIn` has nothing in `BLOCK_SELECTOR` to search;
	// and the sentence is composed across three spans, so no element holds it. Measured on the
	// component's own gallery: 47 of 86 cues resolved to nothing at all.
	const ROSTER = (cls = 'team-profile') => `<section class="lattice ${cls}"><ul class="team-roster">
		<li class="person"><span class="person-figure"></span><span class="person-text">
			<span class="person-name">Ada Okafor</span><span class="person-role">Executive Sponsor</span><span class="person-note">Clears blockers above the program.</span>
		</span></li>
		<li class="person"><span class="person-figure"></span><span class="person-text">
			<span class="person-name">Marcus Vale</span><span class="person-role">Program Director</span><span class="person-note">Runs the weekly cadence.</span>
		</span></li>
	</ul></section>`;
	const roster = (cls?: string): Document => new DOMParser().parseFromString(`<html><body>${ROSTER(cls)}</body></html>`, 'text/html');

	it('names the person a composed sentence is about', () => {
		const el = findCueTarget(roster(), 'Marcus Vale, Program Director: Runs the weekly cadence.');
		expect(el?.querySelector('.person-name')?.textContent).toBe('Marcus Vale');
	});

	it('tells the people apart', () => {
		// Asserted against `findNamedTarget`, not `findCueTarget`: mutation-testing showed this test
		// survives the tier being replaced with `return null`, because `findSpanningTarget`'s partial
		// branch hands back the same `li.person` (share 0.55 clears LONGEST_SHARE). A test that passes
		// with the feature removed is pinning the other tier.
		const d = roster();
		expect(findNamedTarget(d, 'Ada Okafor, Executive Sponsor: Clears blockers above the program.')?.querySelector('.person-name')?.textContent).toBe('Ada Okafor');
	});

	it('refuses a name that merely RECURS in the sentence', () => {
		// The lead rule, isolated. A sentence about the team is not a sentence about one person,
		// and this tier has no value to corroborate with — the lead is the whole defense.
		//
		// Asserted on THIS tier. Through the whole chain the paraphrase tier now answers it with
		// Ada's card, which is right: the sentence shares her name, her role and "program" with
		// that card and with nothing else on the slide. The lead rule still has to hold here.
		expect(findNamedTarget(roster(), 'The program is sponsored by Ada Okafor.')).toBeNull();
		expect(findCueTarget(roster(), 'The program is sponsored by Ada Okafor.')?.querySelector('.person-name')?.textContent).toBe('Ada Okafor');
	});

	it('refuses a name that is only a character prefix of the first word', () => {
		// `data-label="AI"` leading "Airlines were the worst performer." is the mark tier's
		// measured version of this. Whole words, or a person called `Al` leads "Already shipped."
		const d = new DOMParser().parseFromString(
			`<html><body><section class="lattice team-profile"><ul class="team-roster"><li class="person"><span class="person-text"><span class="person-name">Al</span></span></li></ul></section></body></html>`,
			'text/html',
		);
		expect(findCueTarget(d, 'Already shipped, and ahead of plan.')).toBeNull();
	});

	it('hides rather than guesses when two parts carry the same name', () => {
		const d = new DOMParser().parseFromString(
			`<html><body><section class="lattice team-profile"><ul class="team-roster">
				<li class="person"><span class="person-text"><span class="person-name">Ada Okafor</span></span></li>
				<li class="person"><span class="person-text"><span class="person-name">Ada Okafor</span></span></li>
			</ul></section></body></html>`,
			'text/html',
		);
		expect(findCueTarget(d, 'Ada Okafor, Executive Sponsor: Clears blockers.')).toBeNull();
	});

	it('is SCOPED to the component that declared it', () => {
		// The catalog prefixes every part with `section.<name> `, so one component's anatomy can
		// never answer for another's. Without the prefix a `.person` in some other layout would
		// be matched by team-profile's row.
		expect(findNamedTarget(roster('cards-grid'), 'Marcus Vale, Program Director: Runs the weekly cadence.')).toBeNull();
	});

	it('runs LAST — a cue a real block holds still resolves to the block', () => {
		// The pure-addition property, pinned. A `<p>` holding the whole sentence is in
		// `BLOCK_SELECTOR`, so the block matcher answers first and this tier never sees the cue.
		const d = new DOMParser().parseFromString(
			`<html><body><section class="lattice team-profile"><p>Marcus Vale, Program Director: Runs the weekly cadence.</p><ul class="team-roster"><li class="person"><span class="person-text"><span class="person-name">Marcus Vale</span></span></li></ul></section></body></html>`,
			'text/html',
		);
		expect(findCueTarget(d, 'Marcus Vale, Program Director: Runs the weekly cadence.')?.tagName).toBe('P');
	});

	// THE SECOND SHAPE THE CATALOG DECLARES, and the class name is load-bearing. This test read
	// `class="lattice compare-table"` until an independent check caught it: `compare-table` was
	// renamed to `table` by this branch's own BASE commit, so no catalog row matched the section
	// and `findSpanningTarget` was quietly answering instead. Both assertions passed either way,
	// which is why it is asserted against `findNamedTarget` directly below — this shape produces
	// 6 of the 13 catalog rows and the two largest measured wins, and it had no real coverage.
	const TABLE = (cls: string): Document =>
		new DOMParser().parseFromString(
			`<html><body><section class="lattice ${cls}"><table><tbody>
				<tr><td>A label</td><td>One cell per column</td><td>Twelve words</td></tr>
				<tr><td>Every row</td><td>The same column set</td><td>Twelve words</td></tr>
			</tbody></table></section></body></html>`,
			'text/html',
		);

	it('answers a TABLE ROW by the cell that labels it', () => {
		const el = findNamedTarget(TABLE('table'), 'A label: One cell per column; Twelve words.');
		expect(el?.tagName).toBe('TR');
		expect(el?.querySelector('td')?.textContent).toBe('A label');
	});

	it('is the tier that answers it — not the piecewise matcher wearing its clothes', () => {
		// The regression the rename caused, pinned. A section no catalog row names must get NOTHING
		// from this tier, however well some other tier would cope.
		expect(findNamedTarget(TABLE('cards-grid'), 'A label: One cell per column; Twelve words.')).toBeNull();
	});

	it('will not take a name from a NESTED table', () => {
		// `td:first-child` matches the outer row's first cell, whose textContent swallows an inner
		// table — so an unscoped selector handed back the whole nested table as the "name", and the
		// handle would be drawn around it. `:scope >` is what the manifests declare, and this is why.
		const d = new DOMParser().parseFromString(
			`<html><body><section class="lattice table"><table><tbody>
				<tr><td><table><tbody><tr><td>Inner label</td><td>inner cell</td></tr></tbody></table></td><td>outer</td></tr>
			</tbody></table></section></body></html>`,
			'text/html',
		);
		const el = findNamedTarget(d, 'Inner label: inner cell.');
		// The INNER row may legitimately answer for its own text; the OUTER row must not.
		expect(el === null || el.closest('table') !== d.querySelector('section > table')).toBe(true);
	});

	it('refuses a one-character name outright', () => {
		// The `length < 2` floor, which had no test: the `Al` case above is killed by `leadsWord`,
		// so removing the floor left all 132 tests green.
		const d = new DOMParser().parseFromString(
			`<html><body><section class="lattice team-profile"><ul class="team-roster"><li class="person"><span class="person-text"><span class="person-name">A</span></span></li></ul></section></body></html>`,
			'text/html',
		);
		expect(findNamedTarget(d, 'A label that starts with one letter.')).toBeNull();
	});
});

describe('anchorFor — a declared part beats the header heuristic, and loses to a real marker', () => {
	// `anchorFor` only accepts a handle it can MEASURE, and jsdom has no layout, so every range
	// reports no client rects and every role falls through to `body`. The stub keyed on the
	// range's own text is this file's existing answer to that (see `guideCueFor, with line
	// boxes`): a rect is served for the text the test means and for nothing else, so a handle
	// that resolved to the wrong token still reports no geometry and still fails.
	let original: typeof Range.prototype.getClientRects;
	const MEASURED = new Set(['Ada Okafor', 'Executive Sponsor']);
	beforeEach(() => {
		original = Range.prototype.getClientRects;
		Range.prototype.getClientRects = function () {
			if (!MEASURED.has(this.toString().trim())) return [] as unknown as DOMRectList;
			return [{ x: 0, y: 0, left: 0, top: 0, width: 120, height: 18, right: 120, bottom: 18, toJSON: () => ({}) }] as unknown as DOMRectList;
		};
	});
	afterEach(() => {
		Range.prototype.getClientRects = original;
	});

	const person = (): Element => {
		const d = new DOMParser().parseFromString(
			`<html><body><section class="lattice team-profile"><ul class="team-roster"><li class="person"><span class="person-figure"></span><span class="person-text"><span class="person-name">Ada Okafor</span><span class="person-role">Executive Sponsor</span></span></li></ul></section></body></html>`,
			'text/html',
		);
		return d.querySelector('.person') as Element;
	};

	it('puts the ink on the declared token instead of the whole card', () => {
		// The reported defect: no nested block inside the card, so `headerRange` returns null and
		// the handle used to be the element's own words — a box drawn around a card that already
		// has a border.
		const el = person();
		expect(headerRange(el)).toBeNull();
		const a = anchorFor(el, null, 1);
		expect(a.role).toBe('part');
		expect(a.range?.toString().trim()).toBe('Ada Okafor');
	});

	it('still yields to a PHRASE — the cue’s own words win when only part of the card is read', () => {
		const el = person();
		const sentence = sentenceRange(el, 'Executive Sponsor');
		expect(anchorFor(el, sentence, 0.3).role).toBe('phrase');
	});

	it('leaves an undeclared element alone', () => {
		const d = new DOMParser().parseFromString(
			`<html><body><section class="lattice cards-grid"><ul><li class="person"><span class="person-text"><span class="person-name">Ada Okafor</span></span></li></ul></section></body></html>`,
			'text/html',
		);
		expect(anchorFor(d.querySelector('.person') as Element, null, 1).role).not.toBe('part');
	});

	it('falls through when the declared token renders empty', () => {
		// A declaration that resolves to nothing is not a handle. The next rule down is the one
		// that would have run anyway, rather than a zero-width range nobody can draw on.
		const d = new DOMParser().parseFromString(
			`<html><body><section class="lattice team-profile"><ul class="team-roster"><li class="person"><span class="person-text"><span class="person-name"></span><span class="person-role">Executive Sponsor</span></span></li></ul></section></body></html>`,
			'text/html',
		);
		expect(anchorFor(d.querySelector('.person') as Element, null, 1).role).not.toBe('part');
	});
});

describe('the chart tiers — a chart cue the text and mark tiers could not place (2026-09-24 audit)', () => {
	// Measured on the 22 chart galleries before these existed: the pointer hid on 49% of chart
	// cues. Each `it` below is one of the shapes the misses fell into, rebuilt from the markup the
	// transform really emits.

	it('corroborates a value SPOKEN BY VALUE, as chart narration says it', () => {
		// `$0.6M` is "six hundred thousand dollars" to `spokenValue` and "zero point six million"
		// to `toSpokenText`. The check knew only the second, so it REJECTED the right bar.
		const d = doc(`<svg><rect data-label="LATAM" data-value="$0.6M"></rect><rect data-label="APAC" data-value="$1.8M"></rect></svg>`);
		expect(findCueTarget(d, 'LATAM, six hundred thousand dollars.')?.getAttribute('data-label')).toBe('LATAM');
	});

	it('a hidden measuring mark hands off to its drawn twin, by data-mark', () => {
		// state-chart measures in an HTML list and paints in SVG, then hides the list (#2355).
		const d = doc(
			`<section><div class="chart-body"><ol style="display:none"><li class="state-node" data-mark="0" data-label="Draft">Draft</li></ol>` +
				`<svg><rect class="state-node-shape" data-mark="0"></rect><rect class="state-node-shape" data-mark="1"></rect></svg></div></section>`,
		);
		expect(findCueTarget(d, 'Draft start.')?.getAttribute('class')).toBe('state-node-shape');
		expect(findCueTarget(d, 'Draft start.')?.getAttribute('data-mark')).toBe('0');
	});

	it('a region code leads in the spelled form the narration speaks it in', () => {
		const d = doc(`<svg><path data-label="GA" data-value="42"></path><path data-label="TX" data-value="30"></path></svg>`);
		expect(findCueTarget(d, 'G A, forty-two.')?.getAttribute('data-label')).toBe('GA');
	});

	it('a whole number does not corroborate the head of a longer one said aloud', () => {
		// A line's three `Q1 2026` dots: 3.6, 4.3 and 4.0. "four" is a whole word inside "four point
		// three", so the 4.0 dot corroborated the Mid-market sentence too, the two tied, and the
		// pointer fell back to the axis label. The sentence names ONE dot.
		const d = doc(
			`<svg><circle data-label="Q1 2026" data-value="3.6"></circle><circle data-label="Q1 2026" data-value="4.3"></circle>` +
				`<circle data-label="Q1 2026" data-value="4.0"></circle><text data-label="Q1 2026">Q1 2026</text></svg>`,
		);
		expect(findCueTarget(d, 'Q1 2026, four point three.')?.getAttribute('data-value')).toBe('4.3');
		expect(findCueTarget(d, 'Q1 2026, four.')?.getAttribute('data-value')).toBe('4.0');
	});

	it('corroborates a signed value the way a waterfall step is said', () => {
		const d = doc(`<svg><rect data-label="FX" data-value="−0.3M"></rect></svg>`);
		expect(findCueTarget(d, 'FX, down three hundred thousand.')?.getAttribute('data-label')).toBe('FX');
	});

	it('corroborates a RANGE when both ends are said, with words between them', () => {
		// slope stamps `31% to 24%`; the voice puts the two years between the numbers.
		const d = doc(`<svg><polyline data-label="Northwind" data-value="31% to 24%"></polyline></svg>`);
		expect(findCueTarget(d, 'Northwind: 2023, thirty-one percent; 2026, twenty-four percent.')?.getAttribute('data-label')).toBe('Northwind');
		// …and still refuses when one end is not said.
		expect(findCueTarget(d, 'Northwind: 2023, thirty-one percent; 2026, nineteen percent.')).toBeNull();
	});

	it('corroborates gantt`s drawn span `Q1–Q2` against "Q1 to Q2"', () => {
		const d = doc(`<svg><rect data-label="Signal taxonomy" data-value="Q1–Q2"></rect></svg>`);
		expect(findCueTarget(d, 'Signal taxonomy, Q1 to Q2, done.')?.getAttribute('data-label')).toBe('Signal taxonomy');
	});

	it('treats pieces of ONE mark as one thing, and still refuses two different marks', () => {
		// A map highlight group: ten outlines, one `data-mark`, one label.
		const one = doc(`<svg><path data-mark="1" data-label="ASEAN" data-value="Tier 1"></path><path data-mark="1" data-label="ASEAN" data-value="Tier 1"></path></svg>`);
		expect(findCueTarget(one, 'ASEAN, Tier one.')?.getAttribute('data-mark')).toBe('1');
		const two = doc(`<svg><path data-mark="1" data-label="ASEAN" data-value="Tier 1"></path><path data-mark="2" data-label="ASEAN" data-value="Tier 1"></path></svg>`);
		expect(findCueTarget(two, 'ASEAN, Tier one.')).toBeNull();
	});

	it('lets a category label answer for two tied bars that share its name', () => {
		// A grouped bar: "Americas" is both bars AND the axis label under them. The sentence names
		// the category, so the category label — unique, valueless — is the answer.
		const d = doc(`<svg>
			<rect data-mark="0" data-label="Americas" data-value="3.2"></rect>
			<rect data-mark="3" data-label="Americas" data-value="3.9"></rect>
			<text class="cart-cat" data-label="Americas">Americas</text>
		</svg>`);
		expect(findCueTarget(d, 'Americas: Plan, three point two; Actual, three point nine.')?.classList.contains('cart-cat')).toBe(true);
	});

	it('points a mark`s spoken DETAIL note at the mark it belongs to', () => {
		const d = doc(`<div class="chart-body"><svg><rect data-mark="0" data-label="North America" data-value="$4.2M"></rect></svg>
			<div class="chart-details" hidden><template class="chart-detail" data-mark="0"><li>Two enterprise renewals landed in Q4</li></template></div></div>`);
		expect(findCueTarget(d, 'Two enterprise renewals landed in Q4.')?.getAttribute('data-label')).toBe('North America');
	});

	it('finds chart words drawn in a div, and in spans the voice spaced apart', () => {
		const d = doc(`<div class="chart-body"><div class="horizon-head"><span>Phase 01</span><span>Horizon 1</span><span>Now</span></div>
			<div class="progress-note">Waiting on the vendor contract</div></div>`);
		expect(findCueTarget(d, 'Waiting on the vendor contract.')?.className).toBe('progress-note');
		expect(findCueTarget(d, 'Phase 01 Horizon 1 Now.')?.className).toBe('horizon-head');
	});

	it('never points at screen-reader-only text', () => {
		const d = doc(`<div class="chart-body"><svg></svg><table class="chart-sr-only"><tr><th>Jan 2026 M1 sixty-two</th></tr></table></div>`);
		// Only the whole-figure tier may answer, never the hidden cell.
		expect(findCueTarget(d, 'Jan 2026 M1 sixty-two.')?.className).toBe('chart-body');
	});

	it('points a sentence about the WHOLE chart at the chart, and only on a chart slide', () => {
		const chart = doc(`<h2>Revenue</h2><div class="chart-body"><svg></svg></div>`);
		expect(findCueTarget(chart, "Each bar's length is its value, measured from zero.")?.className).toBe('chart-body');
		const prose = doc(`<h2>Revenue</h2><p>Growth held.</p>`);
		expect(findCueTarget(prose, "Each bar's length is its value, measured from zero.")).toBeNull();
	});

	it('names a state from a transition that opens "From <state>"', () => {
		const d = doc(`<section class="state-chart"><ol><li class="state-node" data-label="Approved" data-value="at-risk"><span class="state-label">Approved</span></li></ol></section>`);
		// The mark tier refuses it (the sentence never says the state's status); the handle tier
		// takes it by the declared part.
		const el = findNamedTarget(d, 'From Approved, publish goes to Published.');
		expect(el?.classList.contains('state-node')).toBe(true);
	});
});

describe('guideCueIn — a mark with extent in ONE direction is still a target', () => {
	it('keeps a dumbbell bar, which a browser measures zero pixels tall', () => {
		// SVG geometry is measured without its stroke, so a horizontal `<line>` has no height,
		// and the "does it have an area" guard threw away a mark the matcher had found.
		const d = doc(`<div class="chart-body"><svg><line class="slope-bar" data-label="Platform" data-value="48 to 55"></line></svg></div>`);
		const line = d.querySelector('line') as Element;
		line.getBoundingClientRect = () => ({ left: 100, top: 200, width: 60, height: 0, right: 160, bottom: 200, x: 100, y: 200, toJSON() {} }) as DOMRect;
		const cue = guideCueIn(d.querySelector('section') as Element, 'Platform: Plan, forty-eight; Actual, fifty-five.', { left: 0, top: 0, width: 1280, height: 720 }, 14);
		expect(cue?.el).toBe(line);
		expect(cue?.box.height).toBeGreaterThan(0);
	});
});

describe('the chart tiers — the limits an independent checker asked for', () => {
	it('does not take a short cue that merely APPEARS in a detail note as that note', () => {
		const d = doc(`<div class="chart-body"><svg><rect data-mark="0" data-label="North America" data-value="$4.2M"></rect></svg>
			<div class="chart-details" hidden><template class="chart-detail" data-mark="0"><li>Enterprise renewals landed in Q4 after a long procurement cycle</li></template></div></div>`);
		// Only the whole-figure tier may answer "Enterprise renewals." — never the bar.
		expect(findCueTarget(d, 'Enterprise renewals.')?.className).toBe('chart-body');
	});

	it('does not resolve a cue to the svg because its hidden <desc> contains it', () => {
		const d = doc(`<div class="chart-body"><svg role="img"><desc>North America 4.2 million leads every region</desc><text>NA</text></svg></div>`);
		expect(findCueTarget(d, 'North America 4.2 million leads every region.')?.tagName.toLowerCase()).not.toBe('svg');
	});

	it('does not guess between two charts — the whole-figure tier needs exactly one', () => {
		const d = doc(`<div class="chart-body"><svg></svg></div><div class="chart-body"><svg></svg></div>`);
		expect(findCueTarget(d, "Each bar's length is its value, measured from zero.")).toBeNull();
	});
});
