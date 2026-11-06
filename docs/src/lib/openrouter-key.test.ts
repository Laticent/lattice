import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isOpenRouterKeyEvent, noteOpenRouterStatus, openRouterKeyRejected, readOpenRouterKey, writeOpenRouterKey } from './openrouter-key.js';

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
			// git grep exits 1 for "no match", which is the passing case. Anything else (git
			// missing, not a repository) must fail loudly, or this test passes without running.
			if ((e as { status?: number }).status !== 1) throw e;
			out = String((e as { stdout?: string }).stdout ?? '');
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
	it('a 401 marks the stored key once; a 2xx or a new key clears it', () => {
		expect(noteOpenRouterStatus(401, 'sk-or-a')).toBe(false); // no stored key, nothing to mark
		writeOpenRouterKey('sk-or-a');
		expect(noteOpenRouterStatus(401, 'sk-or-a')).toBe(true);
		expect(noteOpenRouterStatus(401, 'sk-or-a')).toBe(false); // already marked: announced once
		expect(openRouterKeyRejected()).toBe(true);
		expect(noteOpenRouterStatus(402, 'sk-or-a')).toBe(false); // not a key-health answer
		expect(noteOpenRouterStatus(200, 'sk-or-a')).toBe(true); // a one-off 401 does not stick
		expect(openRouterKeyRejected()).toBe(false);
		noteOpenRouterStatus(401, 'sk-or-a');
		writeOpenRouterKey('sk-or-b');
		expect(openRouterKeyRejected()).toBe(false);
	});
	it('a late 401 about an OLD key never marks the new one', () => {
		writeOpenRouterKey('sk-or-new');
		expect(noteOpenRouterStatus(401, 'sk-or-old')).toBe(false);
		expect(openRouterKeyRejected()).toBe(false);
	});
	it('recognizes a storage event for the key, or a cleared store', () => {
		expect(isOpenRouterKeyEvent({ key: 'lattice-db-or-key' })).toBe(true);
		expect(isOpenRouterKeyEvent({ key: null })).toBe(true);
		expect(isOpenRouterKeyEvent({ key: 'lattice-db-or-model' })).toBe(false);
	});
});

// The name guard above covers source. This covers the other way a value leaves: code that SWEEPS
// storage. Every sweep in docs/src today (found by `localStorage.key(` — the storage meter, the
// settings-row summary, the deck stats, the workspace backup) reports names and byte counts only.
// If one ever starts returning values, the seeded key must not ride out with them. The workspace
// backup has its own pin (workspace-backup.test.ts, "never packs the OpenRouter key").
describe('openrouter-key — no storage sweep returns the key value', () => {
	afterEach(() => localStorage.clear());
	it('the storage meter, summary and deck stats never carry the seeded value', async () => {
		const SECRET = 'sk-or-v1-sweep-canary-0123456789';
		writeOpenRouterKey(SECRET);
		const { scanLocalStorage } = await import('../playground/storage-metrics');
		const { storageSummary } = await import('../components/studio/workspace-backup-meta');
		const { deckContentStats } = await import('../components/studio/studio-store');
		const outputs = [scanLocalStorage(), await storageSummary(), deckContentStats()];
		for (const out of outputs) expect(JSON.stringify(out)).not.toContain(SECRET);
	});
});
