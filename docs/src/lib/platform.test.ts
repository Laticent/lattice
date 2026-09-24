import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isDesktop, saveFile } from './platform';

// The platform seam's two hosts. The web half pins the property the whole design rests
// on: the download link is clicked SYNCHRONOUSLY, inside the caller's user gesture. The
// desktop half pins the IPC contract `desktop/src-tauri/src/lib.rs` implements: raw
// bytes as the body, the file name URI-encoded in a header, a boolean back.

type W = Window & { __TAURI_INTERNALS__?: unknown };

describe('saveFile — web host', () => {
	let created: Blob[];
	beforeEach(() => {
		created = [];
		URL.createObjectURL = vi.fn((b: Blob) => {
			created.push(b);
			return 'blob:test';
		}) as typeof URL.createObjectURL;
		URL.revokeObjectURL = vi.fn();
	});

	it('clicks a download link before returning, so the browser still sees the user gesture', () => {
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
			expect(this.download).toBe('deck.pdf');
			expect(this.href).toBe('blob:test');
		});
		const blob = new Blob(['%PDF'], { type: 'application/pdf' });
		const pending = saveFile('deck.pdf', blob);
		// No await yet: the click has already happened.
		expect(click).toHaveBeenCalledTimes(1);
		expect(created).toEqual([blob]);
		expect(document.querySelector('a[download]')).toBeNull();
		click.mockRestore();
		return expect(pending).resolves.toBe('saved');
	});

	it('is not the desktop', () => {
		expect(isDesktop()).toBe(false);
	});
});

describe('saveFile — desktop host', () => {
	const invoke = vi.fn();
	beforeEach(() => {
		// jsdom's Blob has no `arrayBuffer()` (every real webview does), so read it the way
		// jsdom can. Test-only: the seam itself calls the standard method.
		if (!Blob.prototype.arrayBuffer) {
			Blob.prototype.arrayBuffer = function (this: Blob) {
				return new Promise<ArrayBuffer>((resolve, reject) => {
					const r = new FileReader();
					r.onload = () => resolve(r.result as ArrayBuffer);
					r.onerror = () => reject(r.error);
					r.readAsArrayBuffer(this);
				});
			};
		}
		invoke.mockReset();
		(window as W).__TAURI_INTERNALS__ = { invoke };
	});
	afterEach(() => {
		delete (window as W).__TAURI_INTERNALS__;
	});

	it('sends the bytes raw with the name in a header', async () => {
		invoke.mockResolvedValue(true);
		const result = await saveFile('Q3 review — final.md', new Blob(['# Hi']));
		expect(isDesktop()).toBe(true);
		expect(result).toBe('saved');
		const [cmd, body, options] = invoke.mock.calls[0];
		expect(cmd).toBe('save_file');
		expect(body).toBeInstanceOf(Uint8Array);
		expect(new TextDecoder().decode(body)).toBe('# Hi');
		expect(decodeURIComponent(options.headers['x-lattice-filename'])).toBe('Q3 review — final.md');
	});

	it('reports a dismissed dialog as cancelled and an IPC error as failed', async () => {
		invoke.mockResolvedValueOnce(false);
		expect(await saveFile('a.md', new Blob(['x']))).toBe('cancelled');
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		invoke.mockRejectedValueOnce(new Error('disk full'));
		expect(await saveFile('a.md', new Blob(['x']))).toBe('failed');
		err.mockRestore();
	});
	it('opens one dialog at a time: a second save waits for the first to answer', async () => {
		let answerFirst: (v: boolean) => void = () => {};
		invoke.mockImplementationOnce(() => new Promise((r) => { answerFirst = r; })).mockResolvedValueOnce(true);
		const first = saveFile('a.md', new Blob(['a']));
		const second = saveFile('b.md', new Blob(['b']));
		await new Promise((r) => setTimeout(r, 20));
		expect(invoke).toHaveBeenCalledTimes(1);
		answerFirst(false);
		expect(await first).toBe('cancelled');
		expect(await second).toBe('saved');
		expect(invoke).toHaveBeenCalledTimes(2);
	});
});
