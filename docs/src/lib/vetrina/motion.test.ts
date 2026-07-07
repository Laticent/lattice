import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStage, type Stage } from './stage';
import { resolveTheme, type Theme } from './theme';

// The three-tier motion model (theme.motion). The stage collapses a policy into TWO flags:
//   reduced — vestibular motion suppressed (glides/rings/orbit/wave-translate/sweeps).
//   still   — content cadence ALSO collapsed (typing → instant, settles short).
// The load-bearing guarantee: a reduced-motion DEVICE ('system') lands on 'legible'
// (reduced=true, still=FALSE), so the typing reveal + cross-fades keep playing — it never
// collapses to the unwatchable 'still' blur. WCAG 2.3.3 / Apple HIG target vestibular
// motion, not content cadence, and this is where we encode that.

let active: Stage | null = null;
const realMatchMedia = window.matchMedia;

/** Stub matchMedia so '(prefers-reduced-motion: reduce)' reports `reduce`. */
function stubReduceMotion(reduce: boolean) {
	window.matchMedia = ((q: string) =>
		({
			matches: reduce && /prefers-reduced-motion:\s*reduce/.test(q),
			media: q,
			addEventListener() {},
			removeEventListener() {},
			addListener() {},
			removeListener() {},
			onchange: null,
			dispatchEvent: () => false,
		}) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function mount(motion: Theme['motion']): Stage {
	const root = document.createElement('div');
	document.body.appendChild(root);
	active = createStage({ root, onExit: () => {}, theme: resolveTheme(motion ? { motion } : {}) });
	return active;
}

beforeEach(() => stubReduceMotion(false));
afterEach(() => {
	active?.destroy();
	active = null;
	document.body.innerHTML = '';
	window.matchMedia = realMatchMedia;
});

describe('resolveTheme — motion policy passthrough', () => {
	it("defaults to 'system' and passes an explicit tier through", () => {
		expect(resolveTheme().motion).toBe('system');
		expect(resolveTheme({ motion: 'full' }).motion).toBe('full');
		expect(resolveTheme({ motion: 'legible' }).motion).toBe('legible');
		expect(resolveTheme({ motion: 'still' }).motion).toBe('still');
	});
});

describe('stage motion tiers — reduced/still flags', () => {
	it("'full' plays everything, even when the device asks to reduce", () => {
		stubReduceMotion(true);
		const s = mount('full');
		expect(s.reduced).toBe(false);
		expect(s.still).toBe(false);
	});

	it("'legible' suppresses vestibular motion but keeps content cadence", () => {
		const s = mount('legible');
		expect(s.reduced).toBe(true); // glides/rings/orbit/wave-translate off
		expect(s.still).toBe(false); // typing reveal + cross-fades + full settles kept
	});

	it("'still' collapses content cadence too", () => {
		const s = mount('still');
		expect(s.reduced).toBe(true);
		expect(s.still).toBe(true);
	});

	it("'system' on a reduced-motion device resolves to LEGIBLE, never still", () => {
		stubReduceMotion(true);
		const s = mount('system');
		expect(s.reduced).toBe(true);
		expect(s.still).toBe(false); // the load-bearing guarantee: no unwatchable instant blur
	});

	it("'system' with no preference plays full motion", () => {
		stubReduceMotion(false);
		const s = mount('system');
		expect(s.reduced).toBe(false);
		expect(s.still).toBe(false);
	});

	it('the default (no motion set) behaves like system', () => {
		stubReduceMotion(true);
		const s = mount(undefined);
		expect(s.reduced).toBe(true);
		expect(s.still).toBe(false);
	});
});
