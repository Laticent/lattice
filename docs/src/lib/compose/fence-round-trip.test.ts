// @vitest-environment node
// Every fence WE SHIP, through the Compose round-trip. No DOM (see
// 2026-09-20-dom-library-bakeoff.md for why the environment is pinned).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { leadingTag } from './code-commands';
import { deckSchema, deckToDoc, docToDeck, serializeSlideNode } from './deck-doc';
import { fenceFor } from './deck-markdown';
import { hasLossyConstruct } from './deck-source';

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
			// The FENCE CHARACTER comes back too. prosemirror-markdown's serializer writes
			// backticks for every code block, so until the `marker` attr a `~~~mermaid` came
			// back as ```mermaid — same render, different bytes — on the first edit of its
			// slide (decision note § "What this does NOT do", corrected 2026-09-24).
			expect(after.map((f) => f.marker)).toEqual(before.map((f) => f.marker));
		});
	}
});

describe('a tilde fence survives an edit of its slide, character for character', () => {
	// The file-level arm above compares fences; this one compares BYTES, on the path an
	// edit actually takes. `emitDeck` re-emits an untouched slide from its `raw` attr, and
	// the moment the author touches it the slide runs through `serializeSlideNode` instead —
	// so for every slide carrying a fence, that serialization has to equal `raw`.
	const FILE = path.join(ROOT, 'examples/mermaid-tilde-fences.md');

	it('every fenced slide of examples/mermaid-tilde-fences.md re-serializes to its own source', () => {
		const doc = deckToDoc(fs.readFileSync(FILE, 'utf8'));
		let fenced = 0;
		let tilde = 0;
		doc.forEach((slide) => {
			const raw = slide.attrs.raw as string;
			const own = fences(raw);
			if (!own.length) return;
			fenced++;
			if (own.some((f) => f.marker === '~')) tilde++;
			expect(serializeSlideNode(slide)).toBe(raw);
		});
		// Anti-vacuity: the file is what it says it is.
		expect(fenced).toBeGreaterThanOrEqual(2);
		expect(tilde).toBeGreaterThanOrEqual(1);
	});

	it('keeps the author s fence length, and lengthens it only when the body would close it', () => {
		expect(fenceFor('~~~', 'graph LR\n  A --> B')).toBe('~~~');
		expect(fenceFor('````', 'no inner fence')).toBe('````');
		// A body line that is itself a closing run of the same character forces one more.
		expect(fenceFor('~~~', 'before\n~~~~\nafter')).toBe('~~~~~');
		expect(fenceFor('```', '```')).toBe('````');
		// The OTHER character, or a run with an info string after it, closes nothing.
		expect(fenceFor('~~~', '```\n```js')).toBe('~~~');
		expect(fenceFor('```', '```js')).toBe('```');
		// An INDENTED run lengthens too — wider than CommonMark on purpose, because
		// Compose's own `fenceRanges` reads it as a closer (see `fenceFor`).
		expect(fenceFor('```', '    ```')).toBe('````');
		expect(fenceFor('~~~', '\t~~~')).toBe('~~~~');
	});

	it('an indented closer-shaped body line cannot un-lock the math after the fence', () => {
		// The checker's reproduction: with a CommonMark-exact closer test the fence came
		// back as ``` around a `    ``` line, `fenceRanges` closed it there, and the `$…$`
		// after it stopped counting as a lossy construct — so the slide unlocked.
		// Valid CommonMark as written: a four-space run is not a closer, so the body is
		// `    ```` and the fence ends on the last line. Compose's scanner disagrees, and it
		// is the one that decides the lock — so the edit writes a fence both agree on.
		const src = '## Slide\n\n```\n    ```\n```\n\nPrice is $x^2$ here\n';
		const out = docToDeck(deckToDoc(src));
		expect(out).toContain('````\n    ```\n````');
		expect(hasLossyConstruct(out.slice(out.indexOf('````')))).toBe(true);
	});

	it('a fence nobody wrote — the insert door, an indented block — serializes the upstream way', () => {
		const doc = deckToDoc('## Slide\n\n    indented code\n');
		expect(docToDeck(doc)).toContain('```\nindented code\n```');
		// The insert door's node: `code_block.create({ params })`, no marker.
		const door = deckSchema.nodes.code_block.create({ params: 'mermaid' }, deckSchema.text('graph LR'));
		expect(door.attrs.marker).toBe('');
		const slide = deckSchema.nodes.slide.create({}, [door]);
		expect(serializeSlideNode(slide)).toBe('```mermaid\ngraph LR\n```');
	});
});

