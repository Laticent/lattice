import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStageController } from './stage-window.js';

// A stand-in for the popup handle. `readyState` starts at 'loading' so the load
// gate is exercised the way a real write does it; tests that want the
// already-complete path set it before opening.
function fakeStage(readyState = 'loading') {
	const loadHandlers: Array<() => void> = [];
	return {
		document: { open: vi.fn(), write: vi.fn(), close: vi.fn(), readyState },
		postMessage: vi.fn(),
		closed: false,
		close: vi.fn(function (this: { closed: boolean }) {
			this.closed = true;
		}),
		addEventListener: vi.fn((type: string, fn: () => void) => {
			if (type === 'load') loadHandlers.push(fn);
		}),
		fireLoad() {
			for (const fn of loadHandlers.splice(0)) fn();
		},
	};
}

describe('stage-window — createStageController', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('runs the open → write → load → sync → close lifecycle', () => {
		const win = fakeStage();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onToggle = vi.fn();
		const ctl = createStageController({ buildDoc: () => '<stage/>', getIndex: () => 3, onToggle });

		expect(ctl.toggle()).toBe(true);
		expect(window.open).toHaveBeenCalledTimes(1);
		expect(win.document.write).toHaveBeenCalledWith('<stage/>');
		expect(onToggle).toHaveBeenLastCalledWith(true);
		expect(ctl.isOpen()).toBe(true);

		// Nothing is sent before load — the stage doc attaches its listener while
		// parsing, and postMessage does not queue for a listener that isn't there.
		ctl.sync();
		expect(win.postMessage).not.toHaveBeenCalled();

		win.fireLoad();
		expect(win.postMessage).toHaveBeenCalledWith({ pv: 3 }, '*');

		ctl.close();
		expect(win.close).toHaveBeenCalled();
		expect(onToggle).toHaveBeenLastCalledWith(false);
		expect(ctl.isOpen()).toBe(false);
	});

	it('sends index 0 rather than treating it as missing', () => {
		const win = fakeStage();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const ctl = createStageController({ buildDoc: () => '<stage/>', getIndex: () => 0, onToggle: vi.fn() });
		ctl.toggle();
		win.fireLoad();
		expect(win.postMessage).toHaveBeenCalledWith({ pv: 0 }, '*');
	});

	it('syncs immediately when the document is already complete', () => {
		const win = fakeStage('complete');
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const ctl = createStageController({ buildDoc: () => '<stage/>', getIndex: () => 1, onToggle: vi.fn() });
		ctl.toggle();
		// No load event will arrive for a document that already finished.
		expect(win.addEventListener).not.toHaveBeenCalled();
		expect(win.postMessage).toHaveBeenCalledWith({ pv: 1 }, '*');
	});

	it('reports a blocked popup instead of pretending it opened', () => {
		vi.spyOn(window, 'open').mockReturnValue(null);
		const onToggle = vi.fn();
		const ctl = createStageController({ buildDoc: () => '<stage/>', getIndex: () => 0, onToggle });

		expect(ctl.toggle()).toBe(false);
		expect(ctl.isOpen()).toBe(false);
		expect(onToggle).not.toHaveBeenCalled();
	});

	it('opens even before the deck has rendered, and fills in on refresh', () => {
		const win = fakeStage();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		let doc = '';
		const ctl = createStageController({ buildDoc: () => doc, getIndex: () => 2, onToggle: vi.fn() });

		ctl.toggle();
		expect(ctl.isOpen()).toBe(true);
		expect(win.document.write).not.toHaveBeenCalled();

		doc = '<stage/>';
		ctl.refresh();
		expect(win.document.write).toHaveBeenCalledWith('<stage/>');
		win.fireLoad();
		expect(win.postMessage).toHaveBeenCalledWith({ pv: 2 }, '*');
	});

	it('re-gates on refresh so a rewritten document is not posted to mid-parse', () => {
		const win = fakeStage();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const ctl = createStageController({ buildDoc: () => '<stage/>', getIndex: () => 4, onToggle: vi.fn() });

		ctl.toggle();
		win.fireLoad();
		win.postMessage.mockClear();

		ctl.refresh(); // the deck/palette changed — the whole document is rewritten
		ctl.sync();
		expect(win.postMessage).not.toHaveBeenCalled(); // gate re-armed

		win.fireLoad();
		expect(win.postMessage).toHaveBeenCalledWith({ pv: 4 }, '*');
	});

	it('notices a human closing the Stage, since the stage document never reports it', () => {
		vi.useFakeTimers();
		const win = fakeStage();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onToggle = vi.fn();
		const ctl = createStageController({ buildDoc: () => '<stage/>', getIndex: () => 0, onToggle });

		ctl.toggle();
		expect(ctl.isOpen()).toBe(true);

		win.closed = true; // the human closed the window; nothing was posted to us
		vi.advanceTimersByTime(1000);

		expect(onToggle).toHaveBeenLastCalledWith(false);
		expect(ctl.isOpen()).toBe(false);
	});

	it('stops polling once closed, so a torn-down Stage cannot keep firing', () => {
		vi.useFakeTimers();
		const win = fakeStage();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onToggle = vi.fn();
		const ctl = createStageController({ buildDoc: () => '<stage/>', getIndex: () => 0, onToggle });

		ctl.toggle();
		ctl.close();
		onToggle.mockClear();
		vi.advanceTimersByTime(5000);
		expect(onToggle).not.toHaveBeenCalled();
	});

	it('toggles closed on a second press', () => {
		const win = fakeStage();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const ctl = createStageController({ buildDoc: () => '<stage/>', getIndex: () => 0, onToggle: vi.fn() });

		ctl.toggle();
		expect(ctl.isOpen()).toBe(true);
		expect(ctl.toggle()).toBe(false);
		expect(win.close).toHaveBeenCalled();
		expect(ctl.isOpen()).toBe(false);
	});
});
