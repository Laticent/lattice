/**
 * THE MEDIA VAULT PROBE (PROBE=media-vault), run INSIDE the Studio page by WebDriver (run.mjs) on Mobile Safari in the
 * iOS Simulator, and by the Playwright self-test (probe.selftest.mjs) on WebKit. It drives vault slice 2's real photo
 * move and its move-back in the Studio (engineering/decisions/2026-11-27-vault-slice-2-as-built.md): the owner's raise
 * on #3582, because PROBE=vault checks the vault's own page and not the Studio's move.
 *
 * Three parts, because the move and the move-back each run at boot:
 *   1. `latticeMediaVaultProbe()` plants two photos the way every Studio before slice 2 saved them (the bytes in the
 *      Workbench row: a Blob, or an ArrayBuffer where the engine refuses one). run.mjs reloads the page for real.
 *   2. `latticeMediaVaultAfterMove(seed)` waits for the move, then checks each photo's vault file: the SHA-256 the probe
 *      recorded, the picture decodes at its size, and the move's one backup exists. It turns this browser's way back on
 *      (`lattice-media-storage: rows`, media-vault.ts). run.mjs reloads again.
 *   3. `latticeMediaVaultAfterMoveBack(seed)` waits for the move-back, then checks each row holds its bytes again with the
 *      same SHA-256, the picture decodes, the vault file is gone, and the device recorded nothing left behind.
 * Each part resolves to `{ ok, error, steps, ua, width }`. Plain browser JS on purpose: WebDriver's execute-script sends
 * source text. Every wait is on a signal (the rows the Studio writes), polled because WebDriver cannot await it.
 */
const MV_PHOTOS = [
	{ id: 'm_ios_probe_wide', name: 'ios-probe-wide', w: 160, h: 90, color: 'rgb(200,40,40)' },
	{ id: 'm_ios_probe_tall', name: 'ios-probe-tall', w: 90, h: 160, color: 'rgb(40,40,200)' },
];

function mvOpen(name) {
	return new Promise((res, rej) => {
		const r = indexedDB.open(name);
		r.onsuccess = () => res(r.result);
		r.onerror = () => rej(r.error);
	});
}

function mvGet(db, store, key) {
	return new Promise((res, rej) => {
		const q = db.transaction(store).objectStore(store).get(key);
		q.onsuccess = () => res(q.result);
		q.onerror = () => rej(q.error);
	});
}

async function mvRow(id) {
	const db = await mvOpen('lattice-workbench');
	try {
		return await mvGet(db, 'assets', id);
	} finally {
		db.close();
	}
}

async function mvSha(bytes) {
	const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Poll `test` every 250 ms until it returns a truthy value or `ms` pass; the value, or null. */
async function mvUntil(test, ms) {
	const t0 = Date.now();
	for (;;) {
		const v = await test().catch(() => null);
		if (v) return v;
		if (Date.now() - t0 > ms) return null;
		await new Promise((r) => setTimeout(r, 250));
	}
}

/** The width a stored picture decodes to, or an error string. */
async function mvDecodes(blob) {
	try {
		const bmp = await createImageBitmap(blob);
		const w = bmp.width;
		bmp.close?.();
		return w;
	} catch (e) {
		return String(e);
	}
}

/** The bytes the vault holds at `path`, read through its own index: OPFS, or `lattice-vault-blobs` where OPFS is refused. */
async function mvVaultFile(path) {
	const index = await mvOpen('lattice-vault');
	const rec = await mvGet(index, 'entries', path);
	const backing = await mvGet(index, 'meta', 'blobBacking');
	index.close();
	if (!rec || rec.deleted) return { live: false };
	let blob;
	if (backing === 'indexeddb') {
		const blobs = await mvOpen('lattice-vault-blobs');
		const r = await mvGet(blobs, 'blobs', rec.sha256);
		blobs.close();
		blob = r?.blob ?? (r?.data ? new Blob([r.data]) : null);
	} else {
		const top = await navigator.storage.getDirectory();
		const shard = await (await (await top.getDirectoryHandle('lattice-vault')).getDirectoryHandle('blobs')).getDirectoryHandle(rec.sha256.slice(0, 2));
		blob = await (await shard.getFileHandle(rec.sha256)).getFile();
	}
	return { live: true, backing: backing ?? 'opfs', sha256: rec.sha256, blob };
}

// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script
async function latticeMediaVaultProbe() {
	const steps = [];
	const step = (name, pass, detail) => steps.push({ name, pass: !!pass, detail });
	const out = { ok: false, error: null, steps, ua: navigator.userAgent, width: innerWidth, seed: null };
	try {
		// The Studio opens `lattice-workbench` at boot (the move looks for rows to move). Wait for it, so the probe never
		// creates the database itself at the wrong version.
		const ready = await mvUntil(async () => (await indexedDB.databases()).some((d) => d.name === 'lattice-workbench' && d.version >= 2), 60000);
		step('the Studio opened its Library database', ready, ready ? 'lattice-workbench' : 'not within 60 s');
		if (!ready) return out;
		// A clean start on a simulator that ran this before: no way back on, no once-per-device backup mark, no attempt count.
		for (const k of ['lattice-media-storage', 'lattice-media-move-backed-up', 'lattice-media-move-attempt', 'lattice-media-move-back-left']) localStorage.removeItem(k);
		const seed = [];
		for (const p of MV_PHOTOS) {
			const c = document.createElement('canvas');
			c.width = p.w;
			c.height = p.h;
			const g = c.getContext('2d');
			g.fillStyle = p.color;
			g.fillRect(0, 0, p.w, p.h);
			const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
			const bytes = new Uint8Array(await blob.arrayBuffer());
			const row = { id: p.id, kind: 'image', name: p.name, scope: 'library', mime: 'image/png', bytes: bytes.byteLength, width: p.w, height: p.h, sourceName: `${p.name}.png`, original: true, addedAt: 1 };
			const db = await mvOpen('lattice-workbench');
			const put = (value) =>
				new Promise((res, rej) => {
					const t = db.transaction('assets', 'readwrite');
					t.oncomplete = () => res('ok');
					t.onerror = t.onabort = () => rej(t.error ?? new Error('refused'));
					try {
						t.objectStore('assets').put(value);
					} catch (e) {
						rej(e);
					}
				});
			// What the old save did: a Blob, or an ArrayBuffer where the engine refuses one.
			const shape = await put({ ...row, blob })
				.then(() => 'blob')
				.catch(() => put({ ...row, data: bytes.buffer.slice(0) }).then(() => 'buffer'));
			db.close();
			seed.push({ id: p.id, w: p.w, sha256: await mvSha(bytes), bytes: bytes.byteLength, shape });
		}
		step('two photos planted the pre-slice-2 way', seed.length === 2, seed.map((s) => `${s.id}: ${s.shape}, ${s.bytes} B`).join('; '));
		out.seed = seed;
		out.ok = true;
	} catch (e) {
		out.error = String(e);
	}
	return out;
}

// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script
async function latticeMediaVaultAfterMove(seed) {
	const steps = [];
	const step = (name, pass, detail) => steps.push({ name, pass: !!pass, detail });
	const out = { ok: false, error: null, steps, ua: navigator.userAgent, width: innerWidth };
	try {
		// The move runs at the first idle moment after boot.
		const moved = await mvUntil(async () => {
			const rows = await Promise.all(seed.map((s) => mvRow(s.id)));
			return rows.every((r) => r && typeof r.vault === 'string' && !r.blob && !r.data) ? rows : null;
		}, 90000);
		step('the Studio moved both photos into the vault', moved, moved ? moved.map((r) => r.vault).join(', ') : 'not within 90 s');
		if (!moved) return out;
		for (const [i, s] of seed.entries()) {
			const file = await mvVaultFile(moved[i].vault);
			const bytes = file.live ? new Uint8Array(await file.blob.arrayBuffer()) : null;
			const sha = bytes ? await mvSha(bytes) : null;
			step(`${s.id}: the vault file holds the same bytes`, sha === s.sha256, file.live ? `${file.backing}, ${bytes.byteLength} B` : 'no live file');
			const w = file.live ? await mvDecodes(new Blob([bytes], { type: 'image/png' })) : 'no file';
			step(`${s.id}: the moved photo opens`, w === s.w, `decodes at ${w} px`);
		}
		const index = await mvOpen('lattice-vault');
		const backup = await mvGet(index, 'entries', '.lattice/backups/before-vault.zip');
		index.close();
		step('the move wrote its one backup first', backup && !backup.deleted, backup ? `${backup.bytes} B` : 'none');
		localStorage.setItem('lattice-media-storage', 'rows');
		out.ok = steps.every((s) => s.pass);
	} catch (e) {
		out.error = String(e);
	}
	return out;
}

// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script
async function latticeMediaVaultAfterMoveBack(seed) {
	const steps = [];
	const step = (name, pass, detail) => steps.push({ name, pass: !!pass, detail });
	const out = { ok: false, error: null, steps, ua: navigator.userAgent, width: innerWidth };
	try {
		const paths = (await Promise.all(seed.map((s) => mvRow(s.id)))).map((r) => r?.vault);
		const back = await mvUntil(async () => {
			const rows = await Promise.all(seed.map((s) => mvRow(s.id)));
			return rows.every((r) => r && !r.vault && (r.blob instanceof Blob || r.data instanceof ArrayBuffer)) ? rows : null;
		}, 90000);
		step('the move-back put both photos back in their rows', back, back ? back.map((r) => (r.blob ? 'blob' : 'buffer')).join(', ') : 'not within 90 s');
		if (!back) return out;
		for (const [i, s] of seed.entries()) {
			const r = back[i];
			const bytes = new Uint8Array(r.blob ? await r.blob.arrayBuffer() : r.data);
			step(`${s.id}: the row holds the same bytes again`, (await mvSha(bytes)) === s.sha256, `${bytes.byteLength} B`);
			const w = await mvDecodes(new Blob([bytes], { type: 'image/png' }));
			step(`${s.id}: the moved-back photo opens`, w === s.w, `decodes at ${w} px`);
		}
		// `paths` was read before the wait, so it may already be empty when the move-back ran first: read the vault for every
		// path a seeded photo could have had.
		const index = await mvOpen('lattice-vault');
		const left = [];
		for (const s of seed) {
			for (const p of [...paths, `Library/Images/${s.id}.png`]) {
				if (!p) continue;
				const rec = await mvGet(index, 'entries', p);
				if (rec && !rec.deleted && !left.includes(p)) left.push(p);
			}
		}
		index.close();
		step('the vault files are removed', left.length === 0, left.length ? left.join(', ') : 'none left');
		const count = localStorage.getItem('lattice-media-move-back-left');
		step('the device recorded nothing left behind', count === '0', `lattice-media-move-back-left = ${count}`);
		localStorage.removeItem('lattice-media-storage');
		out.ok = steps.every((s) => s.pass);
	} catch (e) {
		out.error = String(e);
	}
	return out;
}
