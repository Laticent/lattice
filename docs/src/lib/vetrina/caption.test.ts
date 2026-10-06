import { afterEach, describe, expect, it } from 'vitest';
import { createStage, type Stage } from './stage';
import { resolveTheme } from './theme';

// The four caption styles (theme.caption) all render DIFFERENT chrome, but every one must
// keep the invariants the take-over guard and the exemplar e2e depend on: exactly one
// `.vetrina-caption`, the Exit button INSIDE it (so `layer.contains` reads it as chrome),
// and exactly one narration live region. jsdom can't parse the @layer token sheet (a
// harmless stderr line), but the DOM the stage builds is fully assertable here.

let active: Stage | null = null;
function mount(caption?: 'bar' | 'split' | 'scrim' | 'progress') {
	const root = document.createElement('div');
	document.body.appendChild(root);
	active = createStage({ root, onExit: () => {}, theme: resolveTheme(caption ? { caption } : {}) });
	const layer = document.querySelector('.vetrina-stage') as HTMLElement;
	return { root, stage: active, layer };
}
afterEach(() => {
	active?.destroy();
	active = null;
	document.body.innerHTML = '';
});

describe('caption styles — every dock keeps the a11y + take-over contract', () => {
	for (const caption of ['bar', 'split', 'scrim', 'progress'] as const) {
		it(`${caption}: one .vetrina-caption with Exit inside it and one narration live region`, () => {
			const { layer } = mount(caption);
			const dock = layer.querySelector('.vetrina-caption');
			expect(dock).not.toBeNull();
			// Exit lives inside the dock (the take-over guard's chrome check + exemplar contract).
			expect(dock?.querySelectorAll('button[aria-label="Exit the demo"]')).toHaveLength(1);
			// Exit is an ICON now (no "Exit" text label — aria-label carries the name).
			expect(dock?.querySelector('button[aria-label="Exit the demo"]')?.textContent?.trim()).toBe('');
			// Exactly one live region, and it starts on the take-over hint.
			const narr = dock?.querySelectorAll('.vetrina-narration[role="status"][aria-live="polite"]');
			expect(narr).toHaveLength(1);
			expect(narr?.[0].textContent).toMatch(/take over/i);
			// No legacy split "Live demo" chrome strip.
			expect(layer.querySelector('.vetrina-chrome')).toBeNull();
		});
	}

	it('the default caption (no theme) is the responsive centered bar', () => {
		const { layer } = mount();
		const dock = layer.querySelector('.vetrina-caption') as HTMLElement;
		// The bar is centered and capped (near-full on a phone, a pill on a wide screen) — not
		// the full-area inset:0 container the boxless styles use.
		expect(dock.style.left).toBe('50%');
		expect(dock.style.maxWidth).toBe('680px');
		expect(dock.style.inset).toBe('');
	});

	it('scrim: the narration live region is NOT inside an aria-hidden subtree (it must be announced)', () => {
		// Regression guard for the scrim a11y bug: the gradient div is aria-hidden, but the
		// role=status narration must be a sibling, never a descendant — else AT announces nothing.
		const { layer } = mount('scrim');
		const narr = layer.querySelector('.vetrina-narration') as HTMLElement;
		expect(narr.closest('[aria-hidden="true"]')).toBeNull();
	});

	it('progress: stage.progress(2, 4) fills the beat ring label', () => {
		const { layer, stage } = mount('progress');
		// `progress` is optional on the Stage interface; the real createStage always defines it, so
		// `?.` calls it — and if it were ever missing, the label assertion below would catch it.
		stage.progress?.(2, 4);
		expect(layer.querySelector('.vetrina-caption b')?.textContent).toBe('2/4');
	});

	it('progress: a zero total never divides — the ring stays empty', () => {
		const { layer, stage } = mount('progress');
		stage.progress?.(0, 0);
		expect(layer.querySelector('.vetrina-caption b')?.textContent ?? '').toBe('');
	});

	it('Exit stays reachable and fires onExit in a boxless style (scrim)', () => {
		let exited = false;
		const root = document.createElement('div');
		document.body.appendChild(root);
		active = createStage({ root, onExit: () => (exited = true), theme: resolveTheme({ caption: 'scrim' }) });
		(document.querySelector('.vetrina-caption button[aria-label="Exit the demo"]') as HTMLButtonElement).click();
		expect(exited).toBe(true);
	});

	it('say() updates the one live region regardless of style', () => {
		const { layer, stage } = mount('scrim');
		stage.say('board-ready');
		// reduced-motion path in jsdom sets it synchronously; otherwise it cross-fades — assert the
		// text lands (matchMedia is unstubbed in jsdom → reduced defaults false, so poll a tick).
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				expect(layer.querySelector('.vetrina-narration')?.textContent).toBe('board-ready');
				resolve();
			}, 200);
		});
	});
});

describe('the phone floor and the host modal (2026-10-06)', () => {
	it('every boxed style reads its type size from --vt-caption-size, so a phone can raise it', () => {
		for (const caption of ['bar', 'split', 'progress'] as const) {
			const { layer } = mount(caption);
			expect((layer.querySelector('.vetrina-narration') as HTMLElement).style.fontSize).toBe('var(--vt-caption-size,13.5px)');
			active?.destroy();
			active = null;
		}
	});

	it('the default sheet gives Exit a 44px hit area and 15px text at ≤699px, and nothing above it', () => {
		mount('bar');
		const css = document.getElementById('vetrina-token-defaults')?.textContent ?? '';
		expect(css).toContain('--vt-caption-size:13.5px');
		const phone = css.slice(css.indexOf('@media (max-width:699px)'));
		expect(phone).toContain('--vt-caption-size:15px');
		expect(phone).toMatch(/\.vetrina-exit::before\{[^}]*width:max\(44px,100%\);height:max\(44px,100%\)/);
		// A square, not a disc: a rounded hit area leaves its corners dead (found by review).
		expect(phone.slice(phone.indexOf('.vetrina-exit::before'))).not.toContain('border-radius');
		// The hit area is anchored to the button, not to whatever positioned ancestor is nearest.
		expect((document.querySelector('.vetrina-exit') as HTMLElement).style.position).toBe('relative');
	});

	it('the stage is marked data-modal-exempt, so a host modal leaves Exit usable', () => {
		const { layer } = mount();
		expect(layer.hasAttribute('data-modal-exempt')).toBe(true);
	});
});

describe('resolveTheme — caption', () => {
	it('defaults to bar and passes an explicit style through', () => {
		expect(resolveTheme().caption).toBe('bar');
		expect(resolveTheme({ caption: 'scrim' }).caption).toBe('scrim');
		expect(resolveTheme({ caption: 'progress' }).caption).toBe('progress');
	});
});
