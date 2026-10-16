import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isDesktop, saveFile } from './platform';
import { DESKTOP_SIGN_IN_CALLBACK, signIn } from './sign-in';

// The platform seam's two hosts. The web half pins the property the whole design rests
// on: the download link is clicked SYNCHRONOUSLY, inside the caller's user gesture. The
// desktop half pins the IPC contract `desktop/src-tauri/src/lib.rs` implements: raw
// bytes as the body, the file name URI-encoded in a header, a boolean back.

type W = Window & { __TAURI_INTERNALS__?: unknown };

describe('saveFile — outside the desktop app', () => {
	// The browser save is download.js's (download.test.ts pins its click inside the gesture);
	// the seam has nothing to do there and must not click a second link.
	it('does nothing and says so', async () => {
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
		await expect(saveFile('deck.pdf', new Blob(['%PDF']))).resolves.toBe('failed');
		expect(click).not.toHaveBeenCalled();
		click.mockRestore();
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

describe('signIn — the Studio never leaves the screen on desktop', () => {
	const invoke = vi.fn();
	beforeEach(() => {
		invoke.mockReset();
		(window as W).__TAURI_INTERNALS__ = { invoke };
	});
	afterEach(() => {
		delete (window as W).__TAURI_INTERNALS__;
	});

	it('builds the URL for the localhost callback and hands both to the sign-in window', async () => {
		invoke.mockResolvedValue(`${DESKTOP_SIGN_IN_CALLBACK}?code=abc`);
		const begin = vi.fn(async (cb: string) => `https://openrouter.ai/auth?callback_url=${encodeURIComponent(cb)}`);
		const back = await signIn(begin, 'https://lattice.example/studio/');
		expect(begin).toHaveBeenCalledWith(DESKTOP_SIGN_IN_CALLBACK);
		expect(invoke).toHaveBeenCalledWith('sign_in', {
			url: `https://openrouter.ai/auth?callback_url=${encodeURIComponent(DESKTOP_SIGN_IN_CALLBACK)}`,
			callback: DESKTOP_SIGN_IN_CALLBACK,
		});
		expect(back).toBe(`${DESKTOP_SIGN_IN_CALLBACK}?code=abc`);
	});

	it('resolves null when the user closes the sign-in window', async () => {
		invoke.mockResolvedValue(null);
		expect(await signIn(async () => 'https://openrouter.ai/auth', 'x')).toBeNull();
	});

	it('opens no window when there is no URL to open', async () => {
		expect(await signIn(async () => null, 'x')).toBeNull();
		expect(invoke).not.toHaveBeenCalled();
	});
});

describe('signIn — web host', () => {
	it('sends the page itself to the service, with the web callback', async () => {
		const assign = vi.fn();
		const original = window.location;
		Object.defineProperty(window, 'location', { configurable: true, value: { ...original, set href(v: string) { assign(v); } } });
		try {
			const begin = vi.fn(async (cb: string) => `https://openrouter.ai/auth?cb=${cb}`);
			void signIn(begin, 'https://lattice.example/studio/');
			await new Promise((r) => setTimeout(r, 0));
			expect(begin).toHaveBeenCalledWith('https://lattice.example/studio/');
			expect(assign).toHaveBeenCalledWith('https://openrouter.ai/auth?cb=https://lattice.example/studio/');
		} finally {
			Object.defineProperty(window, 'location', { configurable: true, value: original });
		}
	});
});

// The seam only works if nothing goes around it: the desktop app's webview ignores an
// <a download> click, so a save that bypasses saveFile fails there with no error at all.
// A grep for `a.download` alone missed one (a library's own saver, pptxgenjs `writeFile`),
// so this census also catches `writeFile(` called on a library object.
describe('every Studio save goes through the seam', () => {
	it('no source file outside the seam saves by itself', async () => {
		const { readFileSync, readdirSync, statSync } = await import('node:fs');
		const { join, relative } = await import('node:path');
		const root = join(__dirname, '..');
		// A standalone demo page; the desktop app opens /studio/ and never links to it.
		const outsideTheApp = new Set(['pages/vetrina.astro']);
		const bypass = /\.download\s*=|setAttribute\(\s*['"]download['"]|\.writeFile\s*\(/;
		const offenders: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) { walk(path); continue; }
				if (!/\.(js|mjs|ts|tsx|astro)$/.test(name) || /\.test\./.test(name)) continue;
				const rel = relative(root, path);
				// The seam's two halves: download.js clicks the browser's link and sends a desktop
				// save to lib/platform.js, which shows the native dialog.
				if (rel === 'lib/platform.js' || rel === 'components/studio/download.js' || outsideTheApp.has(rel)) continue;
				readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
					if (bypass.test(line) && !/^\s*(\/\/|\*)/.test(line)) offenders.push(`${rel}:${i + 1}`);
				});
			}
		};
		walk(root);
		expect(offenders).toEqual([]);
	});
});

// The Studio calls download.js, not saveFile: in the desktop app download.js hands the save
// here, and its `onSaved` must mean "the file exists". The backup records itself in `onSaved`,
// so a dismissed dialog that still called it would switch off the backup nudge.
describe('download.js in the desktop app', () => {
	const invoke = vi.fn();
	beforeEach(() => {
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

	it('saves through the native dialog, clicks no link, and calls onSaved only for a written file', async () => {
		const { downloadBlob } = await import('@/components/studio/download');
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
		const onSaved = vi.fn();

		invoke.mockResolvedValueOnce(null); // the author dismissed the dialog
		downloadBlob('backup.zip', new Blob(['zip']), { onSaved });
		await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
		await new Promise((r) => setTimeout(r));
		expect(onSaved).not.toHaveBeenCalled();

		invoke.mockResolvedValueOnce(true); // saved
		downloadBlob('backup.zip', new Blob(['zip']), { onSaved });
		await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
		expect(invoke.mock.calls[0][0]).toBe('save_file');
		expect(click).not.toHaveBeenCalled();
		click.mockRestore();
	});
});
