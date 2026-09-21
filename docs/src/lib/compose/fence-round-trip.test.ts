// @vitest-environment node
// Every fence WE SHIP, through the Compose round-trip. No DOM (see
// 2026-09-20-dom-library-bakeoff.md for why the environment is pinned).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { leadingTag } from './code-commands';
import { deckToDoc, docToDeck } from './deck-doc';

// The fixture the design note promised and the corpus the whole feature rests on.
// Compose is a SECOND VIEW of the deck source (HARD RULE #1), so its correctness is
// "markdown → document → the same markdown". A unit test over a hand-written fence
// proves that for a fence somebody invented; this proves it for every fence an author
// has actually written here — 14 languages, the three engine sub-languages, bodies
// carrying pipes, backticks, `$`, HTML and the `---` that splits slides.

const ROOT = path.resolve(__dirname, '../../../..');
const GLOBS = [
	['examples', /\.md$/],
	['test/integration/baseline-decks', /\.md$/],
] as const;

function deckFiles(): string[] {
	const out: string[] = [];
	for (const [dir, re] of GLOBS) {
		const abs = path.join(ROOT, dir);
		if (!fs.existsSync(abs)) continue;
		for (const f of fs.readdirSync(abs)) if (re.test(f)) out.push(path.join(abs, f));
	}
	// The component galleries, two levels down: lib/components/<bucket>/<name>/*.gallery.md
	const comps = path.join(ROOT, 'lib/components');
	if (fs.existsSync(comps)) {
		for (const bucket of fs.readdirSync(comps)) {
			const bp = path.join(comps, bucket);
			if (!fs.statSync(bp).isDirectory()) continue;
			for (const name of fs.readdirSync(bp)) {
				const g = path.join(bp, name, `${name}.gallery.md`);
				if (fs.existsSync(g)) out.push(g);
			}
		}
	}
	return out;
}

/** Every fenced block in a source, as `{ tag, marker, body }`. A WALK, not a regex: a
 *  fence closes on a run of the same character at least as long as its opener, so a
 *  ```` ``` ```` inside a ```` ```` ```` block is content, not a closer. */
function fences(src: string): { tag: string; marker: string; body: string }[] {
	const out: { tag: string; marker: string; body: string }[] = [];
	let open: { char: string; len: number; tag: string; lines: string[] } | null = null;
	for (const line of src.split('\n')) {
		const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (open) {
			if (m && m[1][0] === open.char && m[1].length >= open.len && !m[2].trim()) {
				out.push({ tag: open.tag, marker: open.char, body: open.lines.join('\n') });
				open = null;
			} else {
				open.lines.push(line);
			}
			continue;
		}
		if (m) open = { char: m[1][0], len: m[1].length, tag: leadingTag(m[2]), lines: [] };
	}
	// An unclosed fence still counts — markdown-it closes it at end of input.
	if (open) out.push({ tag: open.tag, marker: open.char, body: open.lines.join('\n') });
	return out;
}

describe('every fence we ship survives the Compose round-trip', () => {
	const files = deckFiles();

	it('finds a corpus worth testing — this is the anti-vacuity arm', () => {
		expect(files.length).toBeGreaterThan(20);
		const all = files.flatMap((f) => fences(fs.readFileSync(f, 'utf8')));
		expect(all.length).toBeGreaterThan(150);
		// The census that shaped the design: mermaid dominates, and every backtick fence
		// we ship carries a tag.
		expect(all.filter((f) => f.tag === 'mermaid').length).toBeGreaterThan(100);
		expect(all.filter((f) => !f.tag && f.marker === '`')).toEqual([]);
	});

	// THE SCOPE IS THE FENCES, NOT THE WHOLE DECK, and the difference is not a dodge.
	// `docToDeck` re-serializes EVERY slide, including ones Compose marks `locked` and
	// never lets an author touch (a table, math, block HTML); the editor's hot path is
	// `emitDeck`, which re-emits an untouched slide's exact bytes from its `raw` attr and
	// so never runs those slides through the serializer at all. Asserting whole-deck
	// equality here would therefore fail on decks Compose already handles correctly, and
	// pass no judgment on the thing this change is about. What must hold — and what this
	// asserts — is that every fence's TAG and BODY come back character for character.
	for (const file of files) {
		const rel = path.relative(ROOT, file);
		const src = fs.readFileSync(file, 'utf8');
		const before = fences(src);
		if (!before.length) continue;
		const tildes = before.filter((f) => f.marker === '~').length;
		it(`${rel} — ${before.length} fence(s)${tildes ? `, ${tildes} tilde` : ''}`, () => {
			const after = fences(docToDeck(deckToDoc(src)));
			expect(after.map((f) => f.tag)).toEqual(before.map((f) => f.tag));
			expect(after.map((f) => f.body)).toEqual(before.map((f) => f.body));
			// TILDE FENCES DO NOT KEEP THEIR MARKER, and the design note used to claim they
			// did. prosemirror-markdown's serializer emits backticks for every code block,
			// so `~~~mermaid` comes back as ```mermaid — same render, same body, different
			// bytes. `emitDeck`'s identity baseline keeps an untouched slide's exact bytes,
			// so this only shows up on a slide the author actually edits; it is recorded
			// here rather than claimed away. `examples/mermaid-tilde-fences.md` is the one
			// file in the corpus that carries them.
			expect(after.map((f) => f.marker)).toEqual(before.map(() => '`'));
		});
	}
});
