import { beforeEach, describe, expect, it, vi } from 'vitest';

// The encoder is loaded through a DYNAMIC import, and how its FAILURE is remembered is a real
// decision with a silent failure mode on either side of it.
//
// Cache the failure forever and one flaky chunk fetch — a rotated build hash on a long-open
// Studio tab — disables compression for the whole session, shipping every clip ~6x its quoted
// size with no warning, because both payload thresholds gate on the ESTIMATE rather than on
// the bytes. Never cache it and a build with no encoder at all pays a rejected import per
// sentence, 300 of them on a bake.
//
// So it retries a bounded number of times and then stops. Nothing tested that bound, which
// means nothing would have noticed it being lost in either direction.

/** Every time the bundler is asked for the encoder. The number under test. */
let loadAttempts = 0;
/** Whether that request succeeds — flipped mid-test to model a transient failure recovering. */
let loadWorks = false;

vi.mock('@breezystack/lamejs', () => {
	loadAttempts++;
	if (!loadWorks) throw new Error('Failed to fetch dynamically imported module');
	// The only member this module touches. A real encode is `narration-encode.test.ts`'s job;
	// this file is about the LOADER, so the stand-in stays a stand-in.
	return { default: { Mp3Encoder: class {} } };
});

beforeEach(() => {
	loadAttempts = 0;
	loadWorks = false;
	// The retry counter is MODULE state, so every test needs its own copy of the module.
	vi.resetModules();
});

describe('loading the encoder', () => {
	it('gives up after a bounded number of failures instead of retrying per clip', async () => {
		const { encoderAvailable } = await import('./narration-encode.js');
		for (let i = 0; i < 12; i++) expect(await encoderAvailable()).toBe(false);
		// Three, not twelve: a genuinely absent encoder costs three rejected imports for the
		// session rather than one per sentence.
		expect(loadAttempts).toBe(3);
	});

	it('recovers from a transient failure rather than disabling compression for the session', async () => {
		const { encoderAvailable } = await import('./narration-encode.js');
		expect(await encoderAvailable(), 'the flaky fetch').toBe(false);
		loadWorks = true;
		expect(await encoderAvailable(), 'the retry that the old memoize-forever version never made').toBe(true);
	});

	it('does not re-import once it has loaded', async () => {
		loadWorks = true;
		const { encoderAvailable } = await import('./narration-encode.js');
		expect(await encoderAvailable()).toBe(true);
		// Measured as a DELTA. `vi.resetModules()` gives this file a fresh copy of the module
		// under test, but vitest keeps the mocked dependency's own resolution cached across
		// tests, so the absolute count is an artifact of test order. The delta is not.
		const settled = loadAttempts;
		for (let i = 0; i < 5; i++) expect(await encoderAvailable()).toBe(true);
		expect(loadAttempts, 'success is memoized; only failure is retried').toBe(settled);
	});
});
