// The Studio's one download helper names every saved file on the `blob:` URL itself, not
// only in the anchor's `download` attribute — a browser that drops that hint otherwise saves
// the URL's UUID (`76f752a8-….html`, the owner's report from lattice.style in Firefox).
// download.ts has the measurement; this pins the mechanism and that nothing routes around it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armDownloadLink, downloadBlob, namedFileUrl } from './download';

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
