import { describe, expect, it } from 'vitest';
import { chunkLoadMessage, isChunkLoadError, messageForFailure } from './chunk-load';

// #1242. The matcher is the whole mechanism: everything downstream (the ErrorBoundary card,
// the Share/PDF/.lattice toasts) branches on it, so a miss shows the user the wrong
// diagnosis and a false positive hides a genuine crash behind a reload prompt.
describe('isChunkLoadError', () => {
	// Verbatim shapes, per engine, captured from real rejections — not copied from docs.
	// iOS Safari's wording matters most: the tab-restore path that motivated this is a phone.
	const REAL_MESSAGES = [
		['Chromium / Vite', 'Failed to fetch dynamically imported module: https://lattice.style/_astro/Fabricate.D1x2y3.js'],
		['Firefox', 'error loading dynamically imported module: https://lattice.style/_astro/Editor.abc.js'],
		['Safari / WebKit (iOS)', 'Importing a module script failed.'],
		['Safari, older phrasing', 'Unable to load module script: /_astro/Fabricate.D1x2y3.js'],
		['Vite CSS preload', 'Unable to preload CSS for /_astro/studio.abc.css'],
		['WebKit behind a captive portal (200 + text/html)', "'text/html' is not a valid JavaScript MIME type."],
	] as const;

	for (const [engine, message] of REAL_MESSAGES) {
		it(`recognizes the ${engine} wording`, () => {
			expect(isChunkLoadError(new Error(message))).toBe(true);
		});
	}

	it('recognizes a webpack-style ChunkLoadError by name, whatever its message', () => {
		const err = Object.assign(new Error('Loading chunk 42 failed.'), { name: 'ChunkLoadError' });
		expect(isChunkLoadError(err)).toBe(true);
	});

	it('accepts a bare string, since a rejected import may not reject with an Error', () => {
		expect(isChunkLoadError('Importing a module script failed.')).toBe(true);
	});

	// The narrowness IS the feature: a module that loads and then throws is a real bug and
	// must keep reaching the normal error path.
	const NOT_A_LOAD_FAILURE = [
		['a genuine crash inside a loaded module', new Error("Cannot read properties of undefined (reading 'map')")],
		['a syntax error in a chunk that DID arrive', new SyntaxError('Unexpected token <')],
		['a render error mentioning modules', new Error('Module state is invalid for this deck')],
		['a network failure that is not an import', new Error('Failed to fetch')],
		['an engine render fault', new Error('Mermaid parse error on line 3')],
		['null', null],
		['undefined', undefined],
		['an empty error', new Error('')],
		['an object with no message', {}],
	] as const;

	for (const [what, err] of NOT_A_LOAD_FAILURE) {
		it(`does not fire on ${what}`, () => {
			expect(isChunkLoadError(err)).toBe(false);
		});
	}
});

describe('chunkLoadMessage', () => {
	// The cause is NOT knowable from the error — a 404, a 403, a 500 and being offline are
	// byte-identical in both engines. An earlier cut asserted "a newer version shipped",
	// which is a confident falsehood to anyone in a tunnel, on a surface this PWA supports.
	it('never claims a deploy happened — the error cannot establish that', () => {
		for (const online of [true, false]) {
			expect(chunkLoadMessage(online)).not.toMatch(/updated|newer version|shipped|deploy/i);
		}
	});

	it('online: says what is observable and points at the one action that can help', () => {
		expect(chunkLoadMessage(true)).toMatch(/couldn't load part of the app/i);
		expect(chunkLoadMessage(true)).toMatch(/reload/i);
	});

	it('offline: says so, and asks for a reconnect BEFORE a reload', () => {
		const copy = chunkLoadMessage(false);
		expect(copy).toMatch(/offline/i);
		// Telling an offline user to reload full stop sends them into a dead end: the service
		// worker re-serves the cached shell and the chunk is still unreachable.
		expect(copy.indexOf('Reconnect')).toBeLessThan(copy.toLowerCase().indexOf('reload'));
	});
});

describe('messageForFailure', () => {
	// The async import sites (Share, PDF, .lattice) never reach an ErrorBoundary, and their
	// own copy blames the deck, the file, or the backup for what is really a stale tab.
	it('replaces a caller message that would blame the wrong thing', () => {
		const err = new Error('Failed to fetch dynamically imported module: /_astro/drawing-board-export.abc.js');
		expect(messageForFailure(err, 'Could not build the PDF.')).toBe(chunkLoadMessage());
		// And it never leaks the hashed asset URL into user-facing copy.
		expect(messageForFailure(err, 'Could not build the PDF.')).not.toMatch(/_astro|\.js/);
	});

	it('leaves a genuine failure message alone', () => {
		expect(messageForFailure(new Error('zip is corrupt'), 'Could not read that .lattice file.')).toBe('Could not read that .lattice file.');
	});
});
