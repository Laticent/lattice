// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveMotion } from '@/playground/anima-host-sel';
import { deckClassTokens, deckMotionOf, judge, markCount, readTargets, tally } from './motion-sheet';

const deck = (fm: string, ...slides: string[]) => `---\n${fm}\n---\n\n${slides.join('\n\n---\n\n')}`;

// A chart is authored as a MARKDOWN LIST — every chart component's data slot is `ul > li`. An
// earlier version of this file used a ``` fence, which is the shape no chart uses: those slides
// render as code blocks, so every assertion below was about a deck that could not animate at all.
const funnel = (tokens = '', rows = 4) =>
	`<!-- _class: funnel${tokens ? ` ${tokens}` : ''} -->\n\n## Where deals stall\n\n${Array.from({ length: rows }, (_, i) => `- Stage ${i + 1} \`${100 - i * 10}\``).join('\n')}`;

describe('target discovery', () => {
	it('finds the animatable components and ignores the rest', () => {
		const src = deck('theme: indaco', funnel(), '<!-- _class: content -->\n\n## Just words\n\nNothing to animate.', '<!-- _class: piechart -->\n\n## Mix\n\n- Direct `1`\n- Partner `2`');
		const targets = readTargets(src);
		expect(targets.map((t) => t.component)).toEqual(['funnel', 'piechart']);
		// Slide numbers are what an author counts, 1-based, and skip nothing.
		expect(targets.map((t) => t.slide)).toEqual([1, 3]);
	});

	it('reads the slide heading as the row label', () => {
		expect(readTargets(deck('theme: indaco', funnel()))[0].title).toBe('Where deals stall');
	});

	it('reports a component that renders but emits no motion roles', () => {
		const t = readTargets(deck('motion: on', '<!-- _class: word-cloud -->\n\n## Themes\n\n- alpha `4`\n- beta `2`'))[0];
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
		// The engine APPENDS front-matter `class:` to every section, so the oracle must too — an
		// earlier version built the section from the slide tokens alone and therefore agreed with
		// the sheet by construction on exactly the shapes where the sheet was wrong.
		section.className = ['funnel', ...tokens.split(' ').filter(Boolean), ...deckClassTokens(src)].join(' ');
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
	// The four shapes the sheet used to get backwards, now run through the real resolveMotion.
	it('deck `class: motion-on` against a silent deck', () => check('class: motion-on', ''));
	it('deck `class: motion-off` beats a slide motion-on', () => check('motion: on\nclass: motion-off', 'motion-on'));
	it('deck `class: motion-fast` sets the speed', () => check('motion: on\nclass: motion-fast', ''));
	it('deck `class: chart-anima` with a motion-style key', () => check('class: chart-anima\nmotion-style: rise', ''));
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
	it('counts the top-level list items — the shape charts are actually authored in', () => {
		expect(markCount(funnel('', 4))).toBe(4);
	});

	it('does NOT count a nested detail list — `li > ul` is per-stage detail, not another mark', () => {
		expect(markCount('<!-- _class: funnel -->\n\n## X\n\n- One `10`\n  - detail a\n  - detail b\n- Two `5`')).toBe(2);
	});

	it('ignores list-looking lines inside a fence', () => {
		expect(markCount('<!-- _class: funnel -->\n\n## X\n\n- One `10`\n\n```\n- not a mark\n```')).toBe(1);
	});

	it('returns null with no list, rather than 0 — "none" and "unknown" are different claims', () => {
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
		const src = deck('motion: on', funnel(), funnel('motion-off'), funnel('motion-together'), '<!-- _class: journey -->\n\n## Arc\n\n- Discover `1`');
		const t = tally(readTargets(src));
		// `on` means "will actually animate". The journey's Play resolves on from the deck default,
		// but it emits no roles, so it is counted as blocked rather than inflating the on count —
		// which is the whole reason the sheet exists: the register saying on is not the same as
		// something moving.
		expect(t).toEqual({ total: 4, on: 2, off: 1, review: 1, blocked: 1 });
	});
});

// ── The four facts an adversarial pass found this module had backwards ────────────────────────
// Each of these is a defect that shipped in the first draft and would otherwise recur silently.

describe('what can actually animate is decided by data-anima-role, not by `render: svg`', () => {
	it('state-chart IS animatable — it is `render: hybrid` and emits roles', () => {
		const t = readTargets(deck('motion: on', '<!-- _class: state-chart -->\n\n## Approval path\n\n- Draft `1`\n- Review `2`\n- Signed `3`'))[0];
		expect(t.verdict).not.toBe('no-roles');
		expect(t.play).toBe(true);
	});

	it('diagram is NOT — it declares `render: svg` but its Mermaid markup emits no role', () => {
		const t = readTargets(deck('motion: on', '<!-- _class: diagram -->\n\n## Flow\n\n```mermaid\ngraph TD\nA-->B\n```'))[0];
		expect(t.verdict).toBe('no-roles');
	});
});

describe('the documented deck-wide alias switches motion on', () => {
	it('`class: chart-anima` in front matter reads as Play on, like the engine treats it', () => {
		const t = readTargets(deck('class: chart-anima', funnel()))[0];
		expect(t.play).toBe(true);
		expect(t.provenance.play).toBe('deck');
	});

	it('a deck with neither key is still off', () => {
		expect(readTargets(deck('theme: indaco', funnel()))[0].play).toBe(false);
	});
});

describe('a sector chart is not nagged about a synchronization the engine forces', () => {
	// chart-anima.ts:286 synchronizes sectors under EVERY style, so `together` changes nothing.
	it('together on a pie does not review', () => {
		expect(judge({ component: 'piechart', play: true, style: 'together', marks: 5 }).verdict).toBe('carries');
	});

	it('build on a pie gets the SAME verdict — identical rendered motion cannot score differently', () => {
		const together = judge({ component: 'piechart', play: true, style: 'together', marks: 5 });
		const build = judge({ component: 'piechart', play: true, style: 'build', marks: 5 });
		expect(build.verdict).toBe(together.verdict);
	});

	it('but a BAR chart with together still reviews — there the style is the author’s choice', () => {
		expect(judge({ component: 'funnel', play: true, style: 'together', marks: 5 }).verdict).toBe('review');
	});
});

describe('a deck-level `class:` token lands on every section, so it behaves as a slide token', () => {
	// Verified against the engine by the adversarial pass: `class:` is appended to EVERY section,
	// including one that names its own `_class:`. All four of these reported the OPPOSITE of what
	// the engine does before the union model replaced a "deck default" layer.
	it('`class: motion-on` switches a silent deck on', () => {
		expect(readTargets(deck('class: motion-on', funnel()))[0].play).toBe(true);
	});

	it('`class: motion-off` silences a deck whose front matter says motion: on', () => {
		expect(readTargets(deck('motion: on\nclass: motion-off', funnel()))[0].play).toBe(false);
	});

	it('`class: motion-fast` sets the speed, rather than falling to auto', () => {
		expect(readTargets(deck('motion: on\nclass: motion-fast', funnel()))[0].speed).toBe('fast');
	});

	it('`class: chart-anima` reads as on + build, the legacy alias the engine honors', () => {
		const t = readTargets(deck('class: chart-anima', funnel()))[0];
		expect(t.play).toBe(true);
		expect(t.style).toBe('build');
	});
});

describe('the component is found wherever it sits in the class list', () => {
	// The engine's dispatch is `CHART_LAYOUTS.find(l => classTokens.includes(l))` — position
	// independent. Reading tokens[0] dropped an animating chart out of the sheet entirely.
	it('finds a funnel behind a leading modifier', () => {
		const t = readTargets(deck('motion: on', '<!-- _class: dark funnel motion-on -->\n\n## X\n\n- A `1`\n- B `2`'))[0];
		expect(t?.component).toBe('funnel');
		expect(t?.play).toBe(true);
	});

	it('finds it after a register token too', () => {
		expect(readTargets(deck('motion: on', '<!-- _class: motion-on funnel -->\n\n## X\n\n- A `1`'))[0]?.component).toBe('funnel');
	});
});

describe('mark counting stops at the end of the data list', () => {
	it('a bulleted note under the chart is not a mark', () => {
		expect(markCount('<!-- _class: funnel -->\n\n## X\n\n- One `10`\n- Two `5`\n\nNotes:\n\n- an aside\n- another')).toBe(2);
	});

	it('a tilde fence is skipped as well as a backtick fence', () => {
		expect(markCount('<!-- _class: funnel -->\n\n## X\n\n~~~\n- not a mark\n~~~\n\n- One `10`')).toBe(1);
	});
});

describe('an ordered list counts too — state-chart authors its states that way', () => {
	// Verified on the live surface: a 3-state state-chart emits exactly 3 `[data-mark]` nodes,
	// and its nested `- ` items are transitions, not marks.
	it('counts the states, not the transitions', () => {
		const chunk = '<!-- _class: state-chart -->\n\n## Approval\n\n1. Draft `start`\n   - `submit => 2`\n2. In Review\n   - `approve => 3`\n3. Signed `done`';
		expect(markCount(chunk)).toBe(3);
	});
});
