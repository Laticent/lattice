import { type BrowserContext, test as base, expect, type Page } from '@playwright/test';

// The storage vault on real engines (slice 1, engineering/decisions/2026-11-22-local-first-drive-storage.md §10).
// The unit suite runs the vault over stand-ins; only a browser has a real OPFS, a real dedicated worker
// with `createSyncAccessHandle`, and a real IndexedDB that survives a reload (HARD RULE #23). Every wait is
// on a signal (the harness's ready flag, a resolved promise), never a duration (#32).
//
// A PERSISTENT PROFILE PER TEST. Playwright's default context is ephemeral, and WebKit refuses OPFS in an
// ephemeral session (`getDirectory()` throws UnknownError; IndexedDB still works). Measured 2026-11-22 on
// Playwright's Linux WebKit; a persistent profile has OPFS. So each test launches its own persistent
// context in its own output folder (fresh state per test), and the ephemeral `page` fixture is kept for
// the one assertion about it: the vault refuses there with a typed `unavailable`, never a hang.
//
// `webkit-phone` is Linux WebKit at an iPhone's size, NOT iOS: iOS Safari stays UNVERIFIED until the iOS
// Simulator suite or a real device covers it.

const test = base.extend<{ profile: BrowserContext }>({
	profile: async ({ playwright, browserName, baseURL }, use, testInfo) => {
		const u = testInfo.project.use;
		const ctx = await playwright[browserName].launchPersistentContext(testInfo.outputPath('profile'), {
			baseURL,
			viewport: u.viewport,
			userAgent: u.userAgent,
			deviceScaleFactor: u.deviceScaleFactor,
			isMobile: u.isMobile,
			hasTouch: u.hasTouch,
		});
		await use(ctx);
		await ctx.close();
	},
});

const HARNESS = '/proto/vault/';

type Harness = {
	ready: Promise<unknown>;
	changes: { op: string; path: string; origin: string }[];
	write(path: string, data: string): Promise<{ id: string; revision: number; sha256: string }>;
	writeBytes(path: string, size: number, seed: number): Promise<{ sha256: string; bytes: number }>;
	readText(path: string): Promise<string>;
	readSize(path: string): Promise<number>;
	list(dir: string): Promise<{ path: string; id: string; sha256: string }[]>;
	remove(path: string): Promise<void>;
	move(from: string, to: string): Promise<unknown>;
	journal(): Promise<{ op: string; path: string }[]>;
	deviceId(): Promise<string>;
	recovery(): Promise<{ verified: number; damaged: string[]; orphans: number }>;
	writePaths(): Promise<string[]>;
	probe(): Promise<string>;
	settled(): Promise<void>;
};

declare global {
	interface Window {
		vaultHarness: Harness;
	}
}

async function open(page: Page): Promise<void> {
	await page.goto(HARNESS);
	await expect(page.locator('body')).toHaveAttribute('data-ready', /yes|failed/);
	await expect(page.locator('#status')).toHaveText('ready');
}

test.describe('storage vault @crosswidth @webkit-phone @gecko', () => {
	test('write, reload, read: bytes through the worker, index in IndexedDB', async ({ profile, browserName }) => {
		const page = await profile.newPage();
		await open(page);
		// Every engine this suite runs must take the sync-access-handle path: it is the one WebKit offers.
		expect(await page.evaluate(() => window.vaultHarness.probe())).toBe('sync-access-handle');

		const deck = '﻿---\r\ntheme: cuoio\r\n---\r\n# Q3 review\r\n';
		const written = await page.evaluate((d) => window.vaultHarness.write('Decks/Q3 review.md', d), deck);
		const big = await page.evaluate(() => window.vaultHarness.writeBytes('Library/Images/big.png', 1024 * 1024, 7));
		const smalls = await page.evaluate(async () => {
			for (let i = 0; i < 100; i++) await window.vaultHarness.write(`Library/Documents/n${String(i).padStart(3, '0')}.txt`, `note ${i}`);
			return window.vaultHarness.writePaths();
		});
		// 1 deck + 1 MB image + 100 notes, each blob written once, each by the worker's sync handle.
		expect(smalls).toHaveLength(102);
		expect(new Set(smalls)).toEqual(new Set(['sync-access-handle']));
		const deviceId = await page.evaluate(() => window.vaultHarness.deviceId());

		await page.reload();
		await open(page);
		const after = await page.evaluate(async () => {
			const h = window.vaultHarness;
			return {
				deck: await h.readText('Decks/Q3 review.md'),
				bigSize: await h.readSize('Library/Images/big.png'),
				note42: await h.readText('Library/Documents/n042.txt'),
				count: (await h.list('')).length,
				entry: (await h.list('Decks'))[0],
				journal: (await h.journal()).length,
				deviceId: await h.deviceId(),
				recovery: await h.recovery(),
				// Nothing was written this load: the reads came from OPFS, not from a worker round trip.
				writes: (await h.writePaths()).length,
			};
		});
		expect(after.deck, browserName).toBe('---\ntheme: cuoio\n---\n# Q3 review\n');
		expect(after.bigSize).toBe(1024 * 1024);
		expect(after.note42).toBe('note 42');
		expect(after.count).toBe(102);
		expect(after.entry).toMatchObject({ path: 'Decks/Q3 review.md', id: written.id, sha256: written.sha256 });
		expect(after.journal).toBe(102);
		expect(after.deviceId).toBe(deviceId);
		// The first load after the writes hashes every journaled blob against its last journaled sha256.
		expect(after.recovery).toEqual({ verified: 102, damaged: [], orphans: 0 });
		expect(after.writes).toBe(0);
		expect(big.bytes).toBe(1024 * 1024);
	});

	test('move and remove survive a reload; a removed blob is freed', async ({ profile }) => {
		const page = await profile.newPage();
		await open(page);
		await page.evaluate(async () => {
			const h = window.vaultHarness;
			await h.write('a.md', 'alpha');
			await h.write('b.md', 'beta');
			await h.move('a.md', 'Decks/a.md');
			await h.remove('b.md');
			await h.settled();
		});
		await page.reload();
		await open(page);
		const state = await page.evaluate(async () => ({
			paths: (await window.vaultHarness.list('')).map((e) => e.path),
			a: await window.vaultHarness.readText('Decks/a.md'),
			ops: (await window.vaultHarness.journal()).map((j) => j.op),
			recovery: await window.vaultHarness.recovery(),
		}));
		expect(state.paths).toEqual(['Decks/a.md']);
		expect(state.a).toBe('alpha');
		expect(state.ops).toEqual(['write', 'write', 'move', 'remove']);
		// No orphan: the remove's sweep deleted beta's blob before the reload.
		expect(state.recovery.orphans).toBe(0);
	});

	test('a write in one tab reaches the other tab', async ({ profile }) => {
		const page = await profile.newPage();
		await open(page);
		const other = await profile.newPage();
		await open(other);
		await page.evaluate(() => window.vaultHarness.write('Decks/shared.md', 'from tab one'));
		await expect.poll(() => other.evaluate(() => window.vaultHarness.changes.map((c) => `${c.op} ${c.path} ${c.origin}`))).toEqual(['write Decks/shared.md remote']);
		expect(await other.evaluate(() => window.vaultHarness.readText('Decks/shared.md'))).toBe('from tab one');
	});

	test('an ephemeral session: WebKit refuses OPFS and the vault says unavailable; the others open', async ({ page, browserName }) => {
		await page.goto(HARNESS);
		await expect(page.locator('body')).toHaveAttribute('data-ready', /yes|failed/);
		if (browserName === 'webkit') await expect(page.locator('body')).toHaveAttribute('data-code', 'unavailable');
		else await expect(page.locator('#status')).toHaveText('ready');
	});
});
