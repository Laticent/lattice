/**
 * THE VAULT PROBE (PROBE=vault), run INSIDE /proto/vault/ by WebDriver (run.mjs) on Mobile Safari in the iOS Simulator.
 * It checks slice 1 of engineering/decisions/2026-11-22-local-first-drive-storage.md on the one engine Playwright
 * cannot drive: that the browser vault opens (OPFS + IndexedDB `lattice-vault`), writes through its worker's
 * `createSyncAccessHandle`, and reads every file back after a real reload, with a clean startup scan.
 * docs/e2e/vault.spec.ts checks the same on Chromium, Linux WebKit and Gecko.
 *
 * Two halves, because the reload is the point: `latticeVaultProbe()` writes, run.mjs reloads the page for real, and
 * `latticeVaultAfterReload(seed)` reads back. Each resolves to `{ ok, error, steps, ua, width }`. A vault that refuses
 * to open (`unavailable`, as WebKit does in an ephemeral session) is a failed step that names the reason, not a hang.
 * Plain browser JS on purpose: WebDriver's execute-script sends source text.
 */
const VAULT_DECK = '﻿---\r\ntheme: cuoio\r\n---\r\n# iOS vault\r\n';
const VAULT_SMALL = 20;

/** Wait for the harness to say ready or failed (a signal the page sets, polled because WebDriver cannot await it). */
async function vaultProbeReady() {
	const t0 = Date.now();
	while (!document.body.dataset.ready) {
		if (Date.now() - t0 > 30000) return { ok: false, why: 'the harness never set data-ready in 30 s' };
		await new Promise((r) => setTimeout(r, 100));
	}
	if (document.body.dataset.ready !== 'yes') return { ok: false, why: `${document.body.dataset.code}: ${document.getElementById('status').value}` };
	return { ok: true };
}

// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script
async function latticeVaultProbe() {
	const steps = [];
	const step = (name, ok, detail) => steps.push({ name, ok, detail });
	const out = { ok: false, error: null, steps, ua: navigator.userAgent, width: innerWidth, seed: null };
	try {
		const ready = await vaultProbeReady();
		step('vault opens', ready.ok, ready.why ?? 'ready');
		if (!ready.ok) return out;
		const h = window.vaultHarness;
		step('worker write path', (await h.probe()) === 'sync-access-handle', await h.probe());
		const deck = await h.write('Decks/iOS vault.md', VAULT_DECK);
		const big = await h.writeBytes('Library/Images/big.png', 1024 * 1024, 11);
		for (let i = 0; i < VAULT_SMALL; i++) await h.write(`Library/Documents/n${i}.txt`, `note ${i}`);
		const paths = await h.writePaths();
		step('every blob went through the sync handle', paths['sync-access-handle'] === VAULT_SMALL + 2 && paths.writable === 0, JSON.stringify(paths));
		out.seed = { deckSha: deck.sha256, deckId: deck.id, bigSha: big.sha256, deviceId: await h.deviceId() };
		out.ok = steps.every((s) => s.ok);
	} catch (e) {
		out.error = String(e);
	}
	return out;
}

// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script
async function latticeVaultAfterReload(seed) {
	const steps = [];
	const step = (name, ok, detail) => steps.push({ name, ok, detail });
	const out = { ok: false, error: null, steps, ua: navigator.userAgent, width: innerWidth };
	try {
		const ready = await vaultProbeReady();
		step('vault reopens', ready.ok, ready.why ?? 'ready');
		if (!ready.ok) return out;
		const h = window.vaultHarness;
		const deck = await h.readText('Decks/iOS vault.md');
		step('deck reads back, LF and no BOM', deck === '---\ntheme: cuoio\n---\n# iOS vault\n', JSON.stringify(deck));
		step('1 MB file reads back whole', (await h.readSize('Library/Images/big.png')) === 1024 * 1024, String(await h.readSize('Library/Images/big.png')));
		step('small file reads back', (await h.readText('Library/Documents/n7.txt')) === 'note 7', 'n7');
		const all = await h.list('');
		const entry = all.find((e) => e.path === 'Decks/iOS vault.md');
		step('every file listed, id and sha kept', all.length === VAULT_SMALL + 2 && entry?.id === seed.deckId && entry?.sha256 === seed.deckSha, `${all.length} files`);
		step('device id kept', (await h.deviceId()) === seed.deviceId, 'same id');
		const rec = await h.recovery();
		step('startup scan verified every file', rec.verified === VAULT_SMALL + 2 && rec.damaged.length === 0 && rec.orphans === 0, JSON.stringify(rec));
		out.ok = steps.every((s) => s.ok);
	} catch (e) {
		out.error = String(e);
	}
	return out;
}
