import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const clipOf = (size: number, type = 'audio/mpeg') => ({ size, type, arrayBuffer: async () => new ArrayBuffer(size) });

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
}));

vi.mock('./read-aloud', async (importOriginal) => ({
	...(await importOriginal<typeof import('./read-aloud')>()),
	// The key builder, standing in for voice-model's — same content-complete JSON shape, so a
	// test that reconstructs a key by hand fails here exactly as it would in the browser.
	bakeClipKeys: async (perSlide: string[][], voice: BakeVoice) => perSlide.map((row) => row.map((text) => JSON.stringify(['openrouter-tts', voice.model, voice.voice, voice.speed, text]))),
	synthBakeClip: async (text: string, voice: BakeVoice) => {
		attempts.push(text);
		const key = JSON.stringify(['openrouter-tts', voice.model, voice.voice, voice.speed, text]);
		const next = script.get(text)?.shift();
		if (typeof next === 'number') return { ok: true, bytes: clipOf(next), key };
		return { ok: false, bytes: null, key, error: typeof next === 'string' ? next : 'no audio returned' };
	},
}));

const { BakeIncompleteError, appendedSlideCount, bakeNarration, formatBytes, formatDuration, formatUsd, measureNarration, safeMime, shippedBytes, trimAppendedSlides } = await import('./narration-bake');

const VOICE: BakeVoice = { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 };
const keyFor = (text: string, voice: BakeVoice = VOICE) => JSON.stringify(['openrouter-tts', voice.model, voice.voice, voice.speed, text]);

beforeEach(() => {
	stored.clear();
	banked.length = 0;
	script.clear();
	attempts.length = 0;
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
		const bake = await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true });
		expect(attempts).toEqual([S2, S2, S2]);
		expect(bake.covered).toBe(2);
	});

	it('REFUSES — and exports nothing — when a sentence cannot be prepared', async () => {
		// The reversal at the heart of this module. A partially-baked deck is opened once, by
		// someone else, with no way to fix it and no idea anything is wrong: a presenter stops
		// mid-argument. So the export fails loudly on the author's machine instead.
		stored.set(keyFor(S1), 30_000);
		script.set(S2, ['insufficient credit', 'insufficient credit', 'insufficient credit']);
		const err = await bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true }).catch((e) => e);
		expect(err).toBeInstanceOf(BakeIncompleteError);
		expect(err.failures).toHaveLength(1);
		expect(err.failures[0]).toMatchObject({ slide: 2, text: S2, reason: 'insufficient credit' });
		// It names the sentence, and it says nothing was exported — a message the author can act on.
		expect(err.message).toMatch(/Nothing was exported/);
	});

	it('keeps what it already paid for when it refuses', async () => {
		// The refusal must not also be a bill for nothing. Everything synthesized before the
		// failure is in the store, so a second attempt after topping up pays only for the rest.
		script.set(S1, [30_000]);
		script.set(S2, ['insufficient credit', 'insufficient credit', 'insufficient credit']);
		await expect(bakeNarration(DECK, PROJECTED, { voice: VOICE, audio: true })).rejects.toBeInstanceOf(BakeIncompleteError);
		expect(banked).toEqual([keyFor(S1)]);
		expect(stored.get(keyFor(S1))).toBe(30_000);
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

describe('render-appended slides', () => {
	// `glossary: auto` makes the docs renderer append a slide the SOURCE does not contain, so
	// the projection runs one entry longer than the deck. Unreconciled, that one-slide skew
	// stood the WHOLE projection down: every `glossary: auto` deck was locked out of narration
	// with a message blaming the deck, and the chart-parity substitution went inert on the same
	// decks. The append is deterministic and TRAILING, which is what makes trimming it safe.
	const glossaryDeck = ['---', 'theme: indaco', 'glossary: auto', 'acronyms:', '  ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs." }', '---', '', '# ARR grew', '', 'It grew.', ''].join('\n');
	const plainDeck = ['---', 'theme: indaco', '---', '', '# One', '', 'Body.', ''].join('\n');

	it('counts the slide `glossary: auto` appends, and only that', () => {
		expect(appendedSlideCount(glossaryDeck)).toBe(1);
		expect(appendedSlideCount(plainDeck)).toBe(0);
		expect(appendedSlideCount('')).toBe(0);
	});

	it('trims the trailing projection entry so the rest stays index-aligned', () => {
		expect(trimAppendedSlides(glossaryDeck, ['authored', 'the glossary'])).toEqual(['authored']);
		expect(trimAppendedSlides(plainDeck, ['authored'])).toEqual(['authored']);
	});

	it('never trims away the whole projection', () => {
		// A one-entry projection on a glossary deck is already degenerate; trimming it to nothing
		// would turn a recoverable skew into a silent no-narration export.
		expect(trimAppendedSlides(glossaryDeck, ['only'])).toEqual(['only']);
	});
});
