// Present keeps a playing deck playing (2026-11-20 owner report, four defects):
//   1. the phone's screen slept and locked mid-deck — Present now holds a screen wake lock, and binds the OS media
//      controls so a pocketed phone can still be paused;
//   3. Previous / Next stopped continuous play — a move made while playing now carries play to the new slide;
//   4. exiting Present left the narration sounding over the editor — closing now stops the reader.
// (2, the landscape-phone layout, is e2e/present-immersive.spec.ts plus the immersive cases below.)
//
// Fake time throughout, stepped in fixed slices (HARD RULE #32): every wait is a condition with a budget in FAKE ms.
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAuthoring } from '@/playground/authoring-door.js';
import { PresentOverlay } from './PresentOverlay';

beforeAll(() => loadAuthoring());

const voiceStop = vi.fn();
vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({ synthOne: async () => ({ rung: 'silent', bytes: null, key: 'k' }), speakThis() {}, stop: () => voiceStop(), pause() {}, resume() {}, rung: () => 'silent', warm: () => {} }),
}));
vi.mock('./studio-stage', () => ({ buildStageDocument: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const spoken = (heading: string, line: string) => `<!-- _class: title -->\n\n# ${heading}\n\n<!-- say: ${line} -->`;
const silent = '<!-- _class: title -->\n\n<!-- say: -->';
const deck = [spoken('One', 'The first slide speaks.'), spoken('Two', 'The second slide speaks.'), spoken('Three', 'The third slide speaks.')];

const STEP = 10;
const step = (ms = STEP) =>
	act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
async function stepUntil(done: () => boolean, budget = 12_000): Promise<boolean> {
	for (let spent = 0; spent < budget && !done(); spent += STEP) await step();
	return done();
}
const press = async (name: string) => {
	fireEvent.click(screen.getAllByRole('button', { name })[0]);
	await step(0);
};
const at = (n: number, of = 3) => !!screen.queryByText(`${n} / ${of}`);
const delivering = () => !!screen.queryByRole('button', { name: 'Pause' });

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('lattice-present-pace', 'brisk');
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	localStorage.clear();
	vi.clearAllMocks();
});

describe('Present — continuous play survives navigation', () => {
	it('Next while playing plays the next slide and the chain goes on', async () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={deck} />);
		await press('Play the presentation');
		expect(await stepUntil(delivering, 2000)).toBe(true);
		await press('Next slide');
		expect(await stepUntil(() => at(2), 500)).toBe(true);
		// The chain stalled here before: slide 2 sat silent with the transport on Play. Now slide 2 speaks, finishes,
		// and the deck goes on to slide 3 by itself.
		expect(await stepUntil(() => at(3)), 'the move stopped continuous play').toBe(true);
	}, 30_000);

	it('Pause is still the way to stop: a move after Pause does not play', async () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={deck} />);
		await press('Play the presentation');
		expect(await stepUntil(delivering, 2000)).toBe(true);
		await press('Pause');
		await press('Next slide');
		await step(6000);
		expect(at(2)).toBe(true);
		expect(screen.getByRole('button', { name: 'Play the presentation' })).toBeInTheDocument();
	}, 30_000);

	it('Previous onto a SILENT slide while playing shows it for a moment, not bounces straight back', async () => {
		const slides = [silent, spoken('Two', 'The second slide speaks.'), spoken('Three', 'The third slide speaks.')];
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={1} />);
		expect(at(2)).toBe(true);
		await press('Play the presentation');
		expect(await stepUntil(delivering, 2000)).toBe(true);
		await press('Previous slide');
		expect(await stepUntil(() => at(1), 500)).toBe(true);
		await step(2000);
		expect(at(1), 'the silent slide was skipped the moment the presenter reached it').toBe(true);
		// …and then continuous play moves on from it.
		expect(await stepUntil(() => at(2), 6000)).toBe(true);
	}, 30_000);
});

describe('Present — the silent-slide hold answers the transport (checker F1, F2)', () => {
	it('reads Pause through the whole hold, and Pause stops the deck there', async () => {
		localStorage.setItem('lattice-present-pace', 'natural'); // an arrival beat shorter than the hold, the case that broke
		const slides = [silent, spoken('Two', 'The second slide speaks.'), spoken('Three', 'The third slide speaks.')];
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={1} />);
		await press('Play the presentation');
		expect(await stepUntil(delivering, 2000)).toBe(true);
		await press('Previous slide');
		expect(await stepUntil(() => at(1), 500)).toBe(true);
		await step(2000);
		expect(delivering(), 'the transport read Play while the deck was about to move on').toBe(true);
		await press('Pause');
		await step(6000);
		expect(at(1), 'Pause did not stop the hold from moving on').toBe(true);
		expect(screen.getByRole('button', { name: 'Play the presentation' })).toBeInTheDocument();
	}, 30_000);

	it('a move that changed nothing does not make the next move look like autoplay’s own', async () => {
		const slides = [spoken('One', 'The first slide speaks.'), silent, spoken('Three', 'The third slide speaks.')];
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} />);
		await press('Play the presentation');
		expect(await stepUntil(delivering, 2000)).toBe(true);
		fireEvent.keyDown(window, { key: 'Home' }); // already on slide 1: arms a hand-off nothing consumes
		await step(0);
		await press('Next slide');
		expect(await stepUntil(() => at(2), 500)).toBe(true);
		await step(1000);
		expect(at(2), 'the silent slide was skipped as if autoplay had moved there').toBe(true);
	}, 30_000);
});

describe('Present — immersive on a phone held sideways', () => {
	const LANDSCAPE = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)';
	let restore: () => void = () => {};
	beforeEach(() => {
		const orig = window.matchMedia;
		window.matchMedia = ((q: string) => ({ matches: q === LANDSCAPE, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
		restore = () => {
			window.matchMedia = orig;
		};
	});
	afterEach(() => restore());

	const top = () => document.querySelector('[data-present-chrome="top"]') as HTMLElement;
	const hidden = () => top().className.includes('opacity-0');
	// A tap is a click (the browser sends none for a swipe or a pinch); the pointer-down before it, when the engine sends
	// one, is where the shown/hidden state is read.
	const tap = (el: Element) => {
		fireEvent.pointerDown(el, { clientX: 100, clientY: 100, isPrimary: true });
		fireEvent.click(el, { clientX: 100, clientY: 100 });
	};

	it('fills the screen, fades the chrome, and a tap toggles it', async () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={deck} />);
		const row = document.querySelector('[data-present-immersive]') as HTMLElement;
		expect(row).not.toBeNull();
		expect(hidden()).toBe(false);
		await step(4000);
		expect(hidden(), 'the chrome never faded').toBe(true);
		tap(row);
		await step(0);
		expect(hidden(), 'a tap did not bring the chrome back').toBe(false);
		tap(row);
		await step(0);
		expect(hidden(), 'a tap while shown did not hide it').toBe(true);
	});

	it('a tap with no pointer events before it (Playwright WebKit sends only the click) still toggles', async () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={deck} />);
		const row = document.querySelector('[data-present-immersive]') as HTMLElement;
		await step(4000);
		fireEvent.click(row);
		await step(0);
		expect(hidden(), 'a bare click did not bring the chrome back').toBe(false);
	});

	it('a tap the way iOS sends it (pointerdown, touchstart, a click on another clock) brings the chrome back and keeps it', async () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={deck} />);
		await step(4000);
		expect(hidden()).toBe(true);
		// The gesture layer: the backdrop, whose native touchstart listener reveals the chrome before React sees the event.
		const backdrop = document.querySelector('.lx-ui.fixed.inset-0') as HTMLElement;
		const at = { clientX: 100, clientY: 100 };
		const stamped = <E extends Event>(e: E, t: number) => {
			Object.defineProperty(e, 'timeStamp', { value: t });
			return e;
		};
		// The touch half on the time-since-load clock, as WebKit stamps it…
		fireEvent(backdrop, stamped(createEvent.pointerDown(backdrop, { ...at, isPrimary: true }), 5000));
		fireEvent(backdrop, stamped(createEvent.touchStart(backdrop, { touches: [at], targetTouches: [at], changedTouches: [at] }), 5001));
		await step(0);
		// …and the click on the wall clock: WebKit can stamp touch and mouse events on different clocks, so the tap rule must
		// not compare event timestamps at all.
		const click = new MouseEvent('click', { bubbles: true, cancelable: true, ...at });
		Object.defineProperty(click, 'timeStamp', { value: Date.now() });
		act(() => {
			backdrop.dispatchEvent(click);
		});
		await step(0);
		expect(hidden(), 'the tap showed the chrome and hid it again at once').toBe(false);
		await step(1500);
		expect(hidden(), 'the chrome did not stay up for the bloom timer').toBe(false);
	});

	it('a two-finger touch is a pinch, not a tap', async () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={deck} />);
		const row = document.querySelector('[data-present-immersive]') as HTMLElement;
		await step(4000);
		fireEvent.pointerDown(row, { clientX: 100, clientY: 100, isPrimary: true, pointerId: 1 });
		fireEvent.pointerDown(row, { clientX: 140, clientY: 100, isPrimary: false, pointerId: 2 });
		fireEvent.pointerUp(row, { clientX: 140, clientY: 100, isPrimary: false, pointerId: 2 });
		fireEvent.pointerUp(row, { clientX: 100, clientY: 100, isPrimary: true, pointerId: 1 });
		await step(0);
		expect(hidden()).toBe(true);
	});
});

describe('Present — turning the phone does not show the relayout (owner recording, 2026-11-20)', () => {
	let fire: () => void = () => {};
	let restore: () => void = () => {};
	beforeEach(() => {
		const orig = window.matchMedia;
		window.matchMedia = ((q: string) => ({
			matches: false,
			media: q,
			addEventListener: (_t: string, fn: () => void) => {
				if (q === '(orientation: landscape)') fire = fn;
			},
			removeEventListener() {},
			addListener() {},
			removeListener() {},
			onchange: null,
			dispatchEvent: () => false,
		})) as unknown as typeof window.matchMedia;
		restore = () => {
			window.matchMedia = orig;
		};
	});
	afterEach(() => restore());
	const settling = () => screen.getByRole('dialog', { name: 'Present' }).hasAttribute('data-settling');

	it('holds the stage back while the screen turns, then shows it once the size is still', async () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={deck} />);
		await step(0);
		expect(settling()).toBe(false);
		act(() => fire());
		expect(settling(), 'the stage stayed visible through the relayout').toBe(true);
		expect(await stepUntil(() => !settling(), 1300), 'the stage never came back').toBe(true);
	});
});

describe('Present — leaving stops the narration', () => {
	it('closing Present stops the reader and nothing plays on', async () => {
		const props = { onClose: () => {}, options, slides: deck };
		const { rerender } = render(<PresentOverlay open {...props} />);
		await press('Play the presentation');
		expect(await stepUntil(delivering, 2000)).toBe(true);
		voiceStop.mockClear();
		rerender(<PresentOverlay open={false} {...props} />);
		await step(0);
		expect(voiceStop, 'the voice was left sounding after Present closed').toHaveBeenCalled();
		// Reopened, the deck is not mid-delivery: nothing kept running while it was closed.
		await step(8000);
		rerender(<PresentOverlay open {...props} />);
		await step(0);
		expect(screen.getByRole('button', { name: 'Play the presentation' })).toBeInTheDocument();
	}, 30_000);
});

describe('Present — the phone stays awake and answers its media keys', () => {
	it('holds a screen wake lock while open and lets it go on close', async () => {
		const release = vi.fn(async () => {});
		const request = vi.fn(async () => ({ release, addEventListener() {} }));
		Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
		try {
			const props = { onClose: () => {}, options, slides: deck };
			const { rerender } = render(<PresentOverlay open {...props} />);
			await step(0);
			expect(request).toHaveBeenCalledWith('screen');
			// Published for the iOS Simulator suite, which cannot see the lock any other way.
			expect(screen.getByRole('dialog', { name: 'Present' }).getAttribute('data-wake')).toBe('held');
			rerender(<PresentOverlay open={false} {...props} />);
			await step(0);
			expect(release).toHaveBeenCalled();
		} finally {
			Reflect.deleteProperty(navigator, 'wakeLock');
		}
	});

	it('asks again from inside a tap when the browser refused the lock outside a gesture (WebKit)', async () => {
		const release = vi.fn(async () => {});
		let gesture = false;
		const request = vi.fn(async () => {
			if (!gesture) throw new DOMException('Not allowed outside a user gesture', 'NotAllowedError');
			return { release, addEventListener() {} };
		});
		Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
		try {
			render(<PresentOverlay open onClose={() => {}} options={options} slides={deck} />);
			await step(0);
			const dialog = screen.getByRole('dialog', { name: 'Present' });
			expect(dialog.getAttribute('data-wake'), 'the refused request was reported as held').toBe('not held');
			gesture = true;
			fireEvent.pointerDown(dialog);
			await step(0);
			expect(request).toHaveBeenCalledTimes(2);
			expect(dialog.getAttribute('data-wake'), 'a tap did not take the lock').toBe('held');
		} finally {
			Reflect.deleteProperty(navigator, 'wakeLock');
		}
	});

	it('drives the deck from the lock screen / headset (Media Session) and unbinds on close', async () => {
		const handlers = new Map<string, (() => void) | null>();
		const mediaSession = { setActionHandler: (a: string, h: (() => void) | null) => handlers.set(a, h), playbackState: 'none', metadata: null };
		Object.defineProperty(navigator, 'mediaSession', { value: mediaSession, configurable: true });
		try {
			const props = { onClose: () => {}, options, slides: deck };
			const { rerender } = render(<PresentOverlay open {...props} />);
			await step(0);
			act(() => handlers.get('nexttrack')?.());
			expect(await stepUntil(() => at(2), 500)).toBe(true);
			act(() => handlers.get('play')?.());
			expect(await stepUntil(delivering, 2000)).toBe(true);
			expect(mediaSession.playbackState).toBe('playing');
			act(() => handlers.get('pause')?.());
			expect(await stepUntil(() => !delivering(), 500)).toBe(true);
			rerender(<PresentOverlay open={false} {...props} />);
			await step(0);
			expect(handlers.get('play')).toBeNull();
		} finally {
			Reflect.deleteProperty(navigator, 'mediaSession');
		}
	}, 30_000);
});
