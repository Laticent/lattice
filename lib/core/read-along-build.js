/**
 * Read-along PRODUCER — turn a deck's per-slide narration into a `readAlong` section
 * (2026-07-08-read-along-export-manifest.md). This is the ONE producer feeding the
 * export manifest field (lib/core/lattice-doc.js) and the .vtt derivers
 * (lib/core/read-along-vtt.js).
 *
 * It builds the ESTIMATE track per slide (Cadenza's deterministic baseline) — no
 * audio, no key, no async. That's the `regenerate`-mode default: captions are exact
 * enough offline and the .vtt is directly derivable, without the player re-deriving
 * from source. (A future PRE-RENDER path would synthesize + measure real tracks and
 * embed audio.)
 *
 * Root CJS, so both the CLI/export pipeline AND the docs site consume it — the
 * Cadenza engine it needs is the built workspace package (`@laticent/cadenza`),
 * reachable from Node since the library-shape build (2026-07-08-library-shape-cadenza-vetrina.md).
 *
 * @typedef {object} ReadAlongVoice
 * @property {string} model  TTS model slug the author chose (e.g. "hexgrad/kokoro-82m").
 * @property {string} voice  Voice id (model-specific, e.g. "af_heart").
 * @property {number} speed  Pace multiplier passed to the voice (1 = natural).
 *
 * @typedef {object} ReadAlongSlide
 * @property {number} index  Slide index this narration belongs to.
 * @property {import('@laticent/cadenza').CaptionTrack} track  The estimate CaptionTrack.
 *
 * @typedef {object} ReadAlong
 * @property {string} version
 * @property {'regenerate'|'embedded'} audioMode
 * @property {ReadAlongVoice} voice
 * @property {import('@laticent/cadenza').Pace} pace
 * @property {ReadAlongSlide[]} slides
 *
 * @typedef {object} BuildReadAlongOptions
 * @property {ReadAlongVoice} voice
 * @property {import('@laticent/cadenza').Pace} [pace]
 * @property {'regenerate'|'embedded'} [audioMode]
 * @property {ReadonlyMap<string,string>} [acronyms] deck registry (term → spoken expansion); author wins
 * @property {ReadonlyMap<string,string>} [lexicon] deck lexicon (`lexicon:`); author beats the built-in commons
 * @property {string} [lang] deck language tag (Marp `lang:`); a non-English deck bypasses the
 *   English lexicon + number/period expansion so narration isn't anglicized (#919)
 * @property {readonly (readonly {start:number,end:number,weight:number}[] | undefined)[]} [emphasis]
 *   per-slide emphasis spans, PARALLEL to `slideTexts` — char offsets into `slideTexts[i]` marking
 *   what the author flagged as important, so a cue carrying an emphasized phrase holds a beat after
 *   it (Cadenza's emphasis tier). Omit, or leave an entry undefined, for uniform pacing. The caller
 *   owns the correctness of the offsets: a slide whose narration was replaced after projection must
 *   pass `undefined` rather than stale spans.
 */

const { buildTrack } = require('@laticent/cadenza');

/**
 * Per-slide emphasis, kept ONLY where the resolved narration is still the string the spans were
 * measured against. THE ONE PLACE THIS RULE LIVES — four producers need it (the CLI captions
 * sidecar, the Studio's caption download, the narration bake, and Present), and the first pass
 * wrote it out four times. Three were right and one was not, which is exactly the shape HARD
 * RULE #1 exists to prevent.
 *
 * `projectedBefore` MUST be the projection as it stood BEFORE any substitution rung ran. The
 * emulator mutates its projection array in place when `narrateChart` fires (`projected[i] = chart`),
 * so a guard reading that array after the fact compares the chart narration against itself, passes
 * on exactly the slides it exists to reject, and hands char offsets measured against the figure
 * projection to a different string. Measured when that shipped: 83 stale spans over 77 slides in 15
 * committed decks. Pass a snapshot (`projected.slice()`), or an array a substitution returned a COPY
 * into — never the live one.
 *
 * @param {readonly string[]} slideTexts  the RESOLVED narration, one per slide
 * @param {readonly string[]} projectedBefore  the pre-substitution projection, index-aligned
 * @param {readonly (readonly {start:number,end:number,weight:number}[] | undefined)[]} spans
 * @returns {(readonly {start:number,end:number,weight:number}[] | undefined)[]}
 */
function emphasisForResolved(slideTexts, projectedBefore, spans) {
	const texts = slideTexts || [];
	const before = projectedBefore || [];
	const all = spans || [];
	return Array.from(texts, (t, i) => (t === before[i] ? all[i] : undefined));
}

/**
 * Assemble a `readAlong` section from per-slide narration text. `slideTexts[i]` is
 * slide i's readable narration; an empty/blank entry means "no narration" and is
 * skipped (the slides list is SPARSE, keyed by original index). Pure + deterministic.
 *
 * @param {readonly string[]} slideTexts
 * @param {BuildReadAlongOptions} opts
 * @returns {ReadAlong}
 */
function buildReadAlong(slideTexts, opts) {
	const pace = opts.pace ?? 'moderate';
	const acronyms = opts.acronyms; // deck registry (term → spoken expansion); author wins
	const lexicon = opts.lexicon; // deck lexicon (`lexicon:`); author beats the built-in commons
	const lang = opts.lang; // deck language (Marp `lang:`); non-English bypasses English say-as (#919)
	const slides = [];
	for (let index = 0; index < slideTexts.length; index++) {
		const text = String(slideTexts[index] ?? '').trim();
		if (!text) continue; // sparse — only narrated slides
		const emphasis = opts.emphasis?.[index];
		slides.push({ index, track: buildTrack(text, { pace, acronyms, emphasis, lang, lexicon }) });
	}
	return {
		version: '1.0',
		audioMode: opts.audioMode ?? 'regenerate',
		voice: opts.voice,
		pace,
		slides,
	};
}

/**
 * Merge the narration sources into the per-slide text the export narrates
 * (2026-07-11-manifest-speech-contract §6 Phase 2 + §16 Layer 1). The precedence,
 * highest first, is:
 *
 *   1. a slide's inline `<!-- caption: … -->` (opts.captions[i]) — the author's exact read-as text;
 *   2. a front-matter `captions:` entry for this slide (opts.fmCaptions.get(i+1), 1-based number);
 *   3. the component-aware DOM speech projection — but ONLY when it aligns 1:1 with the authored
 *      slides. A mismatched length (an autosplit deck renders more sections than authored slides)
 *      means the index mapping is unsafe, so projection is dropped wholesale rather than risk a
 *      caption bound to the wrong slide.
 *
 * THE SPEAKER NOTE IS NOT A RUNG, and used to be — it sat above the projection, so any slide
 * carrying a note narrated the note instead of its own content. That collapsed two channels the
 * rest of the system keeps apart on purpose: `design/skills/speaker-notes.md` opens by requiring
 * "each in its own register, none bleeding into the others" and that "a caption must never carry
 * a private remark", then two sections later documented the note BECOMING the caption. The CLI
 * had to carry the consequence in its own `--strip-captions` help ("a slide that had BOTH a
 * caption and a note will now narrate the NOTE — add --strip-notes too if the note is also
 * private"): stripping the PUBLIC channel for privacy handed you the PRIVATE one.
 *
 * So the model is now exactly two things. A caption is GENERATED from the slide's own content;
 * an author may OVERRIDE it, and an override replaces the whole slide's narration rather than
 * merging into it. A note is for the author alone — it travels in the deck as an HTML comment
 * and reaches the presenter's own surface, and nothing else.
 *
 * Pure — the caller owns logging. Note that with no caption and no usable projection a slide is
 * SILENT, which is the honest answer for a slide with nothing to say: it is not a reason to
 * reach for the note.
 *
 * @param {number} slideCount                         how many authored slides to answer for.
 *        Deliberately a COUNT and not the notes array it used to be: with the note rung gone the
 *        notes are not an input to this decision at all, and a parameter holding them would be a
 *        standing invitation to consult them again.
 * @param {readonly string[]} projected               per rendered section, or []
 * @param {{captions?: readonly (string|null|undefined)[], fmCaptions?: ReadonlyMap<number,string>}} [opts]
 *        captions = per-slide inline `caption:` (index-aligned with the slides);
 *        fmCaptions = front-matter `captions:` map keyed by 1-based slide number
 * @returns {string[]}                                per-slide narration (caption → fmCaption → projected)
 */
function mergeNarration(slideCount, projected, opts = {}) {
	// FAIL LOUDLY ON THE OLD SIGNATURE. This took `(notes, projected)` until 2026-08-24 and
	// resolved `note ?? projected`; its docblock advertised that 2-arg form as back-compatible.
	// `lib/*` is a public package export (see package.json `exports`), so a caller outside this
	// repo can still be passing an array — and `Number.isFinite([])` is false, which would take
	// the branch below to `n = 0` and return an EMPTY caption track: no throw, no warning, the
	// whole narration silently gone. A wrong answer that looks like a working one is the worst
	// failure mode a shared kernel can have, so this is an error at the call site instead.
	if (Array.isArray(slideCount)) {
		throw new TypeError('mergeNarration(slideCount, projected): the first argument is a COUNT, not the notes array. The note rung was removed on 2026-08-24 — a speaker note is never narrated — so pass the number of slides. See changelog.d/1810-notes-are-not-captions.fixed.md.');
	}
	const n = Number.isFinite(slideCount) ? Math.max(0, Math.trunc(slideCount)) : 0;
	const proj = Array.isArray(projected) ? projected : [];
	const aligned = proj.length === n;
	const captions = Array.isArray(opts.captions) ? opts.captions : [];
	const fmCaptions = opts.fmCaptions instanceof Map ? opts.fmCaptions : null;
	return Array.from({ length: n }, (_, i) => {
		const inline = String(captions[i] ?? '').trim();
		if (inline) return inline; // 1. slide <!-- caption: -->
		const fm = fmCaptions ? fmCaptions.get(i + 1) : undefined; // 2. front-matter captions[number]
		if (String(fm ?? '').trim()) return fm;
		return aligned ? (proj[i] || '') : ''; // 3. DOM projection
	});
}

module.exports = { buildReadAlong, emphasisForResolved, mergeNarration };
