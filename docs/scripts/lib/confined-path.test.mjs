import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { confinedPath } from './confined-path.mjs';

const ROOT = '/srv/dist';

describe('confinedPath', () => {
	it('resolves a normal path under the root', () => {
		expect(confinedPath(ROOT, '/index.html')).toBe(path.join(ROOT, 'index.html'));
		expect(confinedPath(ROOT, '/assets/app.js')).toBe(path.join(ROOT, 'assets', 'app.js'));
		expect(confinedPath(ROOT, '/')).toBe(path.join(ROOT));
		expect(confinedPath(ROOT, '//double//slash.css')).toBe(path.join(ROOT, 'double', 'slash.css'));
	});

	// The failing arm (HARD RULE #34): each traversal returned a path OUTSIDE the root before the
	// guard; the servers decodeURIComponent first, so the contract is a decoded path.
	it('refuses a traversal out of the root', () => {
		for (const attempt of ['/../secret', '/../../etc/passwd', '/assets/../../secret', '/../..', '/./../out']) {
			expect(confinedPath(ROOT, attempt), attempt).toBeNull();
		}
	});

	it('does not confuse a sibling prefix for the root', () => {
		// `/srv/dist-evil` starts with `/srv/dist` as a string but is not under it.
		expect(confinedPath(ROOT, '/../dist-evil/x')).toBeNull();
	});
});
