// @vitest-environment node
/**
 * The in-tree inflate against zlib itself (tools/lastra-corpus/generate.py calls libz's inflate() and
 * records its verdict, reason and output for every stream): byte for byte on every stream zlib inflates; on
 * every stream zlib refuses, the same refusal for the same reason after exactly the same output; and
 * lastra's one deliberate difference, the Adler-32, which lastra never checks (Chromium displays such
 * files). Then seeded damage: every case ends in bounded work with the bytes or a LastraError, never
 * anything else.
 */

import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { isLastraError, type WorkMeter } from './index.js';
import { type InflateSink, inflateTo, rangeSource } from './inflate.js';
import { expected, FIXTURES, rng, sha256 } from './test-support.js';


function inflateAll(stream: Uint8Array, meter: WorkMeter = { steps: 0 }): { out: Uint8Array; ended: boolean; error: unknown } {
  const parts: number[] = [];
  const sink: InflateSink = (b, s, e) => {
    for (let i = s; i < e; i++) parts.push(b[i]);
    return false;
  };
  try {
    const steps = inflateTo(rangeSource(stream), sink, meter);
    let r = steps.next();
    while (!r.done) r = steps.next();
    return { out: Uint8Array.from(parts), ended: r.value === false, error: null };
  } catch (e) {
    return { out: Uint8Array.from(parts), ended: false, error: e };
  }
}

const cases = Object.entries(expected.zlib);

/**
 * zlib's reason for each refusal, and the words lastra uses for the same one. Every documented refusal of
 * inflate.ts has a hand-built fixture (generate.py `zlib_refusals`), so loosening any check either lets a
 * stream through or refuses it for another reason, and the pair below catches both.
 */
const ZLIB_REASONS: Record<string, RegExp> = {
  'invalid distance too far back': /a distance before the start of the output/,
  'invalid distance code': /distance symbol 3[01]|an invalid distance code/,
  'invalid literal/length code': /length symbol 28[67]|an invalid literal\/length code/,
  'invalid stored block lengths': /a stored block whose length and its complement disagree/,
  'invalid block type': /block type 3/,
  'invalid code lengths set': /an (over-full|incomplete) code-length code/,
  'invalid literal/lengths set': /an (over-full|incomplete) literal\/length code/,
  'invalid distances set': /an (over-full|incomplete) distance code/,
  'invalid code -- missing end-of-block': /no end-of-block code/,
  'invalid bit length repeat': /a repeat with no length before it|code lengths that repeat past the end/,
  'too many length or distance symbols': /too many length or distance symbols/,
};

describe('inflate matches zlib', () => {
  test('the corpus has every verdict', () => {
    const verdicts = new Set(cases.map(([, c]) => c.zlibVerdict));
    for (const v of ['ok', 'adler', 'error', 'truncated']) expect(verdicts).toContain(v);
  });

  for (const [name, want] of cases) {
    test(`${name} (zlib: ${want.zlibVerdict})`, () => {
      const stream = new Uint8Array(readFileSync(`${FIXTURES}zlib/${name}`));
      const r = inflateAll(stream);
      if (want.zlibVerdict === 'ok' || want.zlibVerdict === 'adler') {
        // zlib inflated every byte (and, for 'adler', then rejected the checksum, which lastra does not check).
        expect(r.error).toBeNull();
        expect(r.ended).toBe(true);
        expect(r.out.length).toBe(want.outputLength);
        expect(sha256(r.out)).toBe(want.outputSha256);
        return;
      }
      // zlib stopped: lastra refuses too, for zlib's reason, having handed out exactly zlib's output.
      expect(isLastraError(r.error), String(r.error)).toBe(true);
      const err = r.error as { code: string; message: string };
      expect(err.code).toBe(want.zlibVerdict === 'truncated' ? 'truncated' : 'corrupt');
      if (want.zlibVerdict === 'error') {
        const reason = want.zlibReason as string;
        expect(ZLIB_REASONS[reason], `no lastra reason paired with zlib's '${reason}'`).toBeDefined();
        expect(err.message).toMatch(ZLIB_REASONS[reason]);
      }
      expect(r.out.length).toBe(want.outputLength);
      expect(sha256(r.out)).toBe(want.outputSha256);
    });
  }

  test('a hand-built stream reaches every documented refusal', () => {
    const reasons = new Set(cases.map(([, c]) => c.zlibReason).filter(Boolean));
    for (const reason of Object.keys(ZLIB_REASONS)) expect(reasons, `no fixture where zlib says '${reason}'`).toContain(reason);
  });

  test("the consumer's stop ends the inflate: later bytes, more streams and the checksum are never read", () => {
    const stream = new Uint8Array(readFileSync(`${FIXTURES}zlib/text-l9.z`));
    const junk = new Uint8Array(stream.length + 7);
    junk.set(stream.subarray(0, stream.length - 4)); // no Adler-32, then garbage
    junk.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], stream.length - 4);
    let got = 0;
    const steps = inflateTo(rangeSource(junk), (_b, s, e) => (got += e - s) >= 1000, { steps: 0 });
    let r = steps.next();
    while (!r.done) r = steps.next();
    expect(r.value).toBe(true);
    expect(got).toBeGreaterThanOrEqual(1000);
  });
});

describe('inflate on blocks with no output', () => {
  // red team R3-2: minimal dynamic blocks make no output, so a yield that waited for output never came:
  // 20 MB held the thread 12 s, and each block allocated its three tables afresh.
  const stream = () => new Uint8Array(readFileSync(`${FIXTURES}zlib/accept-empty-dynamic-blocks.z`));

  test('1,000 empty dynamic blocks yield on work, not only on output', () => {
    let yields = 0;
    const steps = inflateTo(rangeSource(stream()), () => false, { steps: 0 });
    let r = steps.next();
    while (!r.done) {
      yields++;
      r = steps.next();
    }
    expect(yields).toBeGreaterThanOrEqual(4);
  });

  test('a dynamic block rebuilds its tables in place: no typed array per block', () => {
    const real = globalThis.Uint16Array;
    let made = 0;
    globalThis.Uint16Array = new Proxy(real, {
      construct(target, args) {
        made++;
        return Reflect.construct(target, args);
      },
    });
    let out: ReturnType<typeof inflateAll>;
    try {
      out = inflateAll(stream());
    } finally {
      globalThis.Uint16Array = real;
    }
    expect(out.error).toBeNull();
    expect(Array.from(out.out)).toEqual([65]);
    expect(made).toBeLessThan(50);
  });
});

describe('inflate refuses what zlib refuses in the header', () => {
  const run = (bytes: number[]) => inflateAll(Uint8Array.from(bytes)).error;
  test('a method other than 8, a window over 32 KB, a bad check, a preset dictionary, each for its own reason', () => {
    const ok = run([0x78, 0x9c, 0x03, 0x00]);
    expect(ok).toBeNull();
    // Each header passes every check but the one it names (the check is a multiple of 31 except where the
    // check is the point), so removing any one check lets its header through or refuses it for another reason.
    for (const [cmf, flg, reason] of [
      [0x77, 0x09, 'compression method 7'], // method 7; 0x7709 is a multiple of 31
      [0x88, 0x98, 'a window over 32 KB'], // window 2^16
      [0x78, 0x9d, 'the header check'], // check not a multiple of 31
      [0x78, 0xbb, 'a preset dictionary'], // FDICT set (0x78bb is a multiple of 31)
    ] as const) {
      const e = run([cmf, flg, 0x03, 0x00]) as { code?: string; message?: string } | null;
      expect(isLastraError(e) && e?.code, `${cmf.toString(16)} ${flg.toString(16)}`).toBe('corrupt');
      expect(e?.message, `${cmf.toString(16)} ${flg.toString(16)}`).toContain(reason);
    }
  });
});

describe('a stored block after a dynamic block with a one-bit end code', () => {
  // Built bit by bit: the reader has whole bytes buffered when the stored block starts, which zlib's own
  // encoder rarely produces. Those bytes are the stored block's length; dropping them loses the block.
  test('starts from the bytes already buffered', () => {
    const bits: number[] = [];
    const put = (v: number, n: number) => {
      for (let i = 0; i < n; i++) bits.push((v >> i) & 1);
    };
    const code = (c: number, n: number) => {
      for (let i = n - 1; i >= 0; i--) bits.push((c >> i) & 1);
    };
    put(0, 1); // not final
    put(2, 2); // dynamic
    put(0, 5); // 257 literal/length codes
    put(0, 5); // 1 distance code
    put(14, 4); // 18 code-length code lengths
    const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1];
    const clLen: Record<number, number> = { 18: 2, 0: 2, 1: 1 };
    for (const sym of order) put(clLen[sym] ?? 0, 3);
    // Code-length codes: '0' -> 1, '10' -> 0, '11' -> 18 (zeros, 11 + 7 bits).
    const one = () => code(0, 1);
    const zeros = (n: number) => {
      while (n >= 11) {
        const k = Math.min(n, 138);
        code(3, 2);
        put(k - 11, 7);
        n -= k;
      }
      while (n-- > 0) code(2, 2);
    };
    zeros(97);
    one(); // 'a'
    zeros(256 - 98);
    one(); // end of block
    one(); // distance 0
    // Literal codes: 'a' -> '0', end -> '1'.
    for (let i = 0; i < 20; i++) code(0, 1);
    code(1, 1);
    put(1, 1); // final
    put(0, 2); // stored
    while (bits.length % 8) bits.push(0);
    const bytes: number[] = [0x78, 0x01];
    for (let i = 0; i < bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduce((v, b, j) => v | (b << j), 0));
    bytes.push(3, 0, 0xfc, 0xff, 0x78, 0x79, 0x7a); // LEN 3, NLEN, 'xyz'
    const want = new Uint8Array([...new Array(20).fill(0x61), 0x78, 0x79, 0x7a]);
    let a = 1;
    let b = 0;
    for (const v of want) {
      a = (a + v) % 65521;
      b = (b + a) % 65521;
    }
    bytes.push(b >> 8, b & 255, a >> 8, a & 255);
    const stream = Uint8Array.from(bytes);
    expect(Array.from(inflateSync(stream))).toEqual(Array.from(want)); // the stream is valid for zlib
    const r = inflateAll(stream);
    expect(r.error).toBeNull();
    expect(Array.from(r.out)).toEqual(Array.from(want));
  });
});

describe('inflate on seeded damage', () => {
  const SEED = Number(process.env.LASTRA_FUZZ_SEED ?? 20261113) + 77;
  const bases = cases.filter(([n, c]) => c.zlibVerdict === 'ok' && !n.startsWith('damaged')).map(([n]) => new Uint8Array(readFileSync(`${FIXTURES}zlib/${n}`)));
  test(`2,000 mutated streams end in bounded work with bytes or a LastraError (seed ${SEED})`, { timeout: 120_000 }, () => {
    const codes = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const r = rng(SEED + i);
      const base = bases[Math.floor(r() * bases.length)];
      const b = base.slice(0, Math.max(2, Math.floor(r() * base.length) + 1));
      for (let k = 1 + Math.floor(r() * 4); k > 0; k--) b[Math.floor(r() * b.length)] ^= 1 << Math.floor(r() * 8);
      // Work, from inflate.ts's loops: a dynamic block costs at most 165 steps (a block, its three table
      // builds at 1 + (3n + 512) / 16 for n of 19, 286 and 30, and 316 code lengths) and reads at least 46
      // bits, so under 29 steps a byte; a fixed or stored block reads at least 3 bits for a step and a
      // flush; the fixed tables cost 126 steps once; output, at most 1032 times the input, a step per 4 KB.
      const meter: WorkMeter = { steps: 0, limit: 256 + b.length * 32 };
      const res = inflateAll(b, meter);
      if (res.error && !isLastraError(res.error)) throw new Error(`case ${i} (seed ${SEED + i}) threw ${String(res.error)}`);
      const code = res.error ? (res.error as { code: string }).code : 'ok';
      expect(String(res.error ?? ''), `case ${i} (seed ${SEED + i})`).not.toContain('work limit');
      codes.set(code, (codes.get(code) ?? 0) + 1);
    }
    for (const c of ['ok', 'corrupt', 'truncated']) expect(codes.get(c) ?? 0, c).toBeGreaterThan(0);
    expect(existsSync(FIXTURES)).toBe(true);
  });
});
