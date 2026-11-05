/**
 * The deck model: S0 (ingest) and S1 (the block pass) over a whole deck, and the views every reader of a
 * deck's structure asks for — slides, slide boundaries, front matter, directive and fence ranges, leaf
 * ranges — read off one tape. engineering/decisions/2026-10-22-segno-deck-pipeline.md §The design.
 *
 * Every view is computed on first read and kept, so a reader that wants only the boundaries pays for the
 * block pass and one walk of the tape, nothing more.
 *
 * INCREMENTAL. A top-level thematic break closes every container, so the block state just after one is
 * empty. `updateDeckModel` re-parses from the last break above the edit and stops at the first break
 * below it that the old parse also had (shifted by the edit), then splices: a keystroke inside one slide
 * re-reads that slide. Two things fall back to a full parse: an edit in the front matter, and any update
 * where a forward-scanning block rule (`scansAhead`, math's `$$`) was tried above the point the old parse
 * is reused from, in either parse. Such a rule reads past the break the re-parse starts from, and math's
 * "no closer ahead" memo carries its answer from one slide into the next, so neither can be spliced.
 */

import { type BlockParser, type BlockTape, F_HIDDEN, KIND, lineScratch, STRIDE, T_AUX, T_FLAGS, T_KIND, T_L0, T_L1, T_LEVEL, T_NEST } from './block.js';

/** The engine's front matter (lib/engine/directives.js `parseFrontMatter`), on S0 text. */
export const ENGINE_FRONT_MATTER = /^---\n[\s\S]*?\n---\n?/;

export interface DeckModelOptions {
	/** The configured block parser (`new BlockParser(…)`); reuse one per configuration. */
	parser: BlockParser;
	/** The front-matter block, matched at the start of the S0 text; `null` for none. The engine's by default. */
	frontMatter?: RegExp | null;
	/**
	 * The source is already S0 text (no BOM, `\n` line ends): skip ingest. For a caller that hands over a
	 * body it normalized itself, so a BOM left after its front matter stays text, as markdown-it reads it.
	 */
	raw?: boolean;
}

/** An authored slide: the body lines between two top-level breaks. */
export interface Slide {
	/** First body line of the slide (just after its opening break, or 0). */
	readonly fromLine: number;
	/** One past its last line (its closing break's line, or the body's line count). */
	readonly toLine: number;
	/** The line of the break that opens it, or -1 for the first slide. */
	readonly sepLine: number;
	/** Its tokens: tape indices `[tokenFrom, tokenTo)`. */
	readonly tokenFrom: number;
	readonly tokenTo: number;
}

/** A block recorded as a range: directives, fences, plugin blocks, leaves. Lines are body lines. */
export interface BlockRange {
	/** The token's type (`html_block`, `fence`, `math_block`, `paragraph`, `heading`, …). */
	readonly type: string;
	readonly fromLine: number;
	readonly toLine: number;
	/** markdown-it's `token.level`: 0 at the top of a slide, deeper inside lists and quotes. */
	readonly level: number;
	/** The slide it sits in (index into `slides`). */
	readonly slide: number;
	/** Tape index of the token. */
	readonly token: number;
}

/** What S0 does to a source: strip a leading BOM, fold `\r\n` and lone `\r` to `\n`. Nothing else. */
export function ingest(source: string): string {
	let s = typeof source === 'string' ? source : '';
	if (s.charCodeAt(0) === 0xfeff) s = s.replace(/^\uFEFF/, '');
	return s.indexOf('\r') >= 0 ? s.replace(/\r\n?/g, '\n') : s;
}

/** The edit between two strings as one span (`from`, old end `toA`, new end `toB`). */
export interface EditSpan {
	from: number;
	toA: number;
	toB: number;
}

/** The smallest span that turns `a` into `b`, found with native substring equality. */
export function diffSpan(a: string, b: string): EditSpan {
	const BLOCK = 512;
	const max = Math.min(a.length, b.length);
	let p = 0;
	while (p + BLOCK <= max && a.slice(p, p + BLOCK) === b.slice(p, p + BLOCK)) p += BLOCK;
	while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p++;
	const maxS = max - p;
	let s = 0;
	while (s + BLOCK <= maxS && a.slice(a.length - s - BLOCK, a.length - s) === b.slice(b.length - s - BLOCK, b.length - s)) s += BLOCK;
	while (s < maxS && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
	return { from: p, toA: a.length - s, toB: b.length - s };
}

/** `span` when it describes the change from `a` to `b` (everything outside it equal), else null. */
export function spanHolds(a: string, b: string, span: EditSpan): EditSpan | null {
	const { from, toA, toB } = span;
	if (!(from >= 0 && toA >= from && toB >= from && toA <= a.length && toB <= b.length)) return null;
	if (a.length - toA !== b.length - toB) return null;
	if (a.slice(0, from) !== b.slice(0, from) || a.slice(toA) !== b.slice(toB)) return null;
	return span;
}

type Side = { content?: string; info?: string; markup?: string; meta?: unknown };

/** How the last updates went, for tests and the benchmark. */
export const deckModelStats = { full: 0, incremental: 0, reparsedLines: 0 };

/**
 * One authored slide's share of the tape, as it was written. A segment never changes after it is made;
 * an update that leaves a slide alone reuses its segment as is, and only the slide's position moves.
 * Line numbers and offsets inside are as of the parse that wrote it (`line0`, `off0`); the model adds the
 * slide's current start to read them.
 */
interface Segment {
	/** The parse's tape the slide's tokens sit in (shared with its neighbors), from token `t0`. */
	readonly tape: Int32Array;
	readonly t0: number;
	/** The slide's tokens, then its closing break's token when it has one. */
	readonly length: number;
	/** Body line of the slide's first line when written. */
	readonly line0: number;
	/** Lines the slide spans, its closing break's line included. */
	readonly lines: number;
	/** Line starts and ends as written (shared arrays), the slide's first line at index `b0`. */
	readonly bm: Int32Array;
	readonly em: Int32Array;
	readonly b0: number;
	/** Body offset of the slide's first line when written. */
	readonly off0: number;
	/** Whether the segment ends with a top-level break. Only the last does not. */
	readonly closed: boolean;
	/** Plugin side records, by token index within the segment. */
	readonly side: ReadonlyMap<number, Side> | null;
	/** Lines (as written) in this slide that a `scansAhead` rule was tried on. */
	readonly forward: readonly number[] | null;
}

/**
 * Split a parse's output into segments at its top-level breaks. The segments share the parse's arrays;
 * `bm`/`em` are indexed so that line `L` of the parse is entry `L - bmBase`. `lineTo`: one past the last
 * line the parse covers.
 */
function segmentsOf(tape: Int32Array, length: number, side: ReadonlyMap<number, Side>, forward: readonly number[], bm: Int32Array, em: Int32Array, bmBase: number, lineFrom: number, lineTo: number): Segment[] {
	const out: Segment[] = [];
	let tok = 0;
	let line = lineFrom;
	const make = (end: number, nextLine: number, closed: boolean) => {
		let sideHere: Map<number, Side> | null = null;
		if (side.size)
			for (const [i, v] of side)
				if (i >= tok && i < end) {
					sideHere ??= new Map();
					sideHere.set(i - tok, v);
				}
		const n = nextLine - line;
		let fwd: number[] | null = null;
		for (const f of forward) if (f >= line && (f < nextLine || !closed)) (fwd ??= []).push(f);
		out.push({ tape, t0: tok, length: end - tok, line0: line, lines: n, bm, em, b0: line - bmBase, off0: bm[Math.min(line, lineTo) - bmBase], closed, side: sideHere, forward: fwd });
		tok = end;
		line = nextLine;
	};
	for (let i = 0; i < length; i++) {
		const at = i * STRIDE;
		if (tape[at + T_KIND] === KIND.hr && tape[at + T_LEVEL] === 0) make(i + 1, tape[at + T_L0] + 1, true);
	}
	make(length, Math.max(line, lineTo), false);
	return out;
}

/** The first line whose start is at or before `offset`: the line holding it (`lines` past the last). */
function lineAt(bMarks: Int32Array, lines: number, offset: number): number {
	let lo = 0;
	let hi = lines;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (bMarks[mid] <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** A deck read once: the S0 text, the front-matter split and the block tape of the body, slide by slide. */
export class DeckModel {
	/** The source as given. */
	readonly source: string;
	/** S0: the source with its BOM stripped and line ends folded. Every offset below indexes this. */
	readonly text: string;
	/** Where the body starts in `text` (the front-matter block's length, or 0). */
	readonly bodyStart: number;
	/** The body: `text.slice(bodyStart)`. Body lines number from 0, as markdown-it's `token.map` does. */
	readonly body: string;
	/** Body line count (markdown-it's `lineMax`). */
	readonly lines: number;
	readonly options: DeckModelOptions;
	/** @internal */
	readonly segs: readonly Segment[];
	/** @internal Each segment's current first line, first offset and first token; one entry past the end. */
	readonly segLine: Int32Array;
	readonly segOff: Int32Array;
	readonly segTok: Int32Array;

	private _blocks?: BlockTape;
	private _boundaries?: Int32Array;
	private _slides?: Slide[];
	private _ranges?: { directives?: BlockRange[]; html?: BlockRange[]; fences?: BlockRange[]; plugins?: BlockRange[]; leaves?: BlockRange[] };

	constructor(source: string, text: string, bodyStart: number, lines: number, segs: readonly Segment[], options: DeckModelOptions, flat?: BlockTape) {
		this.source = source;
		this.text = text;
		this.bodyStart = bodyStart;
		this.body = text.slice(bodyStart);
		this.lines = lines;
		this.segs = segs;
		this.options = options;
		const n = segs.length;
		this.segLine = new Int32Array(n + 1);
		this.segOff = new Int32Array(n + 1);
		this.segTok = new Int32Array(n + 1);
		let line = 0;
		let tok = 0;
		let off = 0;
		for (let i = 0; i < n; i++) {
			const g = segs[i];
			this.segLine[i] = line;
			this.segTok[i] = tok;
			// A break on the body's last line with no `\n` after it puts the next slide one past the end.
			this.segOff[i] = Math.min(off, this.body.length);
			line += g.lines;
			tok += g.length;
			// The next slide starts one character past this one's last line (its `\n`).
			off = g.lines > 0 ? g.em[g.b0 + g.lines - 1] - g.off0 + off + 1 : off;
		}
		this.segLine[n] = line;
		this.segTok[n] = tok;
		this.segOff[n] = Math.min(off, this.body.length);
		if (flat) this._blocks = flat;
	}

	/** S1 over the body, as one flat tape (built on first read after an incremental update). */
	get blocks(): BlockTape {
		if (!this._blocks) {
			const length = this.segTok[this.segs.length];
			const tape = new Int32Array(length * STRIDE);
			const bMarks = new Int32Array(this.lines + 1);
			const eMarks = new Int32Array(this.lines + 1);
			const side = new Map<number, Side>();
			const forward: number[] = [];
			for (let i = 0; i < this.segs.length; i++) {
				const g = this.segs[i];
				const at = this.segTok[i] * STRIDE;
				tape.set(g.tape.subarray(g.t0 * STRIDE, (g.t0 + g.length) * STRIDE), at);
				const dl = this.segLine[i] - g.line0;
				if (dl !== 0)
					for (let k = at; k < at + g.length * STRIDE; k += STRIDE) {
						if (tape[k + T_L0] >= 0) {
							tape[k + T_L0] += dl;
							tape[k + T_L1] += dl;
						}
					}
				const doff = this.segOff[i] - g.off0;
				for (let L = 0; L < g.lines; L++) {
					bMarks[this.segLine[i] + L] = g.bm[g.b0 + L] + doff;
					eMarks[this.segLine[i] + L] = g.em[g.b0 + L] + doff;
				}
				if (g.side) for (const [k, v] of g.side) side.set(this.segTok[i] + k, v);
				if (g.forward) for (const f of g.forward) forward.push(f + dl);
			}
			bMarks[this.lines] = this.body.length;
			eMarks[this.lines] = this.body.length;
			this._blocks = { src: this.body, kinds: this.options.parser.kinds, tape, length, lines: this.lines, bMarks, eMarks, side, forward };
		}
		return this._blocks;
	}

	/** The body lines that hold a top-level thematic break: where the engine splits slides. */
	get boundaries(): Int32Array {
		if (!this._boundaries) {
			const n = this.segs.length - 1;
			const out = new Int32Array(Math.max(0, n));
			for (let i = 0; i < n; i++) out[i] = this.segLine[i + 1] - 1;
			this._boundaries = out;
		}
		return this._boundaries;
	}

	/**
	 * Whether the body's first token is a top-level break, so the engine (`splitOnHr`) drops the empty
	 * group before it. "Produces no tokens" is not "is blank": a link reference definition is source that
	 * produces none, so `[a]: /u` over a break is one rendered slide from two chunks of text.
	 */
	get leadingEmpty(): boolean {
		const g = this.segs[0];
		return g.closed && g.length === 1;
	}

	/** The authored slides, every chunk between breaks, the empty leading one included (see `leadingEmpty`). */
	get slides(): readonly Slide[] {
		if (!this._slides) {
			const out: Slide[] = [];
			for (let i = 0; i < this.segs.length; i++) {
				const g = this.segs[i];
				out.push({
					fromLine: this.segLine[i],
					toLine: g.closed ? this.segLine[i + 1] - 1 : this.segLine[i + 1],
					sepLine: i === 0 ? -1 : this.segLine[i] - 1,
					tokenFrom: this.segTok[i],
					tokenTo: g.closed ? this.segTok[i + 1] - 1 : this.segTok[i + 1],
				});
			}
			this._slides = out;
		}
		return this._slides;
	}

	/**
	 * One kind of range, collected on its first read: a reader of the comment blocks does not pay for building every
	 * leaf, which is most of the tape (on the gallery, the four together cost about five times the comments alone).
	 */
	private ranges(which: 'directives' | 'html' | 'fences' | 'plugins' | 'leaves'): BlockRange[] {
		this._ranges ??= {};
		const hit = this._ranges[which];
		if (hit) return hit;
		const out: BlockRange[] = [];
		const kinds = this.options.parser.kinds;
		const coreKinds = KIND.td_close;
		// The open token of each level, so an inline leaf is named for its parent (paragraph, heading).
		const parent: number[] = [];
		for (let slide = 0; slide < this.segs.length; slide++) {
			const g = this.segs[slide];
			const tape = g.tape;
			const dl = this.segLine[slide] - g.line0;
			for (let j = 0; j < g.length; j++) {
				const at = (g.t0 + j) * STRIDE;
				const kind = tape[at + T_KIND];
				const level = tape[at + T_LEVEL];
				if (kind === KIND.hr && level === 0) continue;
				if (tape[at + T_NEST] === 1) parent[level] = kind;
				const l0 = tape[at + T_L0];
				if (l0 < 0) continue;
				let type: string | null = null;
				if (kind === KIND.html_block) {
					if (which === (tape[at + T_AUX] === 1 ? 'directives' : 'html')) type = 'html_block';
				} else if (kind === KIND.fence || kind === KIND.code_block) {
					if (which === 'fences') type = kinds[kind];
				} else if (kind === KIND.inline) {
					if (which === 'leaves') {
						const pk = level > 0 ? kinds[parent[level - 1]] : '';
						type = pk ? pk.replace(/_open$/, '') : 'inline';
					}
				} else if (kind > coreKinds) {
					if (which === 'plugins') type = kinds[kind];
				}
				if (type !== null) out.push({ type, fromLine: l0 + dl, toLine: tape[at + T_L1] + dl, level, slide, token: this.segTok[slide] + j });
			}
		}
		this._ranges[which] = out;
		return out;
	}

	/** Every HTML comment block (`<!-- … -->`): directives, notes, anything commented out. */
	get directives(): readonly BlockRange[] {
		return this.ranges('directives');
	}

	/** Every OTHER HTML block (`<div>`, `<pre>`, `<?…`, `<![CDATA[`, a lone tag): what a comment inside one folds into. */
	get html(): readonly BlockRange[] {
		return this.ranges('html');
	}

	/** Every fenced and indented code block. A fence's info string is `fenceInfo(range)`. */
	get fences(): readonly BlockRange[] {
		return this.ranges('fences');
	}

	/** Every block a plugin rule claimed (`math_block`, `code_record`). */
	get plugins(): readonly BlockRange[] {
		return this.ranges('plugins');
	}

	/** Every leaf with a line range: the inline text of a paragraph or heading (S2 reads these). */
	get leaves(): readonly BlockRange[] {
		return this.ranges('leaves');
	}

	/** Offset in `body` where a body line starts (`body.length` past the last line). */
	lineStart(line: number): number {
		if (line >= this.lines) return this.body.length;
		const L = Math.max(line, 0);
		const i = segmentOf(this.segLine, this.segs.length, L);
		const g = this.segs[i];
		return g.bm[g.b0 + L - this.segLine[i]] - g.off0 + this.segOff[i];
	}

	/** Offset in `body` where a body line ends (its `\n`, or `body.length`). */
	lineEnd(line: number): number {
		if (line >= this.lines) return this.body.length;
		const L = Math.max(line, 0);
		const i = segmentOf(this.segLine, this.segs.length, L);
		const g = this.segs[i];
		return g.em[g.b0 + L - this.segLine[i]] - g.off0 + this.segOff[i];
	}

	/** A fence's info string (the text after its marker run), trimmed. '' for an indented code block. */
	fenceInfo(range: BlockRange): string {
		const g = this.segs[range.slide];
		const at = (g.t0 + range.token - this.segTok[range.slide]) * STRIDE;
		if (g.tape[at + T_KIND] !== KIND.fence) return '';
		const body = this.body;
		let pos = this.lineStart(range.fromLine);
		while (body.charCodeAt(pos) === 0x20 || body.charCodeAt(pos) === 0x09) pos++;
		return body.slice(pos + g.tape[at + T_AUX], this.lineEnd(range.fromLine)).trim();
	}

	/** Whether a tight list hides this paragraph token (markdown-it's `token.hidden`). */
	hidden(token: number): boolean {
		const i = segmentOf(this.segTok, this.segs.length, token);
		const g = this.segs[i];
		return (g.tape[(g.t0 + token - this.segTok[i]) * STRIDE + T_FLAGS] & F_HIDDEN) !== 0;
	}

	/** A slide's text, the chunk model `splitOnHr` uses: the break line belongs to neither neighbor. */
	slideText(index: number): string {
		const s = this.slides[index];
		if (!s || s.toLine <= s.fromLine) return '';
		return this.body.slice(this.lineStart(s.fromLine), this.lineEnd(s.toLine - 1));
	}
}

/** The segment holding `at`, by its start table (`starts[i] <= at < starts[i + 1]`, empty ones skipped). */
function segmentOf(starts: Int32Array, n: number, at: number): number {
	let lo = 0;
	let hi = n - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (starts[mid] <= at) lo = mid;
		else hi = mid - 1;
	}
	// Step past empty segments that start at `at` but hold nothing there.
	while (lo < n - 1 && starts[lo + 1] <= at) lo++;
	return lo;
}

function frontMatterEnd(text: string, options: DeckModelOptions): number {
	const re = options.frontMatter === undefined ? ENGINE_FRONT_MATTER : options.frontMatter;
	const fm = re ? re.exec(text) : null;
	return fm && fm.index === 0 ? fm[0].length : 0;
}

/** Read a deck from nothing: S0, the front-matter split, S1 over the body. */
export function deckModel(source: string, options: DeckModelOptions): DeckModel {
	deckModelStats.full++;
	const src = typeof source === 'string' ? source : '';
	const text = options.raw ? src : ingest(src);
	const bodyStart = frontMatterEnd(text, options);
	const flat = options.parser.parse(text.slice(bodyStart));
	const segs = segmentsOf(flat.tape, flat.length, flat.side, flat.forward, flat.bMarks, flat.eMarks, 0, 0, flat.lines);
	return new DeckModel(src, text, bodyStart, flat.lines, segs, options, flat);
}

/**
 * The model of `next`, re-reading only what an edit can have changed. `span` is the editor's own account
 * of the edit, in SOURCE offsets; it is checked against the two texts and ignored when it does not hold.
 * Returns `prev` itself when the source is unchanged.
 */
export function updateDeckModel(prev: DeckModel, next: string, span?: EditSpan): DeckModel {
	const source = typeof next === 'string' ? next : '';
	if (source === prev.source) return prev;
	const options = prev.options;
	const text = options.raw ? source : ingest(source);
	const full = () => deckModel(source, options);
	// Front matter: an edit inside it, or one that changes where it ends, rebuilds.
	const bodyStart = frontMatterEnd(text, options);
	if (bodyStart !== prev.bodyStart || text.slice(0, bodyStart) !== prev.text.slice(0, bodyStart)) return full();
	const oldBody = prev.body;
	const body = text.slice(bodyStart);
	// The span, in body coordinates. A source span is usable only when S0 changed nothing (no BOM, no CR)
	// in either text, so source offsets are text offsets.
	let edit: EditSpan | null = null;
	if (span && source === text && prev.source === prev.text) edit = spanHolds(oldBody, body, { from: span.from - bodyStart, toA: span.toA - bodyStart, toB: span.toB - bodyStart });
	edit ??= diffSpan(oldBody, body);
	const delta = edit.toB - edit.toA;
	const nSegs = prev.segs.length;
	// The old lines holding the edit's two ends, clamped to the last real line: an edit at the very end may
	// extend a last line that has no `\n`, and a whitespace-only last line is not a line at all.
	const lastReal = Math.max(0, prev.lines - 1);
	const firstLine = Math.min(lineOf(prev, edit.from), lastReal);
	const lastOld = Math.min(lineOf(prev, edit.toA), lastReal);
	// Restart at the slide holding `firstLine`: just after the last top-level break above it.
	const r = segmentOf(prev.segLine, nSegs, firstLine);
	const restartLine = prev.segLine[r];
	const restartOff = prev.segOff[r];
	// Slides wholly below the edit keep their text; the first of them is where the tail starts. The tail
	// is the slides after the segment holding `lastOld`, when that segment is closed.
	// By line and by offset: an edit at the very end can sit past the last real line, in the open slide
	// after a final break, which the clamped line would place in the slide above.
	const e = Math.max(segmentOf(prev.segLine, nSegs, lastOld), segmentOf(prev.segOff, nSegs, edit.toA));
	const tailSeg = prev.segs[e].closed ? e + 1 : nSegs; // first reusable segment, if the parse realigns
	const tailOldLine = prev.segLine[Math.min(tailSeg, nSegs)];
	const tailNewOff = tailSeg < nSegs ? prev.segOff[tailSeg] + delta : body.length;
	// Index the new text from the restart to the tail's start, then the tail's lines from its segments.
	let lines = restartLine;
	const scan = (from: number, to: number, last: boolean) => {
		for (let start = from; start < to; ) {
			let end = body.indexOf('\n', start);
			if (end < 0 || end > to) end = body.length;
			if (last && end === body.length && /^[ \t]*$/.test(body.slice(start))) break;
			const sc = lineScratch(lines + 1);
			sc.bMarks[lines] = start;
			sc.eMarks[lines] = end;
			lines++;
			start = end + 1;
		}
	};
	scan(restartOff, tailNewOff, tailNewOff >= body.length);
	const tailNewLine = lines;
	const lineDelta = tailNewLine - tailOldLine;
	const totalLines = prev.lines + lineDelta;
	const sc = lineScratch(totalLines + 1);
	for (let i = tailSeg; i < nSegs; i++) {
		const g = prev.segs[i];
		const L0 = prev.segLine[i] + lineDelta;
		const doff = prev.segOff[i] + delta - g.off0;
		for (let L = 0; L < g.lines; L++) {
			sc.bMarks[L0 + L] = g.bm[g.b0 + L] + doff;
			sc.eMarks[L0 + L] = g.em[g.b0 + L] + doff;
		}
	}
	// Stop at a break the old parse also had, at or below the edit (segment `e`'s closing break or a later
	// one), shifted by the edit's line delta: the text after it is unchanged and the block state after a
	// top-level break is empty, so everything below it parses as it did.
	const stopAt = (line: number) => {
		const old = line + 1 - lineDelta; // the old first line of the slide that would follow
		if (old <= prev.segLine[e]) return false;
		const i = segmentOf(prev.segLine, nSegs, old);
		return i > e && prev.segLine[i] === old && prev.segs[i - 1].closed;
	};
	const parsed = options.parser.parseFrom(body, totalLines, restartLine, stopAt);
	// Where the parse stopped: the old segment whose closing break it matched; reuse everything after it.
	let reuseFrom = nSegs;
	let parsedTo = totalLines;
	if (parsed.stopped) {
		const stopLine = parsed.tape[(parsed.length - 1) * STRIDE + T_L0];
		parsedTo = stopLine + 1;
		reuseFrom = segmentOf(prev.segLine, nSegs, stopLine + 1 - lineDelta);
		if (prev.segLine[reuseFrom] !== stopLine + 1 - lineDelta) reuseFrom = nSegs; // cannot happen; stay exact
	}
	// The re-parsed lines' index, copied out of the scratch once for all the fresh segments.
	const bm = sc.bMarks.slice(restartLine, parsedTo + 1);
	const em = sc.eMarks.slice(restartLine, parsedTo + 1);
	// A forward-scanning rule tried above the reused tail, in the old parse or this one, can have decided
	// something the splice would get wrong (it read past a break, or left a memo the next slide reads).
	for (let i = 0; i < reuseFrom && i < nSegs; i++) if (prev.segs[i].forward) return full();
	for (const f of parsed.forward) if (f < parsedTo) return full();
	const fresh = segmentsOf(parsed.tape, parsed.length, parsed.side, parsed.forward, bm, em, restartLine, restartLine, parsedTo);
	// A stopped parse ends on a break, which leaves an empty open segment after it: drop it.
	if (parsed.stopped) fresh.pop();
	const segs = [...prev.segs.slice(0, r), ...fresh, ...prev.segs.slice(reuseFrom)];
	deckModelStats.incremental++;
	deckModelStats.reparsedLines += parsedTo - restartLine;
	return new DeckModel(source, text, bodyStart, totalLines, segs, options);
}

/** The body line holding a body offset, in `m`. */
function lineOf(m: DeckModel, offset: number): number {
	const i = segmentOf(m.segOff, m.segs.length, offset);
	const g = m.segs[i];
	if (g.lines === 0) return m.segLine[i];
	// Within the segment: its line starts, shifted to current offsets.
	const local = offset - m.segOff[i] + g.off0;
	return m.segLine[i] + lineAt(g.bm.subarray(g.b0, g.b0 + g.lines), g.lines - 1, local);
}
