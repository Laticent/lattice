import { frontMatterBlock, stripFrontMatter } from '../../components/studio/front-matter';
import { splitSlides } from '../../components/studio/lint';
import { fenceRanges } from '../../components/studio/slide-directives';

// Pure deck-source helpers — the fence-aware split/join between a Lattice deck's
// canonical markdown and its parts (front-matter, per-slide directives, prose).
// Zero DOM, zero editor dependency; the ProseMirror layer (deck-doc) is built on
// top of this. The front-matter + slide splitters are the SHARED engine ones
// (front-matter.ts / lint.ts) — one source of truth (HARD RULE #1), not a fork.

export type SlideChunk = { directives: string[]; prose: string };
export type ParsedSlide = SlideChunk & { raw: string };

const DIRECTIVE_LINE_RE = /^[ \t]*<!--\s*_[A-Za-z][\w-]*:[\s\S]*?-->[ \t]*$/gm;
const CLASS_RE = /<!--\s*_class:\s*([A-Za-z0-9-]+)/;
const SEP = '\n\n---\n\n';

/** CRLF → LF. The slide separator `\n-{3,}\n` doesn't match `\r\n---\r\n`, so a CRLF
 *  deck must be normalized before splitting or it collapses to one slide. */
export function normalizeSource(source: string): string {
	return source.replace(/\r\n?/g, '\n');
}

/** Split one slide chunk into preserved directive lines + the prose body. FENCE-AWARE:
 *  a `<!-- _x -->` inside a fenced code sample is left in the prose, never hoisted. */
export function splitSlideDirectives(chunk: string): SlideChunk {
	const fences = fenceRanges(chunk);
	const inFence = (i: number) => fences.some(([s, e]) => i >= s && i < e);
	const directives: string[] = [];
	const prose = chunk
		.replace(DIRECTIVE_LINE_RE, (line, offset: number) => {
			if (inFence(offset)) return line;
			directives.push(line.trim());
			return '';
		})
		.replace(/^\s+/, '')
		.trimEnd();
	return { directives, prose };
}

/** Re-assemble a slide chunk from its directives + prose. */
export function composeSlideChunk(directives: string[], prose: string): string {
	const head = directives.join('\n');
	const body = prose.trim();
	if (!head) return body;
	return body ? `${head}\n\n${body}` : head;
}

/** The `_class` component name of a slide's directives (first token), or 'content'. */
export function slideClassOf(directives: string[]): string {
	for (const d of directives) {
		const m = d.match(CLASS_RE);
		if (m) return m[1];
	}
	return 'content';
}

/** Parse a deck source into front-matter + per-slide { directives, prose, raw },
 *  using the SHARED engine splitters after a CRLF normalize. */
export function parseDeck(source: string): { fm: string; slides: ParsedSlide[] } {
	const src = normalizeSource(source);
	const fm = frontMatterBlock(src);
	const slides = splitSlides(stripFrontMatter(src)).map((raw) => ({ ...splitSlideDirectives(raw), raw }));
	return { fm, slides };
}

/** Rebuild deck source, replacing one slide's prose; every OTHER slide keeps its
 *  exact original bytes (`raw`) so an edit is a minimal diff. */
export function recompileDeck(slides: ParsedSlide[], fm: string, editedIndex: number, editedProse: string): string {
	const body = slides.map((c, i) => (i === editedIndex ? composeSlideChunk(c.directives, editedProse) : c.raw)).join(SEP);
	return fm ? fm + body : body;
}
