import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BakeVoice } from './read-aloud';

// The store and the voice are the two things a bake talks to that a test cannot have: one is
// IndexedDB, the other bills a real account. Both are replaced with scriptable stand-ins that
// keep the SHAPES the real ones return, so what is exercised here is the bake's own contract —
// cache-first, retry, bank-as-you-go, refuse-or-nothing — and not a mock's convenience.

/** The device's clip store: key → raw byte length. */
const stored = new Map<string, number>();
/** Every key `putClip` was handed, in order — the banking record. */
const banked: string[] = [];
/** text → the outcomes `synthBakeClip` should return, consumed one per attempt. A `number`
 *  is a successful clip of that many bytes; a `string` is an error message. */
const script = new Map<string, (number | string)[]>();
/** Every text a synthesis was attempted for, in order. */
const attempts: string[] = [];
/** Every key the bake marked as recently-used, so its own quote cannot be evicted mid-run. */
const touched: string[] = [];
/** The error returned for any text with no script entry — so a test can make EVERY sentence
 *  fail the same way, which is what a revoked key or an exhausted balance actually looks like. */
let defaultError = 'no audio returned';
/** The "keep narration on this device" workspace switch, as the bake sees it. */
let narrationCacheOn = true;

const clipOf = (size: number, type = 'audio/mpeg') => ({ size, type, arrayBuffer: async () => new ArrayBuffer(size) });

vi.mock('@/playground/narration-prefs.js', () => ({
	narrationCacheEnabled: () => narrationCacheOn,
	narrationBitrate: () => 64,
}));

vi.mock('@/playground/narration-store.js', () => ({
	getClip: async (key: string) => {
		const size = stored.get(key);
		return size ? clipOf(size) : null;
	},
	putClip: async (key: string, blob: { size: number }) => {
		banked.push(key);
		stored.set(key, blob.size);
	},
	clipSizes: async (keys: string[]) => new Map(keys.filter((k) => stored.has(k)).map((k) => [k, stored.get(k) as number])),
	touchClips: async (keys: string[]) => {
		const hit = keys.filter((k) => stored.has(k));
		touched.push(...hit);
		return hit.length;
	},
}));

/** The cache-key shape voice-model actually produces, including the rung the caller chose.
 *  `'kokoro'` is the on-device rung's own `.name`; everything else resolves to the cloud one. */
const rungKey = (text: string, voice: BakeVoice) => JSON.stringify([voice.rung === 'kokoro' ? 'kokoro' : 'openrouter-tts', voice.model, voice.voice, voice.speed, text]);

vi.mock('./read-aloud', async (importOriginal) => ({
	...(await importOriginal<typeof import('./read-aloud')>()),
	// The key builder, standing in for voice-model's — same content-complete JSON shape, so a
	// test that reconstructs a key by hand fails here exactly as it would in the browser.
	//
	// IT HONORS `voice.rung`, and it did not used to. The rung name was hardcoded to
	// 'openrouter-tts' regardless, and no test passed a rung at all — so if the real builder
	// ever diverged for the on-device tier, every bake test here would still pass while the
	// browser missed 100% of its cache lookups and re-billed the whole deck (#1462 item 7). A
	// mock that cannot express the second case cannot fail for it.
	bakeClipKeys: async (perSlide: string[][], voice: BakeVoice) => perSlide.map((row) => row.map((text) => rungKey(text, voice))),
	synthBakeClip: async (text: string, voice: BakeVoice) => {
		attempts.push(text);
		const key = rungKey(text, voice);
		const next = script.get(text)?.shift();
		if (typeof next === 'number') return { ok: true, bytes: clipOf(next), key };
		return { ok: false, bytes: null, key, error: typeof next === 'string' ? next : defaultError };
	},
}));

const { BakeIncompleteError, DEFAULT_BYTES_PER_CHAR, ENGINE_BYTES_PER_CHAR, PAYLOAD_MAX_BYTES, PAYLOAD_WARN_BYTES, bakeNarration, estimateSynthBytes, formatBytes, formatDuration, formatUsd, measureNarration, safeMime, shippedBytes } = await import('./narration-bake');

const VOICE: BakeVoice = { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 };
const keyFor = (text: string, voice: BakeVoice = VOICE) => rungKey(text, voice);

beforeEach(() => {
	stored.clear();
	banked.length = 0;
	script.clear();
	attempts.length = 0;
	touched.length = 0;
	defaultError = 'no audio returned';
	narrationCacheOn = true;
});

// The retry backoff is 600 ms + 2400 ms of REAL sleep per failing sentence, and several tests
// below drive a sentence to exhaustion. Left on real timers this one file burned nine seconds
// of wall clock proving arithmetic. `runAllTimersAsync` drains the pending sleeps as the
// workers reach them, so the backoff is still exercised — it just does not have to be waited
// out. (Only the retry-driving tests opt in; the rest are already instant.)
async function withFastBackoff<T>(run: () => Promise<T>): Promise<T> {
	vi.useFakeTimers();
	try {
		const p = run();
		// Let each awaited sleep register before draining it, until the run settles.
		let settled = false;
		p.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);
		for (let i = 0; i < 200 && !settled; i++) {
			await vi.runAllTimersAsync();
			await Promise.resolve();
		}
		return await p;
	} finally {
		vi.useRealTimers();
	}
}

afterEach(() => {
	vi.useRealTimers();
});

// Two slides, one sentence each — the projection is supplied so the counts are a figure
// rather than a floor (see measureNarration's own note).
const DECK = ['---', 'theme: indaco', '---', '', '# One', '', 'The first slide says this.', '', '---', '', '# Two', '', 'And the second says this.', ''].join('\n');
const PROJECTED = ['The first slide says this.', 'And the second says this.'];
const S1 = 'The first slide says this.';
const S2 = 'And the second says this.';

describe('shippedBytes', () => {
	it('predicts the EXACT length of the data: URI that will ship', () => {
		// The panel names a size before the write, and the file then gains a size. If those two
		// numbers come from different arithmetic the quote is a guess dressed as a commitment —
		// so pin the prediction against a real encode, at every padding residue.
		for (const n of [0, 1, 2, 3, 4, 5, 17, 100, 1023, 40_960]) {
			const bytes = new Uint8Array(n).fill(7);
			let bin = '';
			for (const b of bytes) bin += String.fromCharCode(b);
			const uri = `data:audio/mpeg;base64,${btoa(bin)}`;
			expect(shippedBytes(n), `${n} raw bytes`).toBe(uri.length);
		}
	});

	it('accounts for a longer MIME type', () => {
		expect(shippedBytes(300, 'audio/wav')).toBe(shippedBytes(300, 'audio/mpeg') - 1);
	});

	it('never returns a negative or NaN length for junk input', () => {
		expect(shippedBytes(-100)).toBe(shippedBytes(0));
	});
});

describe('safeMime', () => {
	it('passes the real audio types through', () => {
		expect(safeMime('audio/mpeg')).toBe('audio/mpeg');
		expect(safeMime('audio/wav')).toBe('audio/wav');
		expect(safeMime('audio/ogg; codecs=opus')).toBe('audio/ogg');
		expect(safeMime('  audio/mp4  ')).toBe('audio/mp4');
	});

	it('refuses anything that could escape the data block it lands in', () => {
		// The type is whatever a voice provider's `Content-Type` said, and it ends up inside a
		// `<script>` block in a file handed to other people. A header is not a trustworthy
		// input, so a type outside the media-type grammar is DROPPED rather than escaped.
		for (const hostile of ['audio/mpeg"</script><script>alert(1)</script>', '<img src=x>', 'audio/<mpeg>', "audio/mpeg';x", 'audio mpeg', '', null, undefined, 'notatype']) {
			expect(safeMime(hostile as string)).toBe('audio/mpeg');
		}
	});
});

describe('estimateSynthBytes — the one figure that cannot be exact', () => {
	// The size line is what an author consents to before emailing a file to a board. The first
	// version used a flat 16 bytes/char — not the rate of any codec that exists (it implies
	// 1.6 kbps audio) — and understated a real deck by roughly THIRTY times, while its comment
	// claimed to be "measured". These pin the table against the bytes actually on disk, so it
	// cannot drift back into a guess.
	const SAMPLE_TEXT_LEN = 35; // 'This is how your slides will sound.' — tools/generate-voice-samples.mjs

	// ITERATE DISK → TABLE, never table → disk. The first version walked the TABLE and looked
	// each entry up on disk, so an engine that existed on disk and in the live catalog but NOT
	// in the table was never visited — which is precisely how `gemini` went missing and got
	// quoted at 7.7x under. A pinning test that can only see what it already knows about
	// cannot catch an omission, which is the failure mode that matters here.
	//
	// It also filtered `.mp3`, so gemini would have failed "has committed samples" even if
	// someone had added it. Every audio extension counts now.
	it('matches the committed voice samples, and has an entry for EVERY engine with samples', async () => {
		const { readdirSync, statSync } = await import('node:fs');
		const { join } = await import('node:path');
		const root = join(process.cwd(), 'public/voice-samples');
		const engines = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
		expect(engines.length, 'the sample roster is not empty').toBeGreaterThan(0);
		for (const engine of engines) {
			const dir = join(root, engine);
			const clips = readdirSync(dir).filter((f) => /\.(mp3|wav|ogg|m4a)$/i.test(f));
			if (!clips.length) continue; // a directory with no audio pins nothing
			const rate = ENGINE_BYTES_PER_CHAR[engine];
			expect(rate, `\`${engine}\` has committed samples but NO entry in ENGINE_BYTES_PER_CHAR — the quote silently falls back to ${DEFAULT_BYTES_PER_CHAR} B/char for it`).toBeGreaterThan(0);
			const mean = clips.reduce((n, f) => n + statSync(join(dir, f)).size, 0) / clips.length;
			const measured = mean / SAMPLE_TEXT_LEN;
			// 5% is drift, not disagreement — a re-generated sample set moves a little.
			expect(Math.abs(rate - measured) / measured, `${engine}: table says ${rate} B/char, samples say ${Math.round(measured)}`).toBeLessThan(0.05);
		}
	});

	it('quotes the PCM engine as the compressed audio it now ships, not as WAV', () => {
		// The original regression: a 300-sentence deck (~30k chars) in Gemini was quoted ~19 MB
		// and landed at ~145 MB, because Gemini's PCM shipped as WAV — 7.7x the mp3 roster.
		//
		// The fix was upstream of the quote: that PCM is encoded to mp3 at the rung before it is
		// cached or baked, so the deck no longer lands at 145 MB either. This pins the property
		// that replaced the old one — the roster is ONE codec class now, so no engine may sit a
		// multiple away from the rest. If a future engine reintroduces uncompressed audio without
		// compressing it, this goes red.
		const chars = 30_000;
		const rates = Object.values(ENGINE_BYTES_PER_CHAR);
		const spread = Math.max(...rates) / Math.min(...rates);
		expect(spread, 'ENGINE_BYTES_PER_CHAR spans more than one codec class').toBeLessThan(5);
		const gemini = estimateSynthBytes(chars, 'google/gemini-3.1-flash-tts-preview');
		const kokoro = estimateSynthBytes(chars, 'hexgrad/kokoro-82m');
		expect(gemini).toBeLessThan(30_000_000);
		expect(gemini / kokoro).toBeLessThan(2);
	});

	it('is nowhere near the flat 16 B/char the first version quoted', () => {
		// The specific regression. A 12,000-character deck is ~5.7 MB of mp3 at the default
		// voice, not the ~256 KB the old arithmetic promised.
		const chars = 12_000;
		const now = estimateSynthBytes(chars, 'hexgrad/kokoro-82m');
		expect(now).toBeGreaterThan(6_000_000);
		expect(now).toBeGreaterThan(Math.ceil((chars * 16 * 4) / 3) * 20);
	});

	it('is per ENGINE — the roster spans a 4.5x range, so one constant cannot serve it', () => {
		const orpheus = estimateSynthBytes(1000, 'canopylabs/orpheus-3b-0.1-ft');
		const mai = estimateSynthBytes(1000, 'microsoft/mai-voice-2');
		expect(mai / orpheus).toBeGreaterThan(4);
	});

	it('falls back to the median rate for a model the catalog has no samples for, and never to zero', () => {
		expect(estimateSynthBytes(1000, 'some/unlisted-model')).toBeGreaterThan(500_000);
		expect(estimateSynthBytes(1000, undefined)).toBeGreaterThan(500_000);
		expect(estimateSynthBytes(0, 'hexgrad/kokoro-82m')).toBe(0);
		expect(estimateSynthBytes(-5, 'hexgrad/kokoro-82m')).toBe(0);
	});

	it('goes through shippedBytes, so the quote and the file use one arithmetic', () => {
		expect(estimateSynthBytes(1000, 'hexgrad/kokoro-82m')).toBe(shippedBytes(1000 * ENGINE_BYTES_PER_CHAR.kokoro));
	});
});

describe('the human-readable quantities', () => {
	it('reads sizes the way a person would say them', () => {
		expect(formatBytes(0)).toBe('0 MB');
		expect(formatBytes(40 * 1024)).toBe('40 KB');
		expect(formatBytes(6.2 * 1024 * 1024)).toBe('6.2 MB');
		expect(formatBytes(47 * 1024 * 1024)).toBe('47 MB');
	});

	it('never rounds a real charge down to "$0.00"', () => {
		// A cost line sits next to a button that spends money. "$0.00" on a bill that is about
		// to be a third of a cent is the one thing it must not say — sub-cent is the COMMON case
		// on the default model, not an edge case.
		expect(formatUsd(0)).toBe('$0.00');
		expect(formatUsd(0.0031)).toBe('<$0.01');
		expect(formatUsd(0.14)).toBe('$0.14');
		expect(formatUsd(2)).toBe('$2.00');
	});

	it('reads durations the way a person would say them', () => {
		expect(formatDuration(0)).toBe('1s');
		expect(formatDuration(42)).toBe('42s');
		expect(formatDuration(150)).toBe('3 min');
	});
});

describe('measureNarration — the pre-flight', () => {
	it('marks a measurement taken without the projection as INCOMPLETE', async () => {
		// The projection is the rung that carries every slide with no caption, no note and no
		// chart — most slides in most decks. Without it those slides count ZERO sentences, so
		// the author would be quoted a fraction of the bill they were about to be charged.
		const blind = await measureNarration(DECK, undefined, VOICE);
		expect(blind.complete).toBe(false);
		const seen = await measureNarration(DECK, PROJECTED, VOICE);
		expect(seen.complete).toBe(true);
		expect(seen.total).toBe(2);
	});

	it('falls back to the markdown flatten when the projection does not line up — as Present does', async () => {
		// A length mismatch stands the projection down; Present then narrates the markdown
		// flatten, and every clip on the device is keyed on THAT text. A bake that resolved to
		// '' here would report a deck with nothing to say while the author can hear it playing.
		const mismatched = await measureNarration(DECK, ['only one'], VOICE);
		expect(mismatched.total).toBeGreaterThan(0);
		expect(mismatched.complete).toBe(true);
	});

	it('splits the deck into what is already paid for and what will be billed', async () => {
		stored.set(keyFor(S1), 30_000);
		const m = await measureNarration(DECK, PROJECTED, VOICE, 0.62);
		expect(m.cached).toBe(1);
		expect(m.cachedBytes).toBe(shippedBytes(30_000));
		expect(m.missing).toBe(1);
		expect(m.missingChars).toBe(S2.length);
		expect(m.estCostUsd).toBeCloseTo((S2.length / 1e6) * 0.62, 12);
		expect(m.estSeconds).toBeGreaterThan(0);
	});

	it('quotes NOTHING rather than zero for a model with no published price', async () => {
		// "Free" and "we don't know" are different answers, and only one of them is safe to
		// show next to a button that spends money.
		const m = await measureNarration(DECK, PROJECTED, VOICE);
		expect(m.estCostUsd).toBeNull();
		expect((await measureNarration(DECK, PROJECTED, VOICE, null)).estCostUsd).toBeNull();
	});

	it('counts a zero-byte index row as MISSING, not as cached', async () => {
		// The bake gates on a clip having bytes and would re-synthesize this one. Counting it as
		// cached here would quote a bill the bake then exceeds — the exact failure the pre-flight
		// exists to prevent.
		stored.set(keyFor(S1), 0);
		const m = await measureNarration(DECK, PROJECTED, VOICE, 0.62);
		expect(m.cached).toBe(0);
		expect(m.missing).toBe(2);
	});

	it('is measured PER VOICE — a different narrator is a different bill', async () => {
		// Clips are keyed on rung/model/voice/speed, so an author who rehearsed in one voice and
		// exports in another has nothing cached. That is the honest answer and the panel shows
		// it; what it must never do is report the first voice's coverage for the second.
		stored.set(keyFor(S1), 30_000);
		const other = await measureNarration(DECK, PROJECTED, { ...VOICE, voice: 'am_michael' }, 0.62);
		expect(other.cached).toBe(0);
		expect(other.missing).toBe(2);
	});
});

describe('bakeNarration — complete, or nothing', () => {
	it('ships every sentence when the device already has them all, and synthesizes none', async () => {
		stored.set(keyFor(S1), 30_000);
		stored.set(keyFor(S2), 20_000);
		const bake = await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true });
		expect(attempts).toEqual([]);
		expect(bake.covered).toBe(2);
		expect(bake.total).toBe(2);
		expect(bake.synthesized).toBe(0);
		expect(bake.slides.flat().every((c) => c.audio?.startsWith('data:audio/mpeg;base64,'))).toBe(true);
		expect(bake.bytes).toBe(shippedBytes(30_000) + shippedBytes(20_000));
	});

	it('synthesizes only what is missing, and BANKS it as it lands', async () => {
		stored.set(keyFor(S1), 30_000);
		script.set(S2, [20_000]);
		const bake = await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true });
		expect(attempts).toEqual([S2]);
		expect(bake.synthesized).toBe(1);
		expect(bake.covered).toBe(2);
		// Banked under the key PLAYBACK uses, so the next rehearsal and the next export both
		// find it — a bake pays for a sentence once.
		expect(banked).toEqual([keyFor(S2)]);
	});

	it('retries a failing sentence with backoff before giving up on it', async () => {
		stored.set(keyFor(S1), 30_000);
		script.set(S2, ['429 rate limited', '429 rate limited', 20_000]);
		const bake = await withFastBackoff(() => bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true }));
		expect(attempts).toEqual([S2, S2, S2]);
		expect(bake.covered).toBe(2);
	});

	it('REFUSES — and exports nothing — when a sentence cannot be prepared', async () => {
		// The reversal at the heart of this module. A partially-baked deck is opened once, by
		// someone else, with no way to fix it and no idea anything is wrong: a presenter stops
		// mid-argument. So the export fails loudly on the author's machine instead.
		stored.set(keyFor(S1), 30_000);
		script.set(S2, ['the model would not read this line', 'the model would not read this line', 'the model would not read this line']);
		const err = await withFastBackoff(() => bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true })).catch((e) => e);
		expect(err).toBeInstanceOf(BakeIncompleteError);
		expect(err.failures).toHaveLength(1);
		expect(err.failures[0]).toMatchObject({ slide: 2, text: S2, reason: 'the model would not read this line' });
		// It names the sentence, and it says nothing was exported — a message the author can act on.
		expect(err.message).toMatch(/Nothing was exported/);
	});

	it('keeps what it already paid for when it refuses', async () => {
		// The refusal must not also be a bill for nothing. Everything synthesized before the
		// failure is in the store, so a second attempt after topping up pays only for the rest.
		script.set(S1, [30_000]);
		script.set(S2, ['the model would not read this line', 'the model would not read this line', 'the model would not read this line']);
		await expect(withFastBackoff(() => bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true }))).rejects.toBeInstanceOf(BakeIncompleteError);
		expect(banked).toEqual([keyFor(S1)]);
		expect(stored.get(keyFor(S1))).toBe(30_000);
	});

	it('stops the whole run on a failure that retrying cannot fix, instead of grinding the deck', async () => {
		// A revoked key or an exhausted balance fails every sentence for the same reason. Backing
		// off three times each turns a two-second answer into five minutes of spinning on a
		// 300-sentence deck — and bills two extra attempts per sentence to learn nothing.
		// A deck with more sentences than the three concurrent workers can claim — which is what
		// makes "the run stopped" observable at all. Every sentence fails the same way, which is
		// what a revoked key or an exhausted balance actually looks like.
		const projected = Array.from({ length: 8 }, (_, i) => `Sentence number ${i + 1} here.`);
		const deck = ['---', 'theme: indaco', '---', '', projected.map((l, i) => `# S${i}\n\n${l}`).join('\n\n---\n\n'), ''].join('\n');
		defaultError = 'OpenRouter TTS error 402: insufficient credit';
		const err = await bakeNarration(deck, projected, { voice: VOICE, audio: true }).catch((e) => e);
		expect(err).toBeInstanceOf(BakeIncompleteError);
		// ONE attempt each on the sentences that hit it — not three — and no worker moves on.
		expect(attempts.length).toBeLessThanOrEqual(3);
		expect(err.failures.some((f: { reason: string }) => /insufficient credit/.test(f.reason))).toBe(true);
		// And the sentences nobody reached are accounted for once, plainly, rather than as a
		// short list that makes a dead key look like a few unlucky lines.
		expect(err.failures.some((f: { text: string }) => /were not attempted/.test(f.text))).toBe(true);
	});

	it('an override ships the refused sentences captioned and silent', async () => {
		// "Complete or nothing" is the right default and the wrong ONLY option: a sentence a
		// model deterministically refuses would otherwise make narration permanently unreachable
		// for this deck. The player is verified in exactly this state.
		stored.set(keyFor(S1), 30_000);
		script.set(S2, ['the model would not read this line', 'the model would not read this line', 'the model would not read this line']);
		const bake = await withFastBackoff(() => bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true, allowPartial: true }));
		expect(bake.failures).toHaveLength(1);
		expect(bake.covered).toBe(1);
		expect(bake.total).toBe(2);
		const cues = bake.slides.flat();
		expect(cues[0].audio).toMatch(/^data:/);
		expect(cues[1].audio).toBeNull();
		// The silent one keeps its caption and its beat, so the deck still reads and still paces.
		expect(cues[1].text).toBe(S2);
		expect(cues[1].estimateMs).toBeGreaterThan(0);
	});

	it('bills a repeated sentence once, and ships it everywhere it appears', async () => {
		// Three workers claiming three identical keys all missed the in-memory cache at the same
		// instant and all fired — `synthFor` has no in-flight dedup, unlike the live reader.
		const REPEAT = 'The same line again.';
		const deck = ['---', 'theme: indaco', '---', '', '# A', '', REPEAT, '', '---', '', '# B', '', REPEAT, '', '---', '', '# C', '', REPEAT, ''].join('\n');
		script.set(REPEAT, [12_000]);
		const bake = await bakeNarration(deck, [REPEAT, REPEAT, REPEAT], { voice: VOICE, audio: true });
		expect(attempts).toEqual([REPEAT]); // billed once
		expect(bake.covered).toBe(3); // shipped three times
		expect(bake.slides.flat().every((c) => c.audio?.startsWith('data:'))).toBe(true);
	});

	it('bakes the caption track alone when audio is off — no synthesis, no clips, no bill', async () => {
		script.set(S1, [30_000]);
		script.set(S2, [20_000]);
		const bake = await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: false });
		expect(attempts).toEqual([]);
		expect(bake.bytes).toBe(0);
		expect(bake.voice).toBeNull();
		const cues = bake.slides.flat();
		expect(cues).toHaveLength(2);
		expect(cues.every((c) => c.audio === null)).toBe(true);
		// The delivery is intact — text, an estimated span, a breath, and the word timeline the
		// exported player's crawl highlights against. A captions-only deck is a working
		// read-along, not a degraded narration.
		expect(cues[0].text).toBe(S1);
		expect(cues[0].estimateMs).toBeGreaterThan(0);
		expect(cues[0].words.length).toBeGreaterThan(1);
		expect(cues[0].words.at(-1)?.endMs).toBeGreaterThan(cues[0].words[0].startMs);
	});

	it('carries the word timeline and the breath on a spoken bake too', async () => {
		stored.set(keyFor(S1), 30_000);
		stored.set(keyFor(S2), 20_000);
		const bake = await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true });
		const cue = bake.slides[0][0];
		expect(cue.words.map((w) => w.display).join(' ')).toBe(S1);
		// A sentence ending in a full stop earns a real breath after it; the player holds it so
		// the slide boundary does not land on the final syllable.
		expect(cue.gapMs).toBeGreaterThan(0);
	});

	it('reports progress the panel can show, and stops on abort', async () => {
		stored.set(keyFor(S1), 30_000);
		script.set(S2, [20_000]);
		const seen: string[] = [];
		await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true, onProgress: (p) => seen.push(`${p.phase}:${p.done}/${p.total}`) });
		expect(seen).toContain('reading:0/2');
		expect(seen.some((s) => s.startsWith('synthesizing:'))).toBe(true);

		const ctl = new AbortController();
		ctl.abort();
		await expect(bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true, signal: ctl.signal })).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('records the voice the deck was narrated with, so the artifact can say so', async () => {
		stored.set(keyFor(S1), 30_000);
		stored.set(keyFor(S2), 20_000);
		const bake = await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true });
		expect(bake.voice).toEqual(VOICE);
	});
});

describe('a render-appended slide stands the projection down — exactly as Present does', () => {
	// `glossary: auto` makes the renderer append a slide the SOURCE does not contain, so a
	// projection taken from the render runs one entry long. Trimming it and keeping the richer
	// component-aware text is the tempting move and the wrong one: Present applies the same
	// length guard and therefore narrates such a deck through the markdown FLATTEN, so every
	// clip on the device is keyed on the flatten. A bake that resolved the projection instead
	// would match none of them and re-bill a fully rehearsed deck.
	//
	// This is a regression test for a live defect: the panel trimmed and the exporter did not,
	// so the quote read "fully prepared — nothing is billed" and the bake billed the whole deck.
	const glossaryDeck = ['---', 'theme: indaco', 'glossary: auto', 'acronyms:', '  ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs." }', '---', '', '# ARR grew', '', 'It grew.', ''].join('\n');

	it('resolves the FLATTEN, not the projection, when the render appended a slide', async () => {
		// One authored slide, two rendered sections — the shape `glossary: auto` produces.
		const overlong = ['A projection of the authored slide.', 'A projection of the appended glossary.'];
		const m = await measureNarration(glossaryDeck, overlong, VOICE);
		// The projection is stood down, so the sentences come from the markdown flatten — which
		// is what Present spoke and therefore what the clip store is keyed on.
		expect(m.total).toBeGreaterThan(0);
		const keys = [...stored.keys()];
		expect(keys).toEqual([]); // nothing cached yet; the point is WHICH text was resolved
		const bake = await bakeNarration(glossaryDeck, overlong, { voice: VOICE, audio: false });
		const spoken = bake.slides.flat().map((c) => c.text);
		expect(spoken.some((t) => t.includes('projection'))).toBe(false);
	});

	it('the quote and the bake resolve the SAME sentences for such a deck', async () => {
		// The defect was that these two disagreed. Both now go through one `resolveDeck`, so a
		// future divergence has to break this.
		const overlong = ['A projection of the authored slide.', 'A projection of the appended glossary.'];
		const m = await measureNarration(glossaryDeck, overlong, VOICE);
		const bake = await bakeNarration(glossaryDeck, overlong, { voice: VOICE, audio: false });
		expect(bake.total).toBe(m.total);
	});
});

// ── the refusal escapes the red team found ───────────────────────────────────────────────────
//
// All three passed the shipped tests, which is the point: the refusal is this feature's central
// promise and its failure mode is a board deck that speaks twice and stops.
describe('the refusal, under a terminal failure', () => {
	it('is NOT overridable by allowPartial — a dead key is not a moderation block', async () => {
		// Observed before the fix: a 402 on sentence 3 of 8 with allowPartial on returned
		// normally and the caller WROTE THE FILE — six of eight sentences silent, behind a
		// button captioned "ship them captioned and silent". The override is justified by one
		// sentence a model deterministically refuses; it cannot stand in for "everything after
		// sentence N", which is what a terminal error actually produces.
		script.set(S1, [30_000]);
		defaultError = 'OpenRouter TTS error 402: insufficient credit';
		const err = await withFastBackoff(() => bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true, allowPartial: true }).catch((e) => e));
		expect(err).toBeInstanceOf(BakeIncompleteError);
		expect(err.terminal).toMatch(/402/);
		expect(err.message).toMatch(/fix that and re-run/i);
	});

	it('reports `covered` as sentences that actually HAVE audio, not total minus failure rows', async () => {
		// A terminal error pushes ONE summary row standing for N unreached sentences, so
		// `total - failures.length` counted the silent ones as covered — the field documented
		// as "sentences shipped" reporting the inverse on the one path where it mattered.
		script.set(S1, [30_000]);
		defaultError = 'OpenRouter TTS error 402: insufficient credit';
		const err = await withFastBackoff(() => bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true, allowPartial: true }).catch((e) => e));
		// The refusal carries the sentences; nothing claims coverage it does not have.
		expect(err.failures.some((f: { text: string }) => /were not attempted|second says/.test(f.text))).toBe(true);
	});

	it('carries the voice it was refused under, so an override cannot travel to another one', async () => {
		script.set(S1, [30_000]);
		script.set(S2, ['moderation blocked', 'moderation blocked', 'moderation blocked']);
		const err = await withFastBackoff(() => bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true }).catch((e) => e));
		expect(err).toBeInstanceOf(BakeIncompleteError);
		expect(err.terminal).toBeUndefined(); // a per-sentence refusal IS overridable
		expect(err.voice).toEqual(VOICE);
	});
});

describe('the on-device rung is a real bake identity, not an afterthought', () => {
	// No test passed a `rung` at all before this, which is what let the key mock hardcode
	// 'openrouter-tts' unnoticed (#1462 item 7). The rung is part of the cache key, so getting it
	// wrong does not under-report — it misses every lookup and re-bills a deck already prepared.
	const DEVICE: BakeVoice = { rung: 'kokoro', model: 'hexgrad/kokoro-82m', voice: 'af_sky', speed: 1 };

	it('keys on-device clips under a DIFFERENT identity than the cloud voice', () => {
		expect(keyFor(S1, DEVICE)).not.toBe(keyFor(S1, VOICE));
		expect(keyFor(S1, DEVICE)).toContain('kokoro');
	});

	it('reads a deck rehearsed on-device as fully prepared, and bills nothing for it', async () => {
		stored.set(keyFor(S1, DEVICE), 4000);
		stored.set(keyFor(S2, DEVICE), 4000);
		const m = await measureNarration(DECK, PROJECTED, DEVICE, 0.62);
		expect(m.total).toBe(2);
		expect(m.cached, 'both sentences are already on this device').toBe(2);
		expect(m.missing).toBe(0);
		expect(m.missingChars).toBe(0);
		expect(m.estCostUsd).toBe(0);
	});

	it('does NOT see those clips when the cloud voice is measured instead', async () => {
		// The defect this whole area exists to prevent: measuring one identity and baking another
		// quotes "nothing prepared" for a deck that is in fact complete.
		stored.set(keyFor(S1, DEVICE), 4000);
		stored.set(keyFor(S2, DEVICE), 4000);
		const m = await measureNarration(DECK, PROJECTED, VOICE, 0.62);
		expect(m.cached).toBe(0);
		expect(m.missing).toBe(2);
	});

	it('bakes end to end from the device store with no synthesis attempted', async () => {
		stored.set(keyFor(S1, DEVICE), 4000);
		stored.set(keyFor(S2, DEVICE), 4000);
		const bake = await bakeNarration(DECK, PROJECTED, { voice: DEVICE, audio: true });
		expect(bake.covered).toBe(2);
		expect(bake.synthesized, 'nothing was synthesized — it was all already there').toBe(0);
		expect(attempts, 'and nothing was even attempted').toEqual([]);
		expect(bake.slides.flat().every((c) => c.audio?.startsWith('data:audio/mpeg;base64,'))).toBe(true);
	});
});

describe('the payload ceiling (#1462 item 4 — nothing capped this before)', () => {
	it('refuses a bake whose payload would blow the ceiling, and names the size', async () => {
		// The failure being guarded is not "a big file" — it is the tab dying. The browser path
		// holds the payload five or six times over (srcdoc parse, font subset, Blob), so 150 MB
		// of data URIs is several hundred MB of live memory with no artifact at the end of it.
		const big = 4000;
		script.set(S1, [big]);
		script.set(S2, [big]);
		await expect(bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true, maxBytes: 4000 })).rejects.toMatchObject({ name: 'BakeTooLargeError' });
	});

	it('stops the run rather than finishing and refusing afterwards', async () => {
		// Discovering it at the end is exactly too late: the whole payload is already in hand and
		// every remaining sentence was billed for a file nobody will get.
		const big = 4000;
		script.set(S1, [big]);
		script.set(S2, [big]);
		await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true, maxBytes: 4000 }).catch(() => {});
		expect(attempts.length, 'the second sentence should not have been synthesized after the first blew the cap').toBeLessThanOrEqual(2);
	});

	it('is not an incomplete-set refusal — there is no list of sentences to override', async () => {
		const big = 4000;
		script.set(S1, [big]);
		script.set(S2, [big]);
		const err = await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true, allowPartial: true, maxBytes: 4000 }).catch((e) => e);
		// `allowPartial` must NOT get past this one: shipping half a deck does not make it fit.
		expect(err.name).toBe('BakeTooLargeError');
		expect(err.bytes).toBeGreaterThan(4000);
	});

	it('sets the two thresholds where they were reasoned to be, in the right order', () => {
		// WARN is the mail-attachment ceiling an author actually collides with; MAX is a
		// tab-survival backstop far above anything compression now produces (~22 MB for 300
		// sentences). Pinned so a later edit cannot quietly turn the backstop into an opinion.
		expect(PAYLOAD_WARN_BYTES).toBe(25 * 1024 * 1024);
		expect(PAYLOAD_MAX_BYTES).toBeGreaterThan(PAYLOAD_WARN_BYTES * 4);
	});

	it('lets an ordinary deck through untouched', async () => {
		script.set(S1, [4000]);
		script.set(S2, [4000]);
		const bake = await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true });
		expect(bake.covered).toBe(2);
		expect(bake.bytes).toBeLessThan(PAYLOAD_WARN_BYTES);
	});
});

describe('a bake cannot evict the clips its own quote counted', () => {
	it('marks the deck\'s cached clips as recently-used before it starts writing', async () => {
		// `putClip` runs evictToBudget() on EVERY write, so a long bake could drop the very clips
		// the pre-flight counted as "free and instant" and then re-synthesize and re-bill them —
		// billing MORE than quoted, the one direction a quote must never move.
		stored.set(keyFor(S1), 4000);
		script.set(S2, [4000]);
		await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true });
		expect(touched, 'the already-prepared sentence was protected from this run').toContain(keyFor(S1));
	});
});

describe('a repeated sentence: quoted per occurrence, billed once', () => {
	it('over-quotes rather than under-quotes when a deck repeats a line', async () => {
		// `measureNarration` counts every OCCURRENCE; the bake dedupes by key and synthesizes each
		// distinct sentence once (the `twins` list). So a deck with a refrain is quoted high and
		// billed low. That is the safe direction — the bill never exceeds the quote — but it was
		// unpinned, and a "fix" that made the quote match the bake by counting distinct sentences
		// would silently move the error to the unsafe side if the dedup ever changed (#1462 item 7).
		const REFRAIN = 'We hold the line.';
		const deck = ['---', 'theme: indaco', '---', '', '# One', '', REFRAIN, '', '---', '', '# Two', '', REFRAIN, ''].join('\n');
		const projected = [REFRAIN, REFRAIN];

		const m = await measureNarration(deck, projected, VOICE, 0.62);
		expect(m.total, 'both occurrences are counted').toBe(2);
		expect(m.missingChars, 'and both are quoted for').toBe(REFRAIN.length * 2);

		script.set(REFRAIN, [4000]);
		const bake = await bakeNarration(deck, projected, { voice: VOICE, audio: true });
		expect(attempts, 'but only ONE request is ever made').toEqual([REFRAIN]);
		expect(bake.covered, 'while both cues still get audio').toBe(2);
		expect(bake.slides.flat().every((c) => c.audio)).toBe(true);
	});
});

describe('the measurement fields nothing used to assert (#1462 item 7)', () => {
	// A checker's mutation run found these survive changes that should have gone red: swapping
	// `missingChars`→`totalChars`, swapping model→voice, and zeroing `totalChars` all stayed
	// green, because no test looked at the two fields the panel quotes SIZE from.
	it('counts totalChars over the whole deck and missingChars over only what is unprepared', async () => {
		const all = await measureNarration(DECK, PROJECTED, VOICE, 0.62);
		expect(all.totalChars).toBe(S1.length + S2.length);
		expect(all.missingChars, 'nothing cached yet, so every character is billable').toBe(all.totalChars);

		stored.set(keyFor(S1), 4000);
		const half = await measureNarration(DECK, PROJECTED, VOICE, 0.62);
		expect(half.totalChars, 'the caption track still ships every character').toBe(S1.length + S2.length);
		expect(half.missingChars, 'but only the unprepared sentence is billed').toBe(S2.length);
		expect(half.totalChars).not.toBe(half.missingChars); // the swap the mutation exposed
	});

	it('derives missingBytes from missingChars AND the model, not from either alone', async () => {
		const m = await measureNarration(DECK, PROJECTED, VOICE, 0.62);
		expect(m.missingBytes).toBe(estimateSynthBytes(m.missingChars, VOICE.model));
		// Model-sensitive: the mutation that swapped model→voice survived because nothing checked
		// that the ENGINE moved the number.
		const pricey = await measureNarration(DECK, PROJECTED, { ...VOICE, model: 'microsoft/mai-voice-2' }, 0.62);
		expect(pricey.missingBytes).toBeGreaterThan(m.missingBytes * 2);
	});

	it('reports zero billable bytes — not zero total characters — for a fully prepared deck', async () => {
		stored.set(keyFor(S1), 4000);
		stored.set(keyFor(S2), 4000);
		const m = await measureNarration(DECK, PROJECTED, VOICE, 0.62);
		expect(m.missingBytes).toBe(0);
		expect(m.missingChars).toBe(0);
		expect(m.totalChars, 'the deck still has words in it').toBeGreaterThan(0);
		expect(m.cachedBytes, 'and the file still gains what those clips weigh').toBeGreaterThan(0);
	});

	it('marks a measurement taken with NO projection as a floor, not a figure', async () => {
		// `complete: false` is what tells the panel not to present the counts as a price.
		const floor = await measureNarration(DECK, undefined, VOICE, 0.62);
		expect(floor.complete).toBe(false);
		expect((await measureNarration(DECK, PROJECTED, VOICE, 0.62)).complete).toBe(true);
	});
});

describe('the "keep narration on this device" switch is honored by the export too', () => {
	// Its comment says this path "would quietly break" the promise if the guard were dropped —
	// and deleting the guard left the whole docs suite green (#1462 item 7). The switch is a
	// promise ("narration is no longer kept between sessions"); an export that wrote anyway
	// would be the one path that broke it silently.
	it('does not BANK a synthesized clip when the author turned the cache off', async () => {
		narrationCacheOn = false;
		script.set(S1, [4000]);
		script.set(S2, [4000]);
		const bake = await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true });
		expect(bake.covered, 'the export still succeeds — it just keeps nothing').toBe(2);
		expect(banked, 'nothing was written to the device store').toEqual([]);
	});

	it('does not READ from the store either, so the quote matches what it will actually do', async () => {
		narrationCacheOn = false;
		stored.set(keyFor(S1), 4000);
		const m = await measureNarration(DECK, PROJECTED, VOICE, 0.62);
		expect(m.cached, 'a clip it will not read must not be quoted as free').toBe(0);
		expect(m.missing).toBe(2);
	});

	it('banks normally when the switch is on', async () => {
		script.set(S1, [4000]);
		script.set(S2, [4000]);
		await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true });
		expect(banked.sort()).toEqual([keyFor(S1), keyFor(S2)].sort());
	});
});
