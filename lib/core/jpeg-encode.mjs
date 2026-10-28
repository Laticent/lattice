/**
 * lib/core/jpeg-encode.mjs — the one JPEG encoder every export uses, in every host.
 *
 * WHY OUR OWN. `canvas.toBlob('image/jpeg', q)` hands the pixels to the platform's encoder, and the platforms disagree:
 * Firefox keeps full-resolution color and writes a third more than ours on the Yearn deck's pictures at the same quality,
 * and the same 52-slide picture PowerPoint came out 12.5 MB from Chromium and 43.3 MB from an iPhone, whose Safari writes
 * 1.5 to 2.2 times our bytes at the same quality (docs/scripts/ios-safari/jpeg-probe.js, in an iOS Simulator). The export spine
 * shared the CODE that decided what to write and still left the bytes to whatever browser it ran in. This writes the
 * same file from the same pixels in Chromium, WebKit, Firefox and Node (docs/e2e/jpeg-encode-engines.spec.ts).
 *
 * WHAT IT WRITES. Baseline JFIF: 4:2:0 chroma (the 2×2 average), the libjpeg quality scaling of the Annex K tables,
 * Huffman tables built for each picture (as libjpeg's optimize_coding), the AAN float DCT with its constants written out (no `Math.cos`, so no engine's
 * transcendental rounding can reach the bytes). Pixels with alpha are composited onto white here, so a caller never
 * paints a second, white-backed copy of the picture first.
 *
 * MEMORY. `createJpegEncoder` takes rows as they come and holds one 16-row band of samples. What grows is the scan's
 * symbol log, kept until the picture's own Huffman tables can be built from it (4 bytes a symbol), and then the output.
 * Measured for a 2560 × 1440 slide at quality 90: about 3 MB of log for a photo-heavy Yearn slide, and 20 MB for pure
 * noise at quality 95 (the worst case; the slide's own pixels are 14.7 MB). `encodeJpegCanvas` reads a canvas a band at a time through a one-band scratch canvas, the way
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
	// 65500, not the format's 65535: libjpeg (and every decoder built on it) refuses anything larger.
	if (!(W > 0 && H > 0 && W <= 65500 && H <= 65500)) throw new RangeError(`jpeg: bad size ${width}x${height}`);
	if (quality == null || !Number.isFinite(Number(quality))) throw new TypeError('jpeg: quality must be a number from 1 to 100');
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

	// Huffman tables built for this picture (libjpeg's jpeg_gen_optimal_table, Annex K.2): `freq` counts each symbol's uses;
	// the result is the code count for each length 1..16 and the symbols in code order. Integer-only, so deterministic.
	const optimalTable = (counts) => {
		const freq = Int32Array.from(counts);
		freq[256] = 1; // a reserved symbol, so no real code is all ones
		const codesize = new Int32Array(257);
		const others = new Int32Array(257).fill(-1);
		for (;;) {
			// The two least frequent (the larger index on a tie, as libjpeg), merged.
			let c1 = -1;
			let v = 0x7fffffff;
			for (let i = 0; i <= 256; i++) if (freq[i] && freq[i] <= v) { v = freq[i]; c1 = i; }
			let c2 = -1;
			v = 0x7fffffff;
			for (let i = 0; i <= 256; i++) if (freq[i] && freq[i] <= v && i !== c1) { v = freq[i]; c2 = i; }
			if (c2 < 0) break;
			freq[c1] += freq[c2];
			freq[c2] = 0;
			codesize[c1]++;
			while (others[c1] >= 0) { c1 = others[c1]; codesize[c1]++; }
			others[c1] = c2;
			codesize[c2]++;
			while (others[c2] >= 0) { c2 = others[c2]; codesize[c2]++; }
		}
		const count = new Int32Array(33);
		for (let i = 0; i <= 256; i++) {
			// libjpeg's "Huffman code size table overflow": a tree this deep needs millions of symbols in a Fibonacci-shaped spread.
			if (codesize[i] > 32) throw new RangeError('jpeg: Huffman code longer than 32 bits');
			if (codesize[i]) count[codesize[i]]++;
		}
		// No code longer than 16 bits (K.3): move pairs up the tree.
		for (let i = 32; i > 16; i--) {
			while (count[i] > 0) {
				let j = i - 2;
				while (count[j] === 0) j--;
				count[i] -= 2;
				count[i - 1]++;
				count[j + 1] += 2;
				count[j]--;
			}
		}
		let longest = 16;
		while (count[longest] === 0) longest--;
		count[longest]--; // drop the reserved symbol
		const vals = [];
		for (let len = 1; len <= 32; len++) for (let sym = 0; sym < 256; sym++) if (codesize[sym] === len) vals.push(sym);
		return { counts: Array.from(count.subarray(1, 17)), vals };
	};
	// Canonical codes (Annex C): code[symbol] and size[symbol].
	const codesOf = ({ counts, vals }) => {
		const code = new Uint16Array(256);
		const size = new Uint8Array(256);
		let c = 0;
		let k = 0;
		for (let len = 1; len <= 16; len++) {
			for (let n = 0; n < counts[len - 1]; n++) {
				code[vals[k]] = c++;
				size[vals[k++]] = len;
			}
			c <<= 1;
		}
		return { code, size };
	};

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
	// ── Blocks ────────────────────────────────────────────────────────────────────────────────────────────
	// libjpeg's literal cos(pi/4), as jfdctflt.c writes it. Not Math.SQRT1_2: the last digits differ, and they reach every
	// exported JPEG's bytes (the golden hash in test/unit/core/jpeg-encode.test.js would change).
	// biome-ignore lint/suspicious/noApproximativeNumericConstant: the literal is the specification, see above.
	const C4 = 0.707106781;
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
			const z1 = (t12 + t13) * C4;
			d[p + 2] = t13 + z1;
			d[p + 6] = t13 - z1;
			t10 = t4 + t5;
			t11 = t5 + t6;
			t12 = t6 + t7;
			const z5 = (t10 - t12) * 0.382683433;
			const z2 = 0.5411961 * t10 + z5;
			const z4 = 1.306562965 * t12 + z5;
			const z3 = t11 * C4;
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
			const z1 = (t12 + t13) * C4;
			d[p + 16] = t13 + z1;
			d[p + 48] = t13 - z1;
			t10 = t4 + t5;
			t11 = t5 + t6;
			t12 = t6 + t7;
			const z5 = (t10 - t12) * 0.382683433;
			const z2 = 0.5411961 * t10 + z5;
			const z4 = 1.306562965 * t12 + z5;
			const z3 = t11 * C4;
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
	// The symbol log: the scan's Huffman symbols and their extra bits, kept until the tables built from their counts can write
	// them. Tables: 0 luma DC, 1 luma AC, 2 chroma DC, 3 chroma AC. One entry is table (2 bits), symbol (8), extra-bit count
	// (6) and extra bits (16): 4 bytes a symbol, six to nine times the finished file.
	const freq = [new Int32Array(257), new Int32Array(257), new Int32Array(257), new Int32Array(257)];
	const logs = [];
	let log = new Uint32Array(1 << 16);
	let li = 0;
	const put = (t, sym, n, v) => {
		freq[t][sym]++;
		if (li === log.length) {
			logs.push(log);
			log = new Uint32Array(log.length);
			li = 0;
		}
		log[li++] = ((t << 30) | (sym << 22) | (n << 16) | v) >>> 0;
	};
	/** Log `coef` (natural order) after DC prediction from `pred` with tables `t` (DC) and `t + 1` (AC); returns this block's DC. */
	const encodeBlock = (pred, t) => {
		const diff = coef[0] - pred;
		// A value's size category, then its bits (a negative value as its one's complement).
		const dn = diff === 0 ? 0 : 32 - Math.clz32(diff < 0 ? -diff : diff);
		put(t, dn, dn, diff < 0 ? diff + (1 << dn) - 1 : diff);
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
				put(t + 1, 0xf0, 0, 0); // ZRL: sixteen zeros
				run -= 16;
			}
			const n = 32 - Math.clz32(c < 0 ? -c : c);
			put(t + 1, (run << 4) | n, n, c < 0 ? c + (1 << n) - 1 : c);
			run = 0;
		}
		if (last < 63) put(t + 1, 0, 0, 0); // EOB
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
					pY = encodeBlock(pY, 0);
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
			pCb = encodeBlock(pCb, 2);
			for (let r = 0; r < 8; r++) {
				const o = 2 * r * WP + mx;
				for (let c = 0; c < 8; c++) {
					const i = o + 2 * c;
					block[r * 8 + c] = (bCr[i] + bCr[i + 1] + bCr[i + WP] + bCr[i + WP + 1]) * 0.25;
				}
			}
			fdctQuant(dC);
			pCr = encodeBlock(pCr, 2);
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
			const tables = freq.map(optimalTable);
			word(0xffc4); // DHT, all four tables in one segment
			word(2 + tables.reduce((n, t) => n + 17 + t.vals.length, 0));
			[0x00, 0x10, 0x01, 0x11].forEach((cls, i) => {
				byte(cls);
				bytes(tables[i].counts);
				bytes(tables[i].vals);
			});
			word(0xffda); // SOS: Y tables 0/0, Cb and Cr 1/1, full spectral range
			word(12);
			bytes([3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);
			const codes = tables.map(codesOf);
			logs.push(log.subarray(0, li));
			for (const part of logs) {
				for (let i = 0; i < part.length; i++) {
					const e = part[i];
					const t = codes[e >>> 30];
					const sym = (e >>> 22) & 0xff;
					const n = (e >>> 16) & 0x3f;
					bits(t.code[sym], t.size[sym]);
					if (n) bits(e & 0xffff, n);
				}
			}
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
