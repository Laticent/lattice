/**
 * The shared JPEG encoder (lib/core/jpeg-encode.mjs) in real Mobile Safari, against Safari's own encoder. Run by run.mjs
 * (PROBE=jpeg) through WebDriver, as the body of an async script: `latticeJpegProbe(createJpegEncoder, images)`.
 *
 * Exports wrote every JPEG with `canvas.toBlob('image/jpeg')` until this encoder, and a picture PowerPoint came out
 * 43.3 MB from an iPhone where Chromium wrote 12.5 MB. Linux WebKit uses libjpeg-turbo, like Chromium, so only an iOS
 * runner can show what Apple's encoder writes. For each picture this reports Safari's own size and color sampling (read
 * from its SOF marker), ours, both encoders' luma PSNR, and our encode time; and it returns our bytes for the reference
 * picture so run.mjs can check them against Node's.
 *
 * Self-contained (WebDriver sends it as text): it uses only its arguments, `syntheticPhoto` beside it, and the page's own APIs.
 */
/** A photograph's statistics without a photograph: smooth multi-scale value noise over gradients, seeded. */
function syntheticPhoto(w, h) {
	const px = new Uint8ClampedArray(w * h * 4);
	const hash = (x, y, s) => {
		let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2147483647);
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
	};
	const noise = (x, y, cell, s) => {
		const gx = x / cell;
		const gy = y / cell;
		const x0 = Math.floor(gx);
		const y0 = Math.floor(gy);
		const fx = gx - x0;
		const fy = gy - y0;
		const sx = fx * fx * (3 - 2 * fx);
		const sy = fy * fy * (3 - 2 * fy);
		const a = hash(x0, y0, s) + (hash(x0 + 1, y0, s) - hash(x0, y0, s)) * sx;
		const b = hash(x0, y0 + 1, s) + (hash(x0 + 1, y0 + 1, s) - hash(x0, y0 + 1, s)) * sx;
		return a + (b - a) * sy;
	};
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let v = 0;
			let amp = 0.5;
			for (let o = 0, cell = 256; o < 6; o++, cell /= 2, amp /= 2) v += amp * noise(x, y, cell, o);
			const grain = (hash(x, y, 99) - 0.5) * 10;
			const i = (y * w + x) * 4;
			px[i] = 40 + 180 * v + 30 * (x / w) + grain;
			px[i + 1] = 30 + 160 * noise(x, y, 180, 7) * v + 50 * (y / h) + grain;
			px[i + 2] = 60 + 140 * (1 - v) * noise(x, y, 320, 8) + grain;
			px[i + 3] = 255;
		}
	}
	return px;
}

// biome-ignore lint/correctness/noUnusedVariables: called by the script run.mjs assembles around this file.
async function latticeJpegProbe(createJpegEncoder, images) {
	/** Safari's chroma sampling, from the first SOF marker: '4:2:0', '4:4:4', or the raw factors. */
	function sampling(bytes) {
		for (let i = 2; i + 4 < bytes.length; ) {
			if (bytes[i] !== 0xff) return '?';
			const m = bytes[i + 1];
			const len = (bytes[i + 2] << 8) | bytes[i + 3];
			if (m >= 0xc0 && m <= 0xc2) {
				const n = bytes[i + 9];
				const f = [];
				for (let k = 0; k < n; k++) f.push(bytes[i + 11 + k * 3]);
				const y = f[0];
				if (f.length === 3 && f[1] === 0x11 && f[2] === 0x11) return y === 0x22 ? '4:2:0' : y === 0x21 ? '4:2:2' : y === 0x11 ? '4:4:4' : f.map((v) => v.toString(16)).join(',');
				return f.map((v) => v.toString(16)).join(',');
			}
			i += 2 + len;
		}
		return '?';
	}
	const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
	const decode = async (blob) => {
		const bmp = await createImageBitmap(blob);
		const c = document.createElement('canvas');
		c.width = bmp.width;
		c.height = bmp.height;
		const g = c.getContext('2d', { willReadFrequently: true });
		g.drawImage(bmp, 0, 0);
		bmp.close?.();
		return g.getImageData(0, 0, c.width, c.height).data;
	};
	const psnr = (a, b) => {
		let se = 0;
		for (let i = 0; i < a.length; i += 4) se += (luma(a, i) - luma(b, i)) ** 2;
		return 10 * Math.log10((255 * 255) / (se / (a.length / 4)));
	};
	const measure = async (name, width, height, px) => {
		const c = document.createElement('canvas');
		c.width = width;
		c.height = height;
		c.getContext('2d').putImageData(new ImageData(px, width, height), 0, 0);
		const native = await new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.9));
		const nativeBytes = new Uint8Array(await native.arrayBuffer());
		const t = performance.now();
		const enc = createJpegEncoder({ width, height, quality: 90 });
		for (let y = 0; y < height; y += 64) {
			const rows = Math.min(64, height - y);
			enc.addRows(px.subarray(y * width * 4, (y + rows) * width * 4), rows);
		}
		const ours = enc.finish();
		const ms = performance.now() - t;
		return {
			name,
			width,
			height,
			native: { type: native.type, bytes: nativeBytes.length, sampling: sampling(nativeBytes), psnr: psnr(px, await decode(native)) },
			ours: { bytes: ours.length, sampling: sampling(ours), psnr: psnr(px, await decode(new Blob([ours], { type: 'image/jpeg' }))), ms },
		};
	};
	const rows = [];
	// The reference picture, whose bytes run.mjs compares with Node's: slide-sized, as an export writes.
	const W = 2560;
	const H = 1440;
	const photo = syntheticPhoto(W, H);
	rows.push(await measure('synthetic photo 2560x1440', W, H, photo));
	const ref = createJpegEncoder({ width: W, height: H, quality: 90 });
	ref.addRows(photo, H);
	const refBytes = ref.finish();
	let bin = '';
	for (let i = 0; i < refBytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, refBytes.subarray(i, i + 0x8000));
	for (const { name, b64 } of images) {
		const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
		const bmp = await createImageBitmap(new Blob([bytes]));
		const c = document.createElement('canvas');
		c.width = bmp.width;
		c.height = bmp.height;
		const g = c.getContext('2d', { willReadFrequently: true });
		g.drawImage(bmp, 0, 0);
		rows.push(await measure(name, c.width, c.height, g.getImageData(0, 0, c.width, c.height).data));
	}
	const total = rows.reduce((t, r) => ({ native: t.native + r.native.bytes, ours: t.ours + r.ours.bytes }), { native: 0, ours: 0 });
	// Ours must decode in Safari and keep its luma above a floor. Not "within a decibel of Safari's own": Safari maps a
	// quality to finer tables than libjpeg (the first run, iOS 26.5: 1.5 to 2.2 times our bytes at 3 to 5 dB more), so its
	// numbers are the measurement this probe exists to record, not a bar.
	const FLOOR = 38;
	const bad = rows.filter((r) => !(r.ours.psnr > FLOOR));
	return {
		ok: bad.length === 0,
		error: bad.length ? `luma PSNR under ${FLOOR} dB on ${bad.map((r) => r.name).join(', ')}` : null,
		ua: navigator.userAgent,
		width: innerWidth,
		rows,
		total,
		reference: btoa(bin),
		steps: rows.map((r) => ({
			name: r.name,
			pass: r.ours.psnr > FLOOR,
			detail: `Safari ${r.native.bytes} B ${r.native.sampling} ${r.native.psnr.toFixed(2)} dB; ours ${r.ours.bytes} B ${r.ours.sampling} ${r.ours.psnr.toFixed(2)} dB, ${r.ours.ms.toFixed(0)} ms`,
		})),
	};
}
