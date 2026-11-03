/**
 * The PHOTO MEMORY fixture for the iOS Simulator suite: what a deck's photos cost Mobile Safari, and what the
 * preview-sized copies (docs/src/lib/preview-image-scale.ts) save. The Linux harness (tools/bench-preview-photo-memory.mjs)
 * measures the same two arms on Playwright's WebKit; this one runs them in Apple's WebKit, on the surface the owner tests on.
 *
 *   original   N frames, each showing a distinct 12MP photo by its own address
 *   scaled     the same frames, the markup run through the real module's `rewrite` first, re-written when each copy lands
 *
 * The page runs in Safari; the MEMORY is read on the Mac, which is the point of a simulator: its WebKit content processes
 * are ordinary host processes (their paths sit under CoreSimulator), so `vmmap` reads their physical footprint (decoded images included).
 * That is the Mac's accounting, not iOS's, so read the two arms as a RATIO on one runner, not as an iPhone's footprint, and a simulator has no jetsam
 * limit: it shows the cost, not the reload.
 *
 * Needs macOS (`sips`, `ps`, `vmmap`) and esbuild (the root `npm ci`). Exports the fixture and the reader; run.mjs drives Safari.
 * Each arm runs on its own SITE (`127.0.0.1`, then `[::1]`), so WebKit gives it a content process of its own.
 */

import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** A 4032x3024 photo-sized JPEG: an uncompressed BMP written here, encoded by macOS's own `sips`. Decoded, any such JPEG is
 *  ~48MB whatever its content, which is the cost this measures; the gradient only keeps the file small. */
function writePhoto(file, seed) {
	const w = 4032;
	const h = 3024;
	const row = w * 3;
	const header = Buffer.alloc(54);
	header.write('BM', 0);
	header.writeUInt32LE(54 + row * h, 2);
	header.writeUInt32LE(54, 10);
	header.writeUInt32LE(40, 14);
	header.writeInt32LE(w, 18);
	header.writeInt32LE(h, 22);
	header.writeUInt16LE(1, 26);
	header.writeUInt16LE(24, 28);
	header.writeUInt32LE(row * h, 34);
	const px = Buffer.alloc(row * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const o = y * row + x * 3;
			px[o] = (x * 255) / w;
			px[o + 1] = (y * 255) / h;
			px[o + 2] = (seed * 37 + ((x ^ y) & 63)) & 255;
		}
	}
	const bmp = `${file}.bmp`;
	fs.writeFileSync(bmp, Buffer.concat([header, px]));
	execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', bmp, '--out', file], { stdio: 'ignore' });
	fs.rmSync(bmp);
}

/** Build the photos and the page, and serve them on two sites (one per arm, so each arm gets its own content process).
 *  The photos are the slow part (ten BMPs written here and encoded by `sips`), and run.sh starts this once per device, so
 *  they are kept in one directory for the job and reused by the second device. */
export async function startPhotoMemoryFixture(frames) {
	const t0 = Date.now();
	const dir = path.join(os.tmpdir(), 'lattice-ios-photo-memory-v1');
	fs.mkdirSync(dir, { recursive: true });
	let made = 0;
	for (let i = 1; i <= frames; i++) {
		const file = path.join(dir, `p${i}.jpg`);
		if (fs.existsSync(file) && fs.statSync(file).size > 0) continue;
		writePhoto(file, i);
		made++;
	}
	const esbuild = createRequire(path.join(root, 'package.json'))('esbuild');
	await esbuild.build({ entryPoints: [path.join(root, 'docs/src/lib/preview-image-scale.ts')], bundle: true, format: 'iife', globalName: 'Scale', outfile: path.join(dir, 'scale.js'), logLevel: 'error' });
	await esbuild.build({ entryPoints: [path.join(root, 'lib/core/remote-ref.js')], bundle: true, format: 'iife', globalName: 'RemoteRef', platform: 'browser', outfile: path.join(dir, 'remote-ref.js'), logLevel: 'error' });
	fs.writeFileSync(
		path.join(dir, 'index.html'),
		`<!doctype html><meta name=viewport content="width=device-width"><body style="margin:0"><div id=g></div><script src="remote-ref.js"></script><script src="scale.js"></script><script>
const doc = (u) => '<!doctype html><body style=margin:0><section><div class="lattice-bg" style="width:1280px;height:720px;background-image:url(&quot;' + u + '&quot;);background-size:cover"></div></section>';
window.run = (n, scaled, tile, dpr) => new Promise((done) => {
	let left = n;
	for (let i = 0; i < n; i++) {
		const f = document.createElement('iframe');
		f.style.cssText = 'width:1280px;height:720px;border:0;transform:scale(.14);transform-origin:0 0;position:absolute;left:' + (i % 2) * 190 + 'px;top:' + Math.floor(i / 2) * 110 + 'px';
		document.getElementById('g').appendChild(f);
		const url = new URL('p' + (i + 1) + '.jpg', location.href).href;
		const paint = () => {
			const out = scaled ? Scale.rewrite(doc(url), Scale.tierFor(tile, dpr, true), f, location.href, RemoteRef, []) : { html: doc(url), pending: 0 };
			f.srcdoc = out.html;
			if (out.pending) return;
			const im = new Image();
			im.onload = im.onerror = () => { if (--left === 0) setTimeout(() => done({ copies: scaled ? out.html.includes('blob:') : false }), 1500); };
			im.src = out.html.match(/url\\((?:&quot;)?([^&)]+)/)[1];
		};
		f.addEventListener(Scale.READY_EVENT, paint);
		paint();
	}
});
</script>`,
	);
	const serve = (req, res) => {
		const file = path.join(dir, path.basename(req.url.split('?')[0]) || 'index.html');
		if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
		res.writeHead(200, { 'content-type': file.endsWith('.jpg') ? 'image/jpeg' : file.endsWith('.js') ? 'text/javascript' : 'text/html', 'access-control-allow-origin': '*' });
		fs.createReadStream(file).pipe(res);
	};
	const servers = [http.createServer(serve).listen(0), http.createServer(serve).listen(0)];
	await Promise.all(servers.map((s) => new Promise((r) => (s.listening ? r() : s.once('listening', r)))));
	// Two SITES, not two ports, and neither the Studio's: WebKit chooses a content process by site, and a port is
	// not part of the site. `localhost:A` and `localhost:B` shared one process, and so did an arm on `localhost`
	// and the Studio pages the probes before it loaded there: the arm read their memory being freed (-114 MB,
	// then -39 MB on the iPad). `127.0.0.1` and `[::1]` are sites of their own (Node listens on both).
	const v6 = `http://[::1]:${servers[1].address().port}/`;
	const second = await fetch(v6).then((r) => r.ok, () => false) ? v6 : `http://localhost:${servers[1].address().port}/`;
	if (second !== v6) console.log('photo-memory: [::1] does not answer here; the second arm shares the localhost site with the Studio');
	return {
		origins: [`http://127.0.0.1:${servers[0].address().port}/`, second],
		buildMs: Date.now() - t0,
		madePhotos: made,
		// The photos stay for the next device; the job's runner is thrown away after it.
		close() {
			for (const s of servers) s.close();
		},
	};
}

/** Physical footprint (MB) of each WebKit content and GPU process the simulator runs (not the Mac's own Safari), by pid,
 *  read with `vmmap --summary`. Resident size (`ps` RSS) does not see a decoded photo here: the first CI runs read
 *  -37 to -149 MB for ten 12MP photos. The physical footprint counts the IOSurface and GPU-process memory that
 *  Apple's WebKit decodes images into, which is also the number iOS weighs before it discards a tab. */
export async function simulatorWebContentMB() {
	const pids = [];
	for (const line of execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n')) {
		if (!/WebContent|WebKit\.GPU/.test(line) || !/CoreSimulator|RuntimeRoot/.test(line)) continue;
		pids.push(line.trim().split(/\s+/)[0]);
	}
	// vmmap walks a process's whole address space, so the processes are read at once, not one after another.
	const readings = await Promise.all(
		pids.map((pid) =>
			promisify(execFile)('vmmap', ['--summary', pid], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).then(
				({ stdout }) => [pid, /Physical footprint:\s+([\d.]+)([KMG])/.exec(stdout)],
				// The process went away, or vmmap may not read it: say which, or a missing reading has no reason.
				(e) => {
					console.log(`photo-memory: vmmap ${pid} failed: ${String(e?.message || e).split('\n')[0]}`);
					return [pid, null];
				},
			),
		),
	);
	const byPid = new Map();
	for (const [pid, m] of readings) if (m) byPid.set(pid, Number(m[1]) * ({ K: 1 / 1024, M: 1, G: 1024 })[m[2]]);
	return byPid;
}

/** What an arm cost: the GROWTH of each process between two readings, summed, and what other processes freed meanwhile.
 *  A plain sum of all processes nets the two, so a process from an earlier page (the previous arm, the Studio probes)
 *  that frees its memory during the arm hides the arm's cost: an iPhone run read 29 MB for the originals arm that had
 *  read 110 MB on the run before, from a baseline 48 MB higher. A process that shrinks, or is gone, adds nothing. */
export function growthMB(before, after) {
	let grew = 0;
	let freed = 0;
	for (const [pid, mb] of after) grew += Math.max(0, mb - (before.get(pid) ?? 0));
	for (const [pid, mb] of before) freed += Math.max(0, mb - (after.get(pid) ?? 0));
	const total = (m) => [...m.values()].reduce((a, b) => a + b, 0);
	return { grew: Math.round(grew), freed: Math.round(freed), baseMB: Math.round(total(before)) };
}
