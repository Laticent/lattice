// The Studio's one download helper names every saved file on the `blob:` URL itself, not
// only in the anchor's `download` attribute, and on iOS (every browser) saves through
// the share sheet — Firefox for iOS otherwise saves the URL's UUID (`76f752a8-….html`, the
// owner's iPhone). download.js and download-ios.js say why; this pins both paths and that
// nothing routes around them.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armDownloadLink, dismissPendingSave, downloadBlob, downloadText, namedFileUrl } from './download';
import { iosNeedsShareSheet } from './download-ios';

let made: Blob[];
let revoked: string[];
let clicked: HTMLAnchorElement[];

beforeEach(() => {
	made = [];
	revoked = [];
	clicked = [];
	// spyOn, not assignment: restoreAllMocks puts the real functions back.
	vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
		made.push(b as Blob);
		return `blob:probe/${made.length}`;
	});
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => {
		revoked.push(u);
	});
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
		clicked.push(this);
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('the download helper', () => {
	it('makes the URL from a File that carries the name and the type', () => {
		namedFileUrl(new Blob(['x'], { type: 'application/pdf' }), 'Q3-Board-Review.pdf');
		const f = made[0] as File;
		expect(f).toBeInstanceOf(File);
		expect(f.name).toBe('Q3-Board-Review.pdf');
		expect(f.type).toBe('application/pdf');
	});

	it('keeps the download attribute too, and revokes only after a save dialog could have read the URL', () => {
		vi.useFakeTimers();
		downloadBlob('deck.html', new Blob(['<p>'], { type: 'text/html' }));
		expect(clicked).toHaveLength(1);
		expect(clicked[0].download).toBe('deck.html');
		expect((made[0] as File).name).toBe('deck.html');
		vi.advanceTimersByTime(59_000);
		expect(revoked).toEqual([]);
		vi.advanceTimersByTime(1_000);
		expect(revoked).toEqual(['blob:probe/1']);
	});

	it('arms a link the user clicks with the same named URL', () => {
		const a = document.createElement('a');
		armDownloadLink(a, 'tour.ltt.json', new Blob(['{}'], { type: 'application/json' }));
		expect(a.download).toBe('tour.ltt.json');
		expect((made[0] as File).name).toBe('tour.ltt.json');
	});
});

// Real user agents. Firefox for iOS names a blob: download from the URL's UUID whatever the
// page asks (its DownloadHelper.js never reads the `download` attribute), so iOS saves through
// the share sheet — in every iOS browser, for one native behavior; desktop keeps the download.
const UA = {
	firefoxIPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
	chromeIPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
	edgeIPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/130.0.2849.80 Mobile/15E148 Safari/605.1.15',
	safariIPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
	safariIPad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
	firefoxDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0',
};

describe('which browsers save through the share sheet', () => {
	it('every iOS browser, Safari included — one native save on iOS', () => {
		expect(iosNeedsShareSheet(UA.firefoxIPhone)).toBe(true);
		expect(iosNeedsShareSheet(UA.chromeIPhone)).toBe(true);
		expect(iosNeedsShareSheet(UA.edgeIPhone)).toBe(true);
		expect(iosNeedsShareSheet(UA.safariIPhone)).toBe(true);
		expect(iosNeedsShareSheet(UA.safariIPad, 'MacIntel', 5)).toBe(true);
	});
	it('not a desktop browser, a real Mac included', () => {
		expect(iosNeedsShareSheet(UA.firefoxDesktop, 'MacIntel', 0)).toBe(false);
		expect(iosNeedsShareSheet(UA.safariIPad, 'MacIntel', 0)).toBe(false);
	});
});

describe('the two-tap save on Firefox for iOS', () => {
	it('clicks no link; a Save toast opens the share sheet with the named file', async () => {
		vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA.firefoxIPhone);
		const shared: ShareData[] = [];
		Object.assign(navigator, { canShare: () => true, share: vi.fn(async (d: ShareData) => void shared.push(d)) });
		// The real listener in notify.ts shows the toast; capture what it was asked to show.
		const { NOTIFY_ACTION_EVENT } = await import('../../lib/notify');
		let tap: (() => void) | undefined;
		let message = '';
		const grab = (e: Event) => {
			const d = (e as CustomEvent).detail;
			message = d.message;
			tap = d.opts.onClick;
		};
		window.addEventListener(NOTIFY_ACTION_EVENT, grab);
		downloadBlob('Q3-Board-Review.pdf', new Blob(['%PDF'], { type: 'application/pdf' }));
		await vi.waitFor(() => expect(tap).toBeDefined());
		window.removeEventListener(NOTIFY_ACTION_EVENT, grab);
		expect(message).toBe('Q3-Board-Review.pdf is ready');
		expect(clicked).toHaveLength(0);
		tap?.();
		const f = shared[0]?.files?.[0];
		expect(f?.name).toBe('Q3-Board-Review.pdf');
		expect(f?.type).toBe('application/pdf');
		Reflect.deleteProperty(navigator, 'canShare');
		Reflect.deleteProperty(navigator, 'share');
	});

	it('retires the waiting Save toast when the surface moves on', async () => {
		vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA.firefoxIPhone);
		Object.assign(navigator, { canShare: () => true, share: vi.fn(async () => {}) });
		const { NOTIFY_ACTION_EVENT, NOTIFY_DISMISS_EVENT } = await import('../../lib/notify');
		dismissPendingSave(); // the test above left its own Save toast waiting; a new save would retire it
		let raised: unknown;
		const onRaise = (e: Event) => queueMicrotask(() => (raised = (e as CustomEvent).detail.handle));
		const dismissed: unknown[] = [];
		const onDismiss = (e: Event) => dismissed.push((e as CustomEvent).detail.handle);
		window.addEventListener(NOTIFY_ACTION_EVENT, onRaise);
		window.addEventListener(NOTIFY_DISMISS_EVENT, onDismiss);
		downloadBlob('Q3-Board-Review.pptx', new Blob(['PK'], { type: 'application/zip' }));
		await vi.waitFor(() => expect(raised).toBeTruthy());
		dismissPendingSave();
		dismissPendingSave(); // a second call has nothing left to retire
		window.removeEventListener(NOTIFY_ACTION_EVENT, onRaise);
		window.removeEventListener(NOTIFY_DISMISS_EVENT, onDismiss);
		expect(dismissed).toEqual([raised]);
		Reflect.deleteProperty(navigator, 'canShare');
		Reflect.deleteProperty(navigator, 'share');
	});
});

describe('saves that land while a Save toast waits', () => {
	type Raise = { message: string; opts: { onClick: () => void } };
	async function harness() {
		vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA.firefoxIPhone);
		const shared: string[][] = [];
		let resolveShare: () => void = () => {};
		Object.assign(navigator, {
			canShare: () => true,
			share: vi.fn((d: ShareData) => {
				shared.push((d.files ?? []).map((f) => f.name));
				return new Promise<void>((r) => (resolveShare = r));
			}),
		});
		const { NOTIFY_ACTION_EVENT, NOTIFY_DISMISS_EVENT } = await import('../../lib/notify');
		dismissPendingSave();
		const raises: Raise[] = [];
		const dismissed: unknown[] = [];
		const onRaise = (e: Event) => raises.push((e as CustomEvent).detail);
		const onDismiss = (e: Event) => dismissed.push((e as CustomEvent).detail.handle);
		window.addEventListener(NOTIFY_ACTION_EVENT, onRaise);
		window.addEventListener(NOTIFY_DISMISS_EVENT, onDismiss);
		const done = () => {
			window.removeEventListener(NOTIFY_ACTION_EVENT, onRaise);
			window.removeEventListener(NOTIFY_DISMISS_EVENT, onDismiss);
			Reflect.deleteProperty(navigator, 'canShare');
			Reflect.deleteProperty(navigator, 'share');
		};
		return { raises, dismissed, shared, resolve: () => resolveShare(), done };
	}

	it('a second export of the same file keeps ONE live toast (it used to retire its own)', async () => {
		const h = await harness();
		downloadBlob('deck.pdf', new Blob(['1'], { type: 'application/pdf' }));
		await vi.waitFor(() => expect(h.raises).toHaveLength(1));
		downloadBlob('deck.pdf', new Blob(['2'], { type: 'application/pdf' }));
		await vi.waitFor(() => expect(h.raises).toHaveLength(2));
		expect(h.dismissed, 'the live toast was retired by its own replacement').toEqual([]);
		expect(h.raises[1].message).toBe('deck.pdf is ready');
		h.raises[1].opts.onClick();
		expect(h.shared).toEqual([['deck.pdf']]);
		h.done();
	});

	it('different files join one batch, and one tap shares them all (Fabricate\'s multi-file export)', async () => {
		const h = await harness();
		for (const n of ['theme.css', 'theme.json', 'README.md']) downloadText(n, 'x');
		await vi.waitFor(() => expect(h.raises).toHaveLength(3));
		expect(h.raises[2].message).toBe('3 files are ready');
		h.raises[2].opts.onClick();
		expect(h.shared).toEqual([['theme.css', 'theme.json', 'README.md']]);
		h.done();
	});

	it('onSaved waits for the share sheet, so a backup is recorded only once it is handed over', async () => {
		const h = await harness();
		const saved = vi.fn();
		downloadBlob('lattice-workspace.zip', new Blob(['PK'], { type: 'application/zip' }), { onSaved: saved });
		await vi.waitFor(() => expect(h.raises).toHaveLength(1));
		expect(saved, 'recorded before the author tapped Save').not.toHaveBeenCalled();
		h.raises[0].opts.onClick();
		expect(saved).not.toHaveBeenCalled();
		h.resolve();
		await vi.waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
		h.done();
	});
});

// The bug lived in five hand-rolled copies of the anchor dance. A sixth would bring it back,
// so two censuses guard the helper: nothing else names a download, and nothing else makes a
// `blob:` URL except the known Worker and stylesheet sites, which never reach a download.
describe('no surface builds its own download link', () => {
	const SRC = join(__dirname, '..', '..');
	const files = (dir: string): string[] =>
		readdirSync(dir).flatMap((n) => {
			const p = join(dir, n);
			if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : files(p);
			return /\.(ts|tsx|js|mjs|cjs|astro|mdx)$/.test(n) && !/\.test\.|\.generated\./.test(n) ? [p] : [];
		});
	const owners = (re: RegExp) =>
		files(SRC)
			.filter((p) => re.test(readFileSync(p, 'utf8')))
			.map((p) => relative(SRC, p).replaceAll('\\', '/'))
			.sort();

	it('names a download only in download.js', () => {
		// `.download =`, `['download'] =`, setAttribute('download'), JSX `download=`. An object key
		// (`Object.assign(a, { download })`) is left to the census below: `download:` is also a data
		// field name here (OnDeviceTier's model sizes), and any such link still needs a blob: URL.
		const NAMES = /\.download\s*=[^=]|\[\s*['"]download['"]\s*\]\s*=[^=]|setAttribute\(\s*['"]download['"]|<a\b[^>]*\sdownload[\s=>]/;
		expect(owners(NAMES)).toEqual(['components/studio/download.js']);
	});

	it('makes a blob: URL only in download.js and the known non-download sites', () => {
		// Each of these feeds a Worker or a <link rel=stylesheet>, never a saved file. A new site
		// that hands its URL to an anchor or window.open belongs in download.js instead.
		const NOT_DOWNLOADS = ['components/studio/ai/architect-model.js', 'lib/single-slide-render.ts', 'lib/trama/dist/index.cjs', 'lib/trama/dist/index.mjs', 'lib/trama/pipeline.ts'];
		expect(owners(/createObjectURL\(/)).toEqual(['components/studio/download.js', ...NOT_DOWNLOADS].sort());
	});
});
