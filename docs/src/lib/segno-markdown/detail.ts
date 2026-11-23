/**
 * The DETAIL recorder: what a detail parse (`BlockParser.parse(src, 0, detailRecorder)`) records beyond the block tape,
 * for the inline pass and the token adapter. Kept out of block.ts so a bundle that only reads slide boundaries carries
 * none of it (the `Recorder` hooks there are the whole cost of the lean parse).
 *
 * - CONTENT COLUMNS: on `heading_open` (ATX), `hr`, `list_item_open`, `fence` and `tr_open`, the column the line's
 *   content starts at (markdown-it's `bMarks + tShift`, past any container prefix), counted from the line's own start,
 *   as `T_FLAGS >> COL_SHIFT`.
 * - CONTAINER LEAVES: where each line of a paragraph or setext heading inside a quote or list item starts, as pairs
 *   (offset from the line's own start, the spaces a partly consumed tab pads it with) in one buffer, `leafLines`; the
 *   leaf's `inline` token holds 1 + its first pair's index in `T_AUX`.
 * - LINK REFERENCE DEFINITIONS: each definition's label, destination and title pieces, columns counted from each
 *   line's own start so a record survives its slide moving (`RefRecord`).
 */

import { COL_SHIFT, type Recorder, type RecordingState, STRIDE, T_AUX, T_FLAGS } from './block.js';

/**
 * A link reference definition, as S1 read it. markdown-it keeps these in `env.references` (first definition of a label
 * wins) and produces no token for them; S2 resolves reference links against them. Each piece is `(line, from, to)`:
 * the label's text (a label can continue onto later lines, and the line ends inside it are part of it), the
 * destination as written (inside `<>` when bracketed), and the title's text inside its quotes, which can also continue
 * onto later lines (`title` empty: the definition has none).
 */
export interface RefRecord {
	/** The definition's first line. */
	readonly line: number;
	readonly label: Int32Array;
	readonly dest: Int32Array;
	readonly title: Int32Array;
}

/** What a detail parse collected, as its `BlockTape.detail`. */
export interface Detail {
	readonly refs: readonly RefRecord[];
	readonly leafLines: Int32Array;
}

class DetailRecorder implements Recorder {
	private readonly st: RecordingState;
	private refs: RefRecord[] = [];
	private leafLines = new Int32Array(64);
	private leafN = 0;

	constructor(st: RecordingState) {
		this.st = st;
	}

	col(i: number, line: number): void {
		const st = this.st;
		st.tape[i * STRIDE + T_FLAGS] |= (st.bMarks[line] + st.tShift[line] - st.rawStart(line)) << COL_SHIFT;
	}

	leaf(i: number, begin: number, end: number, indent: number): void {
		const need = this.leafN + (end - begin) * 2;
		if (need > this.leafLines.length) {
			const grown = new Int32Array(Math.max(need, this.leafLines.length * 2));
			grown.set(this.leafLines.subarray(0, this.leafN));
			this.leafLines = grown;
		}
		this.st.tape[i * STRIDE + T_AUX] = this.leafN + 1;
		this.st.lineStarts(this.leafLines, this.leafN, begin, end, indent);
		this.leafN = need;
	}

	ref(line: number, label: number[], dest: number[], title: number[] | null): void {
		this.refs.push({ line, label: this.pieces(label), dest: this.pieces(dest), title: title ? this.pieces(title) : new Int32Array(0) });
	}

	/** (line, from, to) triples with absolute offsets, as columns from each line's own start. */
	private pieces(flat: number[]): Int32Array {
		const out = Int32Array.from(flat);
		for (let k = 0; k < out.length; k += 3) {
			const start = this.st.rawStart(out[k]);
			out[k + 1] -= start;
			out[k + 2] -= start;
		}
		return out;
	}

	done(): Detail {
		return { refs: this.refs, leafLines: this.leafLines.slice(0, this.leafN) };
	}
}

/** The recorder factory a detail parse takes: `parser.parse(src, 0, detailRecorder)`. */
export const detailRecorder = (st: RecordingState): Recorder => new DetailRecorder(st);
