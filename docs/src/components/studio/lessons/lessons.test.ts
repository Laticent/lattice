import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunContext } from '../../../lib/vetrina';
import { LESSONS, loadLesson } from './catalog';
import { aimsAt, type LessonActions, type LessonEnv, TAKEOVER_LINE, visible, yourTurn } from './lesson-kit';
import { LESSON_LINES } from './lines';

// Lessons answer one question each (2026-10-05-studio-lessons.md). These pin the two contracts the
// palette and the user depend on: every catalog row loads a real script, and a "your turn" beat
// resolves the three ways the design promises — the user did it, the lesson did it after they
// waited, or (for a step the lesson must never take, like a download) nobody did.

/** A button jsdom reports as on screen. jsdom lays nothing out, so every box is 0×0 by default. */
function onScreen(attrs: Record<string, string>): HTMLButtonElement {
	const el = document.createElement('button');
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	el.getBoundingClientRect = () => ({ x: 0, y: 0, width: 40, height: 20, top: 0, left: 0, right: 40, bottom: 20, toJSON: () => ({}) });
	document.body.appendChild(el);
	return el;
}

/** A run context on a still stage that records what it says and does. `user` decides what
 *  `awaitUser` resolves with: a real event (the user acted) or the runner's timeout event. */
function harness(user: 'acts' | 'waits') {
	const log: string[] = [];
	const actions: LessonActions = {
		run: (id) => void log.push(`run:${id}`),
		press: () => void log.push('press'),
		setPalette: (n) => void log.push(`palette:${n}`),
		appendSlide: () => void log.push('append'),
		type: (_t, text) => void log.push(`type:${text}`),
	};
	const ctx = {
		stage: {
			say: (t: string) => void log.push(`say:${t}`),
			point: async () => void log.push('point'),
			press: async () => void log.push('click'),
			gesture: async () => {},
			reduced: true,
			still: true,
			pace: 1,
		},
		actions,
		signal: new AbortController().signal,
		type: async () => {},
		awaitUser: vi.fn(async () => new Event(user === 'acts' ? 'pointerdown' : 'vetrina:timeout')),
	} as unknown as RunContext<LessonActions>;
	return { log, ctx };
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('the lesson catalog', () => {
	it('has unique kebab ids, a question, and search words for every lesson', () => {
		expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
		for (const l of LESSONS) {
			expect(l.id).toMatch(/^[a-z][a-z-]*$/);
			expect(l.question).toMatch(/^How do I .+\?$/);
			expect(l.keywords.length).toBeGreaterThan(0);
		}
	});

	it('loads a script for every lesson, on a phone and on a desktop', async () => {
		for (const l of LESSONS) {
			const build = await loadLesson(l.id);
			expect(build, l.id).not.toBeNull();
			for (const mobile of [true, false]) {
				expect(typeof build?.({ mobile, palette: 'cuoio', palettes: ['cuoio', 'carbone'], can: () => true })).toBe('function');
			}
		}
	});

	it('an unknown id loads nothing rather than throwing', async () => {
		expect(await loadLesson('does-not-exist')).toBeNull();
	});
});

describe('a "your turn" beat', () => {
	it('moves on without acting when the user presses the control', async () => {
		onScreen({ 'data-demo': 'share' });
		const { log, ctx } = harness('acts');
		const who = await yourTurn(ctx, { say: 'Click Share.', target: '[data-demo="share"]', perform: (a) => a.run('share') });
		expect(who).toBe('user');
		expect(log).not.toContain('run:share');
	});

	it('does the step itself, and says so, when the user waits', async () => {
		onScreen({ 'data-demo': 'share' });
		const { log, ctx } = harness('waits');
		const who = await yourTurn(ctx, { say: 'Click Share.', target: '[data-demo="share"]', perform: (a) => a.run('share') });
		expect(who).toBe('lesson');
		expect(log).toContain(`say:${TAKEOVER_LINE}`);
		expect(log).toContain('run:share');
	});

	it('never takes a step that has no perform — the download stays the user’s', async () => {
		onScreen({ 'data-demo': 'pdf-download' });
		const { log, ctx } = harness('waits');
		const who = await yourTurn(ctx, { say: 'Click Download PDF.', target: '[data-demo="pdf-download"]' });
		expect(who).toBe('nobody');
		expect(log).not.toContain(`say:${TAKEOVER_LINE}`);
	});

	it('performs without waiting when the control is not on screen at this width', async () => {
		const { log, ctx } = harness('acts');
		const who = await yourTurn(ctx, { say: 'Click the palette icon.', target: '[data-demo="theme"]', perform: (a) => a.setPalette('carbone'), missing: 'I’ll switch one for you.' });
		expect(who).toBe('lesson');
		expect(ctx.awaitUser).not.toHaveBeenCalled();
		expect(log).toContain('say:I’ll switch one for you.');
		expect(log).toContain('palette:carbone');
	});
});

describe('a "your turn" beat whose control is missing', () => {
	it('does nothing unless it can say what it is doing instead', async () => {
		// Performing under the beat's own "Click X" line would edit the deck while telling the user it
		// was their turn — what "Write a slide" did at the Read stop before this rule.
		const { log, ctx } = harness('waits');
		const who = await yourTurn(ctx, { say: 'Click at the end of your text.', target: '#nowhere', perform: (a) => a.appendSlide('# x') });
		expect(who).toBe('nobody');
		expect(log).not.toContain('append');
	});
});

describe('targets', () => {
	it('visible() skips hidden copies and finds the one on screen', () => {
		const hidden = document.createElement('button');
		hidden.setAttribute('aria-label', 'Present');
		document.body.appendChild(hidden);
		const shown = onScreen({ 'data-demo': 'present' });
		expect(visible('[aria-label="Present"]', '[data-demo="present"]')()).toBe(shown);
	});

	it('visible() skips a copy inside an inert layer, even one with a real box', () => {
		// The Studio's pre-paint skeleton keeps an exact copy of the header inside an inert,
		// aria-hidden layer. Aiming at it made the user's click on the real button end the lesson.
		const layer = document.createElement('div');
		layer.setAttribute('inert', '');
		document.body.appendChild(layer);
		const ghost = onScreen({ 'aria-label': 'Present' });
		layer.appendChild(ghost);
		const real = onScreen({ 'aria-label': 'Present' });
		expect(visible('[aria-label="Present"]')()).toBe(real);
	});

	it('a press inside the control, or Enter on it, counts as aiming at it', () => {
		const el = onScreen({});
		const inner = document.createElement('span');
		el.appendChild(inner);
		const press = new Event('pointerdown');
		Object.defineProperty(press, 'target', { value: inner });
		expect(aimsAt(el, press)).toBe(true);
		el.focus();
		expect(aimsAt(el, new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(true);
		expect(aimsAt(el, new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
	});

	it('an arrow key inside the target’s menu counts, so a keyboard user can finish a two-step lesson', () => {
		const menu = document.createElement('div');
		menu.setAttribute('role', 'menu');
		const first = document.createElement('div');
		first.tabIndex = -1;
		const target = document.createElement('div');
		menu.append(first, target);
		document.body.appendChild(menu);
		first.focus();
		expect(aimsAt(target, new KeyboardEvent('keydown', { key: 'ArrowDown' }))).toBe(true);
		expect(aimsAt(target, new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false);
	});
});

describe('Building and Polish lessons check that their control can act before pointing at it', () => {
	const env = (over: Partial<LessonEnv> = {}): LessonEnv => ({ mobile: false, palette: 'cuoio', palettes: ['cuoio'], can: () => true, ...over });

	it('"Fix all" with nothing to fix says so and changes nothing', async () => {
		const build = await loadLesson('fix-all');
		const { log, ctx } = harness('waits');
		await build?.(env({ can: (id) => id !== 'fix-all' }))(ctx);
		expect(log).toContain(`say:${LESSON_LINES['fix-all'].nothing}`);
		expect(log.some((l) => l.startsWith('run:'))).toBe(false);
	});

	it('"Reshape" on a phone explains where it lives and changes nothing', async () => {
		const build = await loadLesson('reshape');
		const { log, ctx } = harness('waits');
		await build?.(env({ mobile: true }))(ctx);
		expect(log).toContain(`say:${LESSON_LINES.reshape.phone}`);
		expect(log.some((l) => l === 'press' || l.startsWith('run:'))).toBe(false);
	});

	it('"Reshape" on a slide with one layout says so instead of pointing at a disabled button', async () => {
		const el = onScreen({ 'aria-label': 'Reshape slide' });
		el.disabled = true;
		const build = await loadLesson('reshape');
		const { log, ctx } = harness('waits');
		await build?.(env())(ctx);
		expect(log).toContain(`say:${LESSON_LINES.reshape.unavailable}`);
		expect(log).not.toContain('press');
	});

	it('"Add a chart" opens the gallery for a user who waits, then types the search for them', async () => {
		onScreen({ 'aria-label': 'Add slide' });
		const build = await loadLesson('add-chart');
		const { log, ctx } = harness('waits');
		// The gallery appears once the lesson opens it.
		ctx.actions.run = (id) => {
			log.push(`run:${id}`);
			const i = document.createElement('input');
			i.setAttribute('aria-label', 'Search slides');
			i.getBoundingClientRect = () => ({ x: 0, y: 0, width: 200, height: 20, top: 0, left: 0, right: 200, bottom: 20, toJSON: () => ({}) });
			document.body.appendChild(i);
		};
		ctx.actions.type = (_t, text) => {
			log.push(`type:${text}`);
			onScreen({ 'aria-label': 'Insert bar — a chart' });
		};
		await build?.(env())(ctx);
		expect(log).toContain('run:insert');
		expect(log).toContain('type:chart');
		expect(log.filter((l) => l === 'press')).toHaveLength(1);
	});

	it('"Fix all" with its button off screen says where it is and applies nothing', async () => {
		const build = await loadLesson('fix-all');
		const { log, ctx } = harness('waits');
		await build?.(env())(ctx);
		expect(log).toContain(`say:${LESSON_LINES['fix-all'].missing}`);
		expect(log.some((l) => l.startsWith('run:'))).toBe(false);
	});

	it('"Check my deck" with Coach already open does not ask for the toggle that would close it', async () => {
		onScreen({ 'data-demo': 'coach-read' });
		onScreen({ 'aria-label': 'Toggle Coach' });
		const build = await loadLesson('coach');
		const { log, ctx } = harness('waits');
		await build?.(env())(ctx);
		expect(log).not.toContain(`say:${LESSON_LINES.coach.click}`);
		expect(log.some((l) => l.startsWith('run:'))).toBe(false);
		expect(log).toContain(`say:${LESSON_LINES.coach.list}`);
	});

	it('a gallery card is found under both label shapes, the plain one and the search-ranked one', async () => {
		const { card, visible } = await import('./lesson-kit');
		onScreen({ 'aria-label': 'Insert bar, 87% as close a match as the top result — Use when…' });
		onScreen({ 'aria-label': 'Insert bar-race — not this one' });
		expect(visible(...card('bar'))()?.getAttribute('aria-label')).toMatch(/^Insert bar,/);
	});
});

