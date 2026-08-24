import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresentOverlay } from './PresentOverlay';

// Present's whole-screen verb — the CAPABILITY GATE and the Escape handoff.
//
// jsdom ships no Fullscreen API, which is exactly the shape of the device this
// gate exists for (iPhone Safari), so the un-stubbed default here IS the
// unsupported case. Each supported-case test installs the members the module
// reads, which keeps the two states explicit rather than ambient.
vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
vi.mock('./studio-presenter', () => ({ buildPresenterStageDoc: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const slides = ['<!-- _class: title -->\n\n# One\n\nThe first slide.', '<!-- _class: kpi -->\n\n# Two\n\nThe second slide.'];

/** Install a Fullscreen API on jsdom's document. `element` seeds the CURRENT state. */
function withFullscreenApi({ element = null as Element | null } = {}) {
	const requestFullscreen = vi.fn(async function (this: Element) {
		Object.defineProperty(document, 'fullscreenElement', { value: this, configurable: true });
		document.dispatchEvent(new Event('fullscreenchange'));
	});
	const exit = vi.fn(async () => {
		Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
		document.dispatchEvent(new Event('fullscreenchange'));
	});
	Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
	Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
	Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
	Object.defineProperty(Element.prototype, 'requestFullscreen', { value: requestFullscreen, configurable: true, writable: true });
	return { requestFullscreen, exit };
}

beforeEach(() => {
	for (const k of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen'] as const) {
		Object.defineProperty(document, k, { value: undefined, configurable: true });
	}
	// The key must be GONE, not undefined — `requestFullscreen?.()` is what the module
	// calls, so an own property holding `undefined` would still read as "absent" but a
	// leftover mock from a prior test would not. Restore jsdom's real prototype.
	delete (Element.prototype as unknown as Record<string, unknown>).requestFullscreen;
});
afterEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe('Present — full screen', () => {
	// The rule this is here to keep: HIDDEN where the API is absent, never a disabled
	// control. iPhone Safari has shipped no Fullscreen API for arbitrary elements for
	// the whole life of the API, and a greyed-out button there sends the reader hunting
	// for a setting that does not exist.
	it('shows no button at all where the browser has no Fullscreen API', () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		expect(screen.queryByRole('button', { name: /full screen/i })).toBeNull();
	});

	it('offers the button where the browser allows fullscreen, and requests it on the ROOT element', async () => {
		const { requestFullscreen } = withFullscreenApi();
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		const btn = screen.getByRole('button', { name: 'Full screen' });
		expect(btn).toHaveAttribute('aria-pressed', 'false');
		await user.click(btn);
		expect(requestFullscreen).toHaveBeenCalledTimes(1);
		// documentElement, not the dialog — the overlay already covers the viewport, and
		// the root is exempt from the UA rules that restyle a non-root fullscreen element.
		expect(requestFullscreen.mock.instances[0]).toBe(document.documentElement);
		expect(await screen.findByRole('button', { name: 'Leave full screen' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('tracks a change the button did not make', async () => {
		withFullscreenApi();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument();
		// What F11 / the traffic lights / iPad Safari's own exit chip look like from here.
		act(() => {
			Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, configurable: true });
			document.dispatchEvent(new Event('fullscreenchange'));
		});
		expect(await screen.findByRole('button', { name: 'Leave full screen' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('toggles on `f`, and stays silent on a browser that cannot', async () => {
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		await user.keyboard('f'); // no API installed — must not throw, must do nothing
		expect(screen.queryByRole('button', { name: /full screen/i })).toBeNull();
	});

	it('toggles on `f` where it is available', async () => {
		const { requestFullscreen } = withFullscreenApi();
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		await user.keyboard('f');
		expect(requestFullscreen).toHaveBeenCalledTimes(1);
	});

	// The defect this guard prevents: Safari delivers the Escape keydown that leaves
	// fullscreen (Chromium and Firefox swallow it), so one press both dropped out of
	// fullscreen AND closed Present — dumping a presenter into the editor mid-sentence.
	// We exit fullscreen ourselves rather than deferring, so the step is the same on a
	// browser that never acts on Escape at all (measured: headless Chromium).
	it('leaves fullscreen on Escape without closing Present', async () => {
		const { exit } = withFullscreenApi({ element: document.documentElement });
		const onClose = vi.fn();
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={onClose} options={options} slides={slides} notify={() => {}} />);
		await user.keyboard('{Escape}');
		expect(exit).toHaveBeenCalledTimes(1);
		expect(onClose).not.toHaveBeenCalled();
	});

	it('still closes Present on Escape when not fullscreen', async () => {
		withFullscreenApi();
		const onClose = vi.fn();
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={onClose} options={options} slides={slides} notify={() => {}} />);
		await user.keyboard('{Escape}');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('says nothing when the browser accepts', async () => {
		withFullscreenApi();
		const notify = vi.fn();
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={notify} />);
		await user.click(screen.getByRole('button', { name: 'Full screen' }));
		await screen.findByRole('button', { name: 'Leave full screen' });
		expect(notify).not.toHaveBeenCalled();
	});

	// THE REPORTED BUG, at the component: Firefox on iPad is a WKWebView, where Apple gates
	// this API behind a flag that is OFF by default for third-party apps — so the engine
	// answers "supported", the request goes quiet, and the control does nothing. It must
	// both SAY so and RETIRE itself, since the browser will answer the same way every time.
	it('retires the control when the browser accepts and does nothing (WKWebView)', async () => {
		withFullscreenApi();
		Object.defineProperty(Element.prototype, 'requestFullscreen', { value: vi.fn(async () => {}), configurable: true, writable: true });
		const notify = vi.fn();
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={notify} />);
		await user.click(screen.getByRole('button', { name: 'Full screen' }));
		await waitFor(() => expect(notify).toHaveBeenCalledTimes(1), { timeout: 4000 });
		expect(notify.mock.calls[0][0]).toContain('will not hand over the screen');
		await waitFor(() => expect(screen.queryByRole('button', { name: /full screen/i })).toBeNull());
	}, 10_000);

	// A spoken rejection may be transient (an untrusted gesture), so it is reported but the
	// control STAYS — retiring it would remove the way back for a reader who can retry.
	it('keeps the control after a spoken rejection', async () => {
		withFullscreenApi();
		Object.defineProperty(Element.prototype, 'requestFullscreen', {
			value: vi.fn(async () => { throw new TypeError('Request for fullscreen was denied because the request was not user-initiated.'); }),
			configurable: true,
			writable: true,
		});
		const notify = vi.fn();
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={notify} />);
		await user.click(screen.getByRole('button', { name: 'Full screen' }));
		await waitFor(() => expect(notify).toHaveBeenCalledTimes(1), { timeout: 4000 });
		expect(notify.mock.calls[0][0]).toContain('not user-initiated');
		expect(screen.getByRole('button', { name: 'Full screen' })).toHaveAttribute('aria-pressed', 'false');
	}, 10_000);

	// Closing Present must give the window back. Otherwise the EDITOR is left
	// full-screen in a state nothing explains, since the control that caused it is gone.
	it('leaves fullscreen when Present closes', async () => {
		const { exit } = withFullscreenApi({ element: document.documentElement });
		const { rerender } = render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		rerender(<PresentOverlay open={false} onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		expect(exit).toHaveBeenCalledTimes(1);
	});
});
