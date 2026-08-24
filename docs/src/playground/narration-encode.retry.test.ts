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
/** Every time the loader reaches INTO a resolved encoder module. `loadAttempts` cannot see
 *  this: a second `import()` of an already-resolved module is a registry cache hit that never
 *  re-runs the factory, so a loader that dropped its success memo entirely still reads
 *  `loadAttempts === 1`. Measured on the namespace instead, where a getter fires per read. */
let moduleReads = 0;

/** What the bundler hands back when the encoder chunk is there. The only member this
 *  module touches — a real encode is `narration-encode.test.ts`'s job; this file is about
 *  the LOADER, so the stand-in stays a stand-in. */
function lamejsFactory() {
	loadAttempts++;
	if (!loadWorks) throw new Error('Failed to fetch dynamically imported module');
	return {
		get default() {
			moduleReads++;
			return { Mp3Encoder: class {} };
		},
	};
}

beforeEach(() => {
	loadAttempts = 0;
	moduleReads = 0;
	loadWorks = false;
	// The retry counter is MODULE state, so every test needs its own copy of the module.
	vi.resetModules();
	// …and `vi.resetModules()` does NOT reach the MOCK registry: a hoisted `vi.mock` factory
	// is evaluated once and its result cached for the whole file, so a test that needs the
	// import to FAIL got the previous test's successful resolution back and read
	// `expected true to be false` (#1324). `vi.doMock` re-registers the factory per test, and
	// runs after `resetModules` because it is not hoisted — so each test gets a fresh module
	// under test AND a fresh dependency resolution, in either order.
	vi.doMock('@breezystack/lamejs', lamejsFactory);
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
		// One import, not five. This used to be measured as a delta against whatever the
		// previous test had left cached, because a hoisted `vi.mock` factory outlives
		// `vi.resetModules()`; the `vi.doMock` in `beforeEach` re-registers it per test, so
		// the ABSOLUTE count is now meaningful and is the stronger assertion.
		expect(loadAttempts, 'the one load this test performed').toBe(1);
		for (let i = 0; i < 5; i++) expect(await encoderAvailable()).toBe(true);
		expect(loadAttempts, 'success is memoized; only failure is retried').toBe(1);
		// The assertion that actually bites. Dropping the `if (!encoderModule)` memo re-imports
		// on every call, which `loadAttempts` is blind to (see `moduleReads` above) — this reads
		// 6 instead of 1.
		expect(moduleReads, 'the module promise is reused, not re-awaited from a fresh import').toBe(1);
	});
});
