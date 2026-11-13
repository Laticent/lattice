// The docs site's typed door to lib/core/payload-elision.js (a CommonJS module): one definition of "a photo's base64",
// skipped by the Studio's readers and folded by its editor.
import elision from '../../../lib/core/payload-elision.js';

type Elided = { text: string; standIns: string[]; lost: number[]; restoreText: (s: string) => string };

const kernel = elision as {
	elidePayloads: (text: string) => Elided | null;
	payloadRanges: (text: string) => Array<[number, number]>;
};

/** `text` with each long base64 payload a short stand-in, and the way back; null when there is none. */
export const elidePayloads = kernel.elidePayloads;
/** `[start, end)` of each long base64 payload in `text`. */
export const payloadRanges = kernel.payloadRanges;

let lastIn: string | null = null;
let lastOut = '';
/**
 * The text a READER of the deck may scan in place of the deck: each long base64 payload a short stand-in, lines and slides
 * where they were. For checks that ask what the deck says (is there math, which slide is this, could it name a web image),
 * never for what is rendered, saved or exported. The last answer is kept, so the passes one render makes over the same
 * text cut it once.
 */
export function analysisText(text: string): string {
	if (text === lastIn) return lastOut;
	lastIn = text;
	lastOut = kernel.elidePayloads(text)?.text ?? text;
	return lastOut;
}
