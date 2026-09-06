// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveMotion } from '@/playground/anima-host-sel';
import { deckMotionOf, judge, markCount, readTargets, tally } from './motion-sheet';

const deck = (fm: string, ...slides: string[]) => `---\n${fm}\n---\n\n${slides.join('\n\n---\n\n')}`;

const funnel = (tokens = '', rows = 4) =>
	`<!-- _class: funnel${tokens ? ` ${tokens}` : ''} -->\n\n## Where deals stall\n\n\`\`\`funnel\n${Array.from({ length: rows }, (_, i) => `Stage ${i + 1}  ${100 - i * 10}`).join('\n')}\n\`\`\``;

describe('target discovery', () => {
	it('finds the animatable components and ignores the rest', () => {
		const src = deck('theme: indaco', funnel(), '<!-- _class: content -->\n\n## Just words\n\nNothing to animate.', '<!-- _class: piechart -->\n\n## Mix\n\n```piechart\nA 1\nB 2\n```');
		const targets = readTargets(src);
		expect(targets.map((t) => t.component)).toEqual(['funnel', 'piechart']);
		// Slide numbers are what an author counts, 1-based, and skip nothing.
		expect(targets.map((t) => t.slide)).toEqual([1, 3]);
	});

	it('reads the slide heading as the row label', () => {
		expect(readTargets(deck('theme: indaco', funnel()))[0].title).toBe('Where deals stall');
	});

	it('reports a component that renders SVG but emits no motion roles', () => {
		const t = readTargets(deck('motion: on', '<!-- _class: word-cloud -->\n\n## Themes\n\n```word-cloud\nalpha 4\nbeta 2\n```'))[0];
		expect(t.verdict).toBe('no-roles');
		expect(t.note).toMatch(/emits no motion roles/i);
	});
});

describe('the cascade matches resolveMotion exactly', () => {
	// The sheet and the live host must never disagree about what a deck does. This drives the REAL
	// `resolveMotion` over a DOM section carrying the same tokens and compares the two answers.
	const check = (fm: string, tokens: string) => {
		const src = deck(fm, funnel(tokens));
		const mine = readTargets(src)[0];
		const section = document.createElement('section');
		section.className = ['funnel', ...tokens.split(' ').filter(Boolean)].join(' ');
		const theirs = resolveMotion(section, deckMotionOf(src));
		if (!mine.play) {
			expect(theirs).toBeNull();
			return;
		}
		expect(theirs).not.toBeNull();
		expect({ style: mine.style, speed: mine.speed }).toEqual({ style: theirs?.style, speed: theirs?.speed });
	};

	it('built-in default — Play off', () => check('theme: indaco', ''));
	it('deck Play on, everything else built-in', () => check('motion: on', ''));
	it('slide Play on against a silent deck', () => check('theme: indaco', 'motion-on'));
	it('slide motion-off overrides a deck default of on', () => check('motion: on', 'motion-off'));
	it('deck style + speed reach a class-less slide', () => check('motion: on\nmotion-style: rise\nmotion-speed: slow', ''));
	it('a slide token beats the deck on its own axis only', () => check('motion: on\nmotion-style: rise\nmotion-speed: slow', 'motion-together'));
	it('a style token does NOT switch Play on by itself', () => check('theme: indaco', 'motion-build'));
	it('the legacy chart-anima alias still reads as on + build', () => check('theme: indaco', 'chart-anima'));
});

describe('provenance — which scope decided each axis', () => {
	it('names the slide, the deck, and the built-in separately', () => {
		const t = readTargets(deck('motion: on\nmotion-style: rise', funnel('motion-slow')))[0];
		expect(t.provenance).toEqual({ play: 'deck', style: 'deck', speed: 'slide' });
	});

	it('falls to built-in when neither scope speaks', () => {
		expect(readTargets(deck('theme: indaco', funnel('motion-on')))[0].provenance).toEqual({ play: 'slide', style: 'built-in', speed: 'built-in' });
	});
});

describe('the admission test — motion that carries nothing is flagged, not silently allowed', () => {
	it('a build over several marks carries', () => {
		expect(judge({ component: 'funnel', play: true, style: 'build', marks: 5 }).verdict).toBe('carries');
	});

	it('ONE mark is a fade wearing a build’s name', () => {
		const r = judge({ component: 'funnel', play: true, style: 'build', marks: 1 });
		expect(r.verdict).toBe('review');
		expect(r.note).toMatch(/one beat|reads as a fade/i);
	});

	it('together is one window, so it arrives rather than sequences', () => {
		expect(judge({ component: 'funnel', play: true, style: 'together', marks: 6 }).verdict).toBe('review');
	});

	it('Play off is a decision, not a defect — it gets no warning', () => {
		const r = judge({ component: 'funnel', play: false, style: 'build', marks: 5 });
		expect(r.verdict).toBe('still');
		expect(r.note).toBeUndefined();
	});

	it('a component with no roles is blocked regardless of the register', () => {
		expect(judge({ component: 'journey', play: true, style: 'build', marks: 9 }).verdict).toBe('no-roles');
		expect(judge({ component: 'journey', play: false, style: 'build', marks: 9 }).verdict).toBe('no-roles');
	});

	it('every non-carrying verdict explains itself — a status you cannot act on is a colored dot', () => {
		for (const v of [
			judge({ component: 'funnel', play: true, style: 'build', marks: 1 }),
			judge({ component: 'funnel', play: true, style: 'together', marks: 4 }),
			judge({ component: 'journey', play: true, style: 'build', marks: 4 }),
		]) {
			expect(v.note, `${v.verdict} must carry a note`).toBeTruthy();
		}
	});
});

describe('mark counting reports what it does not know', () => {
	it('counts the fenced rows', () => {
		expect(markCount(funnel('', 4))).toBe(4);
	});

	it('returns null with no fence, rather than 0 — "none" and "unknown" are different claims', () => {
		expect(markCount('<!-- _class: funnel -->\n\n## No data here')).toBeNull();
	});

	it('a target whose marks are unknown gets no duration rather than a made-up one', () => {
		const t = readTargets(deck('motion: on', '<!-- _class: funnel -->\n\n## Bare'))[0];
		expect(t.marks).toBeNull();
		expect(t.durationMs).toBeNull();
	});
});

describe('tally', () => {
	it('counts each lane once', () => {
		const src = deck('motion: on', funnel(), funnel('motion-off'), funnel('motion-together'), '<!-- _class: journey -->\n\n## Arc\n\n```journey\nA 1\n```');
		const t = tally(readTargets(src));
		// `on` means "will actually animate". The journey's Play resolves on from the deck default,
		// but it emits no roles, so it is counted as blocked rather than inflating the on count —
		// which is the whole reason the sheet exists: the register saying on is not the same as
		// something moving.
		expect(t).toEqual({ total: 4, on: 2, off: 1, review: 1, blocked: 1 });
	});
});
