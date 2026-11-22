import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoVerdict } from '../photo-verdict';
import { usePhotoContrast } from './photo-contrast-watch';

// The reader is the module the watch loads on demand; each test says what the preview holds when it is read.
const readVerdict = vi.fn<(...a: unknown[]) => Promise<PhotoVerdict | null>>();
vi.mock('../photo-verdict', () => ({ readVerdict: (...a: unknown[]) => readVerdict(...a) }));

const LOW: PhotoVerdict = { low: true, ratio: 2.1, floor: 4.5, fix: 'ink-light', fixRatio: 9, message: 'The text on this photo reads at 2.1:1.', label: 'Set card ink light', src: 'live' };
const CHUNK = '<!-- _class: image spotlight card-clear -->\n\n## A quiet harbor.\n\n![A harbor](sample:photo-wide.svg)\n';
const CONTEXT = {};

/** A stand-in for the shell's preview-paint listener set. */
function paintBus() {
	const listeners = new Set<() => void>();
	return {
		subscribe: (f: () => void) => {
			listeners.add(f);
			return () => {
				listeners.delete(f);
			};
		},
		paint: () => {
			for (const f of listeners) f();
		},
		size: () => listeners.size,
	};
}

/** Let the settle timer fire and the read's promises resolve. */
async function settle() {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1000);
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	readVerdict.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('usePhotoContrast', () => {
	it('reads again when the preview paints after a read that could not measure (a phone swapping Source for Preview)', async () => {
		// The first read finds the preview still showing another slide; the second, after the paint, measures it.
		readVerdict.mockResolvedValueOnce(null).mockResolvedValue(LOW);
		const bus = paintBus();
		const { result } = renderHook(() => usePhotoContrast(CHUNK, 0, CHUNK, CONTEXT, bus.subscribe));
		await settle();
		expect(readVerdict).toHaveBeenCalledTimes(1);
		expect(result.current.findings).toEqual([]);
		act(() => bus.paint());
		await settle();
		expect(readVerdict).toHaveBeenCalledTimes(2);
		expect(result.current.findings.map((f) => f.message)).toEqual([LOW.message]);
	});

	it('reads again when the paint lands during a read that then comes back empty', async () => {
		let release: (v: PhotoVerdict | null) => void = () => {};
		readVerdict.mockImplementationOnce(() => new Promise((r) => (release = r))).mockResolvedValue(LOW);
		const bus = paintBus();
		const { result } = renderHook(() => usePhotoContrast(CHUNK, 0, CHUNK, CONTEXT, bus.subscribe));
		await settle(); // the first read is in flight
		act(() => bus.paint()); // the preview paints while it reads the old frame
		await act(async () => release(null));
		await settle();
		expect(readVerdict).toHaveBeenCalledTimes(2);
		expect(result.current.findings.map((f) => f.message)).toEqual([LOW.message]);
	});

	it('costs no further reads once the slide is measured', async () => {
		readVerdict.mockResolvedValue(LOW);
		const bus = paintBus();
		renderHook(() => usePhotoContrast(CHUNK, 0, CHUNK, CONTEXT, bus.subscribe));
		await settle();
		act(() => {
			bus.paint();
			bus.paint();
		});
		await settle();
		expect(readVerdict).toHaveBeenCalledTimes(1);
	});

	it('stops listening when it unmounts', async () => {
		readVerdict.mockResolvedValue(null);
		const bus = paintBus();
		const { unmount } = renderHook(() => usePhotoContrast(CHUNK, 0, CHUNK, CONTEXT, bus.subscribe));
		expect(bus.size()).toBe(1);
		unmount();
		expect(bus.size()).toBe(0);
	});

	it('drops the verdict the moment the heading part changes, though the `---` slide stays the same (PR #3239)', async () => {
		readVerdict.mockResolvedValueOnce(LOW).mockResolvedValue(null);
		const bus = paintBus();
		const { result, rerender } = renderHook(({ chunk, section }) => usePhotoContrast(chunk, 0, chunk, CONTEXT, bus.subscribe, section), {
			initialProps: { chunk: CHUNK, section: 0 },
		});
		await settle();
		expect(result.current.findings.map((f) => f.pin)).toEqual(['ink-light']);
		// The caret moves to the second part: same `---` slide, another engine slide. Nothing of the first part's read stays.
		rerender({ chunk: CHUNK.replace('A quiet harbor.', 'A second harbor.'), section: 1 });
		expect(result.current.verdict).toBeNull();
		expect(result.current.findings).toEqual([]);
	});
});
