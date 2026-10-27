/**
 * lib/core/jpeg-encode.mjs — the one JPEG encoder every export uses, in every host.
 *
 * WHY OUR OWN. `canvas.toBlob('image/jpeg', q)` hands the pixels to the platform's encoder, and the platforms disagree:
 * Firefox keeps full-resolution color and writes about twice Chromium's bytes for the same picture at the same quality,
 * and the same 52-slide picture PowerPoint came out 12.5 MB from Chromium and 43.3 MB from an iPhone. The export spine
 * shared the CODE that decided what to write and still left the bytes to whatever browser it ran in. This writes the
 * same file from the same pixels in Chromium, WebKit, Firefox and Node (docs/e2e/jpeg-encode-engines.spec.ts).
 *
 * WHAT IT WRITES. Baseline JFIF: 4:2:0 chroma (the 2×2 average), the libjpeg quality scaling of the Annex K tables,
 * the Annex K Huffman tables, the AAN float DCT with its constants written out (no `Math.cos`, so no engine's
 * transcendental rounding can reach the bytes). Pixels with alpha are composited onto white here, so a caller never
 * paints a second, white-backed copy of the picture first.
 *
 * MEMORY. `createJpegEncoder` takes rows as they come and holds one 16-row band of samples; the output is the only
 * thing that grows. `encodeJpegCanvas` reads a canvas a band at a time through a one-band scratch canvas, the way
 * `encodePng` (slide-camera.mjs) does.
 *
 * `createJpegEncoder` uses nothing outside its own body, so a host can send its source into a page as text
 * (lib/export/chrome-recode.js does), and `encodeJpegCanvas` does the same when handed the factory. Keep it that way.
 */

/**
 * A streaming baseline JPEG encoder.
 * @param {{ width: number, height: number, quality: number }} opts  quality 1 to 100, the libjpeg scale
 * @returns {{ addRows: (rgba: ArrayLike<number>, rows: number) => void, finish: () => Uint8Array }}
 *   `addRows` takes `rows` rows of RGBA, `width * 4` bytes each, top to bottom; `finish` returns the file once all
 *   `height` rows are in.
 */
export function createJpegEncoder({ width, height, quality }) {
	const W = width | 0;
	const H = height | 0;
	if (!(W > 0 && H > 0 && W < 65536 && H < 65536)) throw new RangeError(`jpeg: bad size ${width}x${height}`);
	if (!Number.isFinite(Number(quality))) throw new TypeError('jpeg: quality must be a number from 1 to 100');
	const q = Math.min(100, Math.max(1, Math.round(Number(quality))));

	// ── Tables ────────────────────────────────────────────────────────────────────────────────────────────
	// The zigzag order: position k of the stream holds the coefficient at natural index ZZ[k].
	const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
	const LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
	const CHROMA = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
	// libjpeg's jpeg_quality_scaling + jpeg_add_quant_table (force_baseline).
	const scale = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
	const quant = (base) => base.map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100))));
	const qY = quant(LUMA);
	const qC = quant(CHROMA);
	// The AAN DCT leaves coefficient (u, v) scaled by 8 * s[u] * s[v]; the divisor folds that in.
	const S = [1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.5411961, 0.275899379];
	const divisors = (table) => {
		const d = new Float64Array(64);
		for (let i = 0; i < 64; i++) d[i] = 1 / (table[i] * S[i >> 3] * S[i & 7] * 8);
		return d;
	};
	const dY = divisors(qY);
	const dC = divisors(qC);

	// Annex K.3 Huffman tables: code counts by length 1..16, then the symbols.
	const DC_Y_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
	const DC_Y_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
	const DC_C_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
	const DC_C_VALS = DC_Y_VALS;
	const AC_Y_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
	const AC_Y_VALS = [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];
	const AC_C_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
	const AC_C_VALS = [0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];
	// Canonical codes (Annex C): code[symbol] and size[symbol].
	const codesOf = (bits, vals) => {
		const code = new Uint16Array(256);
		const size = new Uint8Array(256);
		let c = 0;
		let k = 0;
		for (let len = 1; len <= 16; len++) {
			for (let n = 0; n < bits[len - 1]; n++) {
				code[vals[k]] = c++;
				size[vals[k++]] = len;
			}
			c <<= 1;
		}
		return { code, size };
	};
	const hDcY = codesOf(DC_Y_BITS, DC_Y_VALS);
	const hDcC = codesOf(DC_C_BITS, DC_C_VALS);
	const hAcY = codesOf(AC_Y_BITS, AC_Y_VALS);
	const hAcC = codesOf(AC_C_BITS, AC_C_VALS);

	// ── Output ────────────────────────────────────────────────────────────────────────────────────────────
	// Filled pieces are kept as a list and joined once, so a growing file is never copied as it grows.
	const pieces = [];
	let buf = new Uint8Array(1 << 16);
	let at = 0;
	const flush = () => {
		pieces.push(buf.subarray(0, at));
		buf = new Uint8Array(buf.length);
		at = 0;
	};
	const byte = (b) => {
		if (at === buf.length) flush();
		buf[at++] = b;
	};
	const word = (w) => {
		byte(w >> 8);
		byte(w & 0xff);
	};
	const bytes = (list) => {
		for (let i = 0; i < list.length; i++) byte(list[i]);
	};
	let bitBuf = 0;
	let bitCnt = 0;
	const bits = (value, len) => {
		bitBuf = (bitBuf << len) | value;
		bitCnt += len;
		while (bitCnt >= 8) {
			const b = (bitBuf >>> (bitCnt - 8)) & 0xff;
			byte(b);
			if (b === 0xff) byte(0); // byte stuffing
			bitCnt -= 8;
		}
		bitBuf &= (1 << bitCnt) - 1;
	};

	// ── Headers ───────────────────────────────────────────────────────────────────────────────────────────
	word(0xffd8); // SOI
	word(0xffe0); // APP0 JFIF 1.01, no density, no thumbnail
	word(16);
	bytes([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
	word(0xffdb); // DQT: table 0 luma, table 1 chroma, zigzag order
	word(2 + 65 * 2);
	byte(0);
	for (let k = 0; k < 64; k++) byte(qY[ZZ[k]]);
	byte(1);
	for (let k = 0; k < 64; k++) byte(qC[ZZ[k]]);
	word(0xffc0); // SOF0: 8-bit, three components, Y 2×2, Cb and Cr 1×1
	word(17);
	byte(8);
	word(H);
	word(W);
	bytes([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
	word(0xffc4); // DHT, all four tables in one segment
	const dht = [
		[0x00, DC_Y_BITS, DC_Y_VALS],
		[0x10, AC_Y_BITS, AC_Y_VALS],
		[0x01, DC_C_BITS, DC_C_VALS],
		[0x11, AC_C_BITS, AC_C_VALS],
	];
	word(2 + dht.reduce((n, [, b, v]) => n + 17 + v.length, 0));
	for (const [cls, b, v] of dht) {
		byte(cls);
		bytes(b);
		bytes(v);
	}
	word(0xffda); // SOS
	word(12);
	bytes([3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);

	// ── Blocks ────────────────────────────────────────────────────────────────────────────────────────────
	const block = new Float64Array(64);
	const coef = new Int32Array(64);
	/** Forward DCT (AAN, as libjpeg's jfdctflt.c) in place on `block`, then quantize into `coef`. */
	const fdctQuant = (div) => {
		const d = block;
		for (let p = 0; p < 64; p += 8) {
			const t0 = d[p] + d[p + 7], t7 = d[p] - d[p + 7];
			const t1 = d[p + 1] + d[p + 6], t6 = d[p + 1] - d[p + 6];
			const t2 = d[p + 2] + d[p + 5], t5 = d[p + 2] - d[p + 5];
			const t3 = d[p + 3] + d[p + 4], t4 = d[p + 3] - d[p + 4];
			let t10 = t0 + t3;
			const t13 = t0 - t3;
			let t11 = t1 + t2;
			let t12 = t1 - t2;
			d[p] = t10 + t11;
			d[p + 4] = t10 - t11;
			const z1 = (t12 + t13) * 0.707106781;
			d[p + 2] = t13 + z1;
			d[p + 6] = t13 - z1;
			t10 = t4 + t5;
			t11 = t5 + t6;
			t12 = t6 + t7;
			const z5 = (t10 - t12) * 0.382683433;
			const z2 = 0.5411961 * t10 + z5;
			const z4 = 1.306562965 * t12 + z5;
			const z3 = t11 * 0.707106781;
			const z11 = t7 + z3;
			const z13 = t7 - z3;
			d[p + 5] = z13 + z2;
			d[p + 3] = z13 - z2;
			d[p + 1] = z11 + z4;
			d[p + 7] = z11 - z4;
		}
		for (let p = 0; p < 8; p++) {
			const t0 = d[p] + d[p + 56], t7 = d[p] - d[p + 56];
			const t1 = d[p + 8] + d[p + 48], t6 = d[p + 8] - d[p + 48];
			const t2 = d[p + 16] + d[p + 40], t5 = d[p + 16] - d[p + 40];
			const t3 = d[p + 24] + d[p + 32], t4 = d[p + 24] - d[p + 32];
			let t10 = t0 + t3;
			const t13 = t0 - t3;
			let t11 = t1 + t2;
			let t12 = t1 - t2;
			d[p] = t10 + t11;
			d[p + 32] = t10 - t11;
			const z1 = (t12 + t13) * 0.707106781;
			d[p + 16] = t13 + z1;
			d[p + 48] = t13 - z1;
			t10 = t4 + t5;
			t11 = t5 + t6;
			t12 = t6 + t7;
			const z5 = (t10 - t12) * 0.382683433;
			const z2 = 0.5411961 * t10 + z5;
			const z4 = 1.306562965 * t12 + z5;
			const z3 = t11 * 0.707106781;
			const z11 = t7 + z3;
			const z13 = t7 - z3;
			d[p + 40] = z13 + z2;
			d[p + 24] = z13 - z2;
			d[p + 8] = z11 + z4;
			d[p + 56] = z11 - z4;
		}
		// Round half away from zero, the same on both sides of zero.
		for (let i = 0; i < 64; i++) {
			const v = d[i] * div[i];
			coef[i] = v < 0 ? -Math.floor(0.5 - v) : Math.floor(v + 0.5);
		}
	};
	/** Entropy-code `coef` (natural order) after DC prediction from `pred`; returns this block's DC. */
	const encodeBlock = (pred, dc, ac) => {
		const diff = coef[0] - pred;
		if (diff === 0) bits(dc.code[0], dc.size[0]);
		else {
			// The value's size category, then its bits (a negative value as its one's complement).
			const n = 32 - Math.clz32(diff < 0 ? -diff : diff);
			bits(dc.code[n], dc.size[n]);
			bits(diff < 0 ? diff + (1 << n) - 1 : diff, n);
		}
		let last = 63;
		while (last > 0 && coef[ZZ[last]] === 0) last--;
		let run = 0;
		for (let k = 1; k <= last; k++) {
			const c = coef[ZZ[k]];
			if (c === 0) {
				run++;
				continue;
			}
			while (run > 15) {
				bits(ac.code[0xf0], ac.size[0xf0]); // ZRL: sixteen zeros
				run -= 16;
			}
			const n = 32 - Math.clz32(c < 0 ? -c : c);
			const sym = (run << 4) | n;
			bits(ac.code[sym], ac.size[sym]);
			bits(c < 0 ? c + (1 << n) - 1 : c, n);
			run = 0;
		}
		if (last < 63) bits(ac.code[0], ac.size[0]); // EOB
		return coef[0];
	};

	// ── Bands ─────────────────────────────────────────────────────────────────────────────────────────────
	// One MCU row is 16 pixel rows. Samples are stored at full resolution, padded to a multiple of 16 by repeating the
	// last column (and, at the bottom, the last row), which is what libjpeg does and keeps the edge blocks free of ringing.
	const WP = (W + 15) & ~15;
	const bY = new Float32Array(WP * 16);
	const bCb = new Float32Array(WP * 16);
	const bCr = new Float32Array(WP * 16);
	let bandRows = 0;
	let rowsIn = 0;
	let pY = 0;
	let pCb = 0;
	let pCr = 0;
	const encodeBand = () => {
		// Repeat the band's last real row down to 16.
		for (let r = bandRows; r < 16; r++) {
			bY.copyWithin(r * WP, (bandRows - 1) * WP, bandRows * WP);
			bCb.copyWithin(r * WP, (bandRows - 1) * WP, bandRows * WP);
			bCr.copyWithin(r * WP, (bandRows - 1) * WP, bandRows * WP);
		}
		for (let mx = 0; mx < WP; mx += 16) {
			for (let by = 0; by < 16; by += 8) {
				for (let bx = 0; bx < 16; bx += 8) {
					for (let r = 0; r < 8; r++) {
						const o = (by + r) * WP + mx + bx;
						for (let c = 0; c < 8; c++) block[r * 8 + c] = bY[o + c];
					}
					fdctQuant(dY);
					pY = encodeBlock(pY, hDcY, hAcY);
				}
			}
			for (let r = 0; r < 8; r++) {
				const o = 2 * r * WP + mx;
				for (let c = 0; c < 8; c++) {
					const i = o + 2 * c;
					block[r * 8 + c] = (bCb[i] + bCb[i + 1] + bCb[i + WP] + bCb[i + WP + 1]) * 0.25;
				}
			}
			fdctQuant(dC);
			pCb = encodeBlock(pCb, hDcC, hAcC);
			for (let r = 0; r < 8; r++) {
				const o = 2 * r * WP + mx;
				for (let c = 0; c < 8; c++) {
					const i = o + 2 * c;
					block[r * 8 + c] = (bCr[i] + bCr[i + 1] + bCr[i + WP] + bCr[i + WP + 1]) * 0.25;
				}
			}
			fdctQuant(dC);
			pCr = encodeBlock(pCr, hDcC, hAcC);
		}
		bandRows = 0;
	};
	let done = false;

	return {
		addRows(rgba, rows) {
			if (done) throw new Error('jpeg: addRows after finish');
			if (rows < 0 || rowsIn + rows > H) throw new RangeError(`jpeg: ${rowsIn + rows} rows for a ${H}-row image`);
			if (rgba.length < rows * W * 4) throw new RangeError('jpeg: fewer pixels than rows * width * 4');
			for (let r = 0; r < rows; r++) {
				const o = bandRows * WP;
				let i = r * W * 4;
				for (let x = 0; x < W; x++, i += 4) {
					let R = rgba[i];
					let G = rgba[i + 1];
					let B = rgba[i + 2];
					const A = rgba[i + 3];
					if (A !== 255) {
						// Over white: c * a + 255 * (1 - a), in 0..255 units.
						const k = (255 - A) * 255;
						R = (R * A + k) / 255;
						G = (G * A + k) / 255;
						B = (B * A + k) / 255;
					}
					bY[o + x] = 0.299 * R + 0.587 * G + 0.114 * B - 128;
					bCb[o + x] = -0.168736 * R - 0.331264 * G + 0.5 * B;
					bCr[o + x] = 0.5 * R - 0.418688 * G - 0.081312 * B;
				}
				for (let x = W; x < WP; x++) {
					bY[o + x] = bY[o + W - 1];
					bCb[o + x] = bCb[o + W - 1];
					bCr[o + x] = bCr[o + W - 1];
				}
				bandRows++;
				rowsIn++;
				if (bandRows === 16) encodeBand();
			}
		},
		finish() {
			if (done) throw new Error('jpeg: finish called twice');
			if (rowsIn !== H) throw new RangeError(`jpeg: ${rowsIn} of ${H} rows written`);
			if (bandRows) encodeBand();
			if (bitCnt > 0) bits((1 << (8 - bitCnt)) - 1, 8 - bitCnt); // pad the last byte with ones
			word(0xffd9); // EOI
			done = true;
			pieces.push(buf.subarray(0, at));
			const out = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
			let o = 0;
			for (const p of pieces) {
				out.set(p, o);
				o += p.length;
			}
			return out;
		},
	};
}

/** JPEG bytes for a whole RGBA buffer (`width * height * 4`). */
export function encodeJpeg(rgba, width, height, quality) {
	const enc = createJpegEncoder({ width, height, quality });
	enc.addRows(rgba, height);
	return enc.finish();
}

/**
 * JPEG bytes for a canvas (DOM or Offscreen), read a band at a time; transparency lands on white.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {{ quality: number }} opts  quality 1 to 100
 * @param {typeof createJpegEncoder} [make]  the encoder factory. A host sending this function into a page as source text
 *   passes the factory it sent alongside, and then this body uses nothing outside itself either.
 */
export function encodeJpegCanvas(canvas, { quality }, make = createJpegEncoder) {
	const { width: W, height: H } = canvas;
	// Read 64 rows at a time (four 16-row bands) through a scratch canvas that tall, not from `canvas` itself: many readbacks
	// of one canvas make the browser move it to the CPU (the same reason encodePng does it).
	const rowsPer = Math.min(64, H);
	const scratch = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(W, rowsPer) : canvas.ownerDocument.createElement('canvas');
	scratch.width = W;
	scratch.height = rowsPer;
	const sg = scratch.getContext('2d', { willReadFrequently: true });
	const enc = make({ width: W, height: H, quality });
	for (let y0 = 0; y0 < H; y0 += rowsPer) {
		const rows = Math.min(rowsPer, H - y0);
		sg.clearRect(0, 0, W, rows);
		sg.drawImage(canvas, 0, y0, W, rows, 0, 0, W, rows);
		enc.addRows(sg.getImageData(0, 0, W, rows).data, rows);
	}
	return enc.finish();
}
