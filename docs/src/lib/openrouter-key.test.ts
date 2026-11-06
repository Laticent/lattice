import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isOpenRouterKeyEvent, markOpenRouterKeyRejected, openRouterKeyRejected, readOpenRouterKey, writeOpenRouterKey } from './openrouter-key.js';

// THE ONE READER. "What can read the author's key?" must have a one-module answer, because
// the shared-deck isolation proof (2026-11-06-studio-byok-key-lifecycle.md) stands on it.
// Tests may seed the key by name; app code may not name it at all.
describe('openrouter-key — the only module that names the stored key', () => {
	it('no other non-test file under docs/src names lattice-db-or-key', () => {
		const src = path.resolve(__dirname, '..');
		let out = '';
		try {
			out = execFileSync('git', ['grep', '--untracked', '-l', '-F', 'lattice-db-or-key', '--', '.'], { cwd: src, encoding: 'utf8' });
		} catch (e) {
			out = String((e as { stdout?: string }).stdout ?? ''); // git grep exits 1 on no match
		}
		const offenders = out
			.split('\n')
			.filter(Boolean)
			.filter((f) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(f))
			.filter((f) => f !== 'lib/openrouter-key.js');
		expect(offenders).toEqual([]);
	});
});

describe('openrouter-key — read, write, reject', () => {
	afterEach(() => localStorage.clear());
	it('reads what it wrote, and null clears it', () => {
		expect(readOpenRouterKey()).toBeNull();
		writeOpenRouterKey('sk-or-a');
		expect(readOpenRouterKey()).toBe('sk-or-a');
		writeOpenRouterKey(null);
		expect(readOpenRouterKey()).toBeNull();
	});
	it('marks a rejection once, and a new key clears it', () => {
		expect(markOpenRouterKeyRejected()).toBe(false); // no key, nothing to reject
		writeOpenRouterKey('sk-or-a');
		expect(markOpenRouterKeyRejected()).toBe(true);
		expect(markOpenRouterKeyRejected()).toBe(false); // already marked: no second announcement
		expect(openRouterKeyRejected()).toBe(true);
		writeOpenRouterKey('sk-or-b');
		expect(openRouterKeyRejected()).toBe(false);
	});
	it('recognizes a storage event for the key, or a cleared store', () => {
		expect(isOpenRouterKeyEvent({ key: 'lattice-db-or-key' })).toBe(true);
		expect(isOpenRouterKeyEvent({ key: null })).toBe(true);
		expect(isOpenRouterKeyEvent({ key: 'lattice-db-or-model' })).toBe(false);
	});
});
