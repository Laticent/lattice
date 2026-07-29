import { afterEach, describe, expect, it } from 'vitest';
import { DECKS, deckSource } from './decks';
import { writeFrontMatterLine } from './front-matter';
import { addComment, listComments } from './slide-comments';
import {
	clearAllDecks,
	createDeck,
	DECKS_CLEARED_EVENT,
	deckContentStats,
	deckLabels,
	deleteDeck,
	exportStudioState,
	headingText,
	importStudioState,
	loadActiveDeck,
	loadBootDeck,
	loadBootSlide,
	loadChat,
	loadChatDraft,
	loadCheckpoints,
	loadDeckList,
	loadInstructions,
	loadOnDeviceInstructions,
	loadSettings,
	loadSource,
	metaFor,
	ON_DEVICE_INSTRUCTIONS_MAX,
	resolveTitle,
	retitleSource,
	saveActiveDeck,
	saveChat,
	saveChatDraft,
	saveCheckpoint,
	saveInstructions,
	saveOnDeviceInstructions,
	saveSettings,
	saveSource,
	setDeckLabel,
	storedTitleFor,
	syncDerivedTitle,
	titleFromSource,
	truncateCodePoints,
} from './studio-store';

afterEach(() => localStorage.clear());

describe('studio-store — deck index', () => {
	it('seeds the list from the built-in decks on first run', () => {
		const list = loadDeckList();
		expect(list.map((d) => d.id)).toEqual(DECKS.map((d) => d.id));
		expect(list[0].meta).toMatch(/\d+ slides?/);
	});

	it('createDeck appends a persisted, editable deck', () => {
		const before = loadDeckList().length;
		const d = createDeck('My deck');
		expect(d.title).toBe('My deck');
		const list = loadDeckList();
		expect(list.length).toBe(before + 1);
		expect(list.find((x) => x.id === d.id)).toBeTruthy();
	});

	it('a new deck is seeded with its title as the HEADING, so the two can never disagree', () => {
		const d = createDeck('My deck');
		expect(loadSource(d.id)).toContain('# My deck');
	});

	it('the listed title tracks the deck HEADING, not the stored label (the rename-in-place case)', () => {
		const d = createDeck('Untitled deck');
		// The author types a real title into the deck — no rename step.
		saveSource(d.id, '<!-- _class: title -->\n\n# Q4 Wrap\n\nbody');
		expect(loadDeckList().find((x) => x.id === d.id)?.title).toBe('Q4 Wrap');
	});

	it('a deck with NO heading falls back to its stored label, which syncDeckTitle writes', () => {
		const d = createDeck('Temp');
		saveSource(d.id, 'just body text, no heading');
		expect(loadDeckList().find((x) => x.id === d.id)?.title).toBe('Temp');
		setDeckLabel(d.id, 'Named by hand');
		expect(loadDeckList().find((x) => x.id === d.id)?.title).toBe('Named by hand');
	});

	it('deleteDeck persists', () => {
		const d = createDeck('Temp');
		deleteDeck(d.id);
		expect(loadDeckList().find((x) => x.id === d.id)).toBeUndefined();
	});

	it('offers the welcome deck to a returning user once — appended, and deletable', () => {
		// A saved index from before the welcome deck existed (no `welcome`, no flag).
		localStorage.setItem('lattice-studio-deck-index', JSON.stringify([
			{ id: 'q3-board', title: 'Q3 Board Review', builtin: true },
			{ id: 'product-strategy', title: 'FY26 Product Strategy', builtin: true },
		]));
		const ids = loadDeckList().map((d) => d.id);
		// Welcome is appended (last) — it does not hijack index[0] (the active deck).
		expect(ids).toEqual(['q3-board', 'product-strategy', 'welcome']);
		// Deleting it sticks — the one-time migration doesn't re-add it.
		deleteDeck('welcome');
		expect(loadDeckList().map((d) => d.id)).toEqual(['q3-board', 'product-strategy']);
	});
});

describe('studio-store — per-deck source', () => {
	it('round-trips edited source and overrides the canonical', () => {
		const id = DECKS[0].id;
		expect(loadSource(id)).toBeNull();
		saveSource(id, '<!-- _class: title -->\n\n# Edited');
		expect(loadSource(id)).toContain('# Edited');
		// The list reflects the edit (slide count from the edited source).
		expect(loadDeckList().find((d) => d.id === id)?.slides[0]).toContain('# Edited');
	});

	it('metaFor counts slides — agreeing with the rail splitter on tight separators', () => {
		expect(metaFor('a\n\n---\n\nb\n\n---\n\nc')).toBe('3 slides');
		expect(metaFor('only one')).toBe('1 slide');
		// Tight + trailing separators count the same as the live rail (splitSlides),
		// not the old per-variant regex (which over/under-counted these).
		expect(metaFor('# A\n---\n# B')).toBe('2 slides');
		expect(metaFor('# A\n\n---\n\n# B\n\n---\n')).toBe('2 slides');
	});
});

describe('studio-store — version history', () => {
	it('saves checkpoints newest-first, dedupes the latest, and caps the list', () => {
		expect(loadCheckpoints('d1')).toEqual([]);
		saveCheckpoint('d1', 'v1', 'first', 1000);
		saveCheckpoint('d1', 'v2', 'second', 2000);
		saveCheckpoint('d1', 'v2', 'dupe', 3000); // same source as latest → skipped
		const list = loadCheckpoints('d1');
		expect(list.map((c) => c.source)).toEqual(['v2', 'v1']); // newest first, no dupe
		// Cap at 25.
		for (let i = 0; i < 40; i++) saveCheckpoint('d1', `x${i}`, 'bulk', 4000 + i);
		expect(loadCheckpoints('d1').length).toBe(25);
	});
});

describe('studio-store — titleFromSource / retitleSource (the deck\'s name IS its heading)', () => {
	it('derives a title from the first heading', () => {
		expect(titleFromSource('<!-- _class: title -->\n\n# Q4 Wrap\n\nbody')).toBe('Q4 Wrap');
		expect(titleFromSource('no heading here')).toBe('Imported deck');
	});

	it('reads a CRLF (Windows-authored) deck — the `\\r` is not part of the heading', () => {
		expect(titleFromSource('<!-- _class: title -->\r\n\r\n# Q4 Wrap\r\n\r\nbody')).toBe('Q4 Wrap');
		// …and a rewrite leaves the rest of the file's line endings untouched.
		const out = retitleSource('# Old\r\n\r\nbody\r\n', 'New') ?? '';
		expect(out).toBe('# New\r\n\r\nbody\r\n');
	});

	it('skips HTML COMMENTS — an authored note is not the deck title, and Rename must not eat it', () => {
		const src = '<!-- _class: big-number -->\n\n<!-- Notes: # TODO rewrite this cover -->\n\n- 42%\n  - of revenue';
		expect(titleFromSource(src, 'FALLBACK')).toBe('FALLBACK');
		expect(retitleSource(src, 'Acme Q4')).toBeNull();
	});

	it('does not truncate or strip what it WRITES — the display cap is display-only', () => {
		const long = 'Project Falcon — the FY26 operating plan and capital allocation review'; // 70 chars
		const src = `# ${long}\n\nbody`;
		expect(titleFromSource(src)).toHaveLength(60); // display caps…
		expect(headingText(src)).toBe(long); // …the raw heading does not
		expect(retitleSource(src, `${long} II`)).toContain(`# ${long} II`);
		// Emphasis survives a round-trip through headingText (it would not through titleFromSource).
		expect(headingText('# **Q4** Wrap\n')).toBe('**Q4** Wrap');
	});

	it('flattens a multi-line title — a newline would inject a slide break into the deck', () => {
		const out = retitleSource('# Old\n\nBody.\n', 'A\n---\n\n<!-- _class: quote -->\n\n# B') ?? '';
		expect(out.split('\n')[0]).toBe('# A --- <!-- _class: quote --> # B');
		expect(out.match(/^---$/gm)).toBeNull(); // no new slide break
	});

	it('skips front matter and FENCED CODE — a `# comment` in a bash block is not the title', () => {
		expect(titleFromSource('---\ntheme: indaco\n---\n\n# Real Title\n')).toBe('Real Title');
		expect(titleFromSource('```bash\n# npm install\n```\n\n## Real Title\n')).toBe('Real Title');
	});

	it('retitleSource rewrites that heading in place, preserving its level', () => {
		expect(retitleSource('<!-- _class: title -->\n\n# Old\n\nbody', 'New')).toBe('<!-- _class: title -->\n\n# New\n\nbody');
		expect(retitleSource('## Old\n\nbody', 'New')).toBe('## New\n\nbody');
	});

	it('retitleSource never rewrites a fenced code line, and reports "no heading" as null', () => {
		expect(retitleSource('```bash\n# npm install\n```\n', 'New')).toBeNull();
		expect(retitleSource('no heading here', 'New')).toBeNull();
	});

	it('round-trips: what titleFromSource reads is what retitleSource writes', () => {
		const src = retitleSource('---\nsize: 16:9\n---\n\n# Old\n\nbody', 'Board Pack') ?? '';
		expect(titleFromSource(src)).toBe('Board Pack');
	});
});

describe('studio-store — the `title:` front-matter override (shelf name ≠ cover)', () => {
	const COVER = '<!-- _class: title -->\n\n# Q4\n\nbody';
	const OVERRIDDEN = `---\ntitle: Board pack — Q4 FY26 (final)\n---\n\n${COVER}`;

	it('the override wins over the heading, and reports WHERE the title came from', () => {
		expect(titleFromSource(OVERRIDDEN)).toBe('Board pack — Q4 FY26 (final)');
		expect(resolveTitle(OVERRIDDEN)).toEqual({ text: 'Board pack — Q4 FY26 (final)', from: 'front-matter' });
		// …and with no override the heading still wins, tagged as such.
		expect(resolveTitle(COVER)).toEqual({ text: 'Q4', from: 'heading' });
		expect(resolveTitle('no title anywhere')).toBeNull();
	});

	it('an EMPTY or whitespace-only `title:` is treated as absent — a stray key cannot blank the deck name', () => {
		// The bare-key form parses to '' (front-matter.ts), the spaces form to '  '. Neither is a
		// name, and preferring either would leave the deck listed under the index fallback with a
		// perfectly good heading sitting right there.
		expect(titleFromSource(`---\ntitle:\n---\n\n${COVER}`)).toBe('Q4');
		expect(titleFromSource(`---\ntitle: "   "\n---\n\n${COVER}`)).toBe('Q4');
		expect(resolveTitle(`---\ntitle:\n---\n\n${COVER}`)?.from).toBe('heading');
	});

	it('does NOT markdown-strip a front-matter title — nothing renders it, so the characters are literal', () => {
		// The heading path strips `*_\`` because that text IS rendered markdown. Applying the same
		// strip to a YAML scalar would silently rewrite a name the author typed.
		expect(titleFromSource('---\ntitle: Q4_final_v2\n---\n\n# Cover\n')).toBe('Q4_final_v2');
		expect(titleFromSource('---\ntitle: "*not emphasis*"\n---\n\n# Cover\n')).toBe('*not emphasis*');
		// …while the heading path still strips, unchanged.
		expect(titleFromSource('# **Q4** Wrap\n')).toBe('Q4 Wrap');
	});

	it('still caps the DISPLAY title at 60 chars — the switcher pill is the same pill', () => {
		const long = 'Project Falcon — the FY26 operating plan and capital allocation review'; // 70
		expect(titleFromSource(`---\ntitle: ${long}\n---\n\n# Cover\n`)).toHaveLength(60);
		expect(resolveTitle(`---\ntitle: ${long}\n---\n\n# Cover\n`)?.text).toBe(long); // …raw is uncapped
	});

	it('Rename rewrites the OVERRIDE and leaves the cover slide alone', () => {
		const out = retitleSource(OVERRIDDEN, 'Board pack — Q4 FY26 (v3)') ?? '';
		expect(titleFromSource(out)).toBe('Board pack — Q4 FY26 (v3)');
		expect(out).toContain('# Q4\n'); // the cover heading is untouched — the point of the override
		expect(headingText(out)).toBe('Q4');
	});

	it('Rename still rewrites the HEADING when there is no override — it never CREATES one', () => {
		const out = retitleSource(COVER, 'Q4 Wrap') ?? '';
		expect(out).toBe('<!-- _class: title -->\n\n# Q4 Wrap\n\nbody');
		expect(out).not.toContain('title:'); // renaming a plain deck must not silently grow front matter
	});

	it('a title containing quotes or a backslash round-trips through the front matter losslessly', () => {
		// setFrontMatter quotes + escapes; unquote decodes. Without a real round-trip the
		// backslashes compound on every rename (front-matter.ts documents this).
		const tricky = 'The "final" final \\ pack';
		let src = retitleSource(OVERRIDDEN, tricky) ?? '';
		expect(resolveTitle(src)?.text).toBe(tricky);
		src = retitleSource(src, tricky) ?? src; // …and again — no compounding
		expect(resolveTitle(src)?.text).toBe(tricky);
	});

	it('a multi-line title cannot break out of the front-matter block', () => {
		const out = retitleSource(OVERRIDDEN, 'A\n---\n\n# Injected') ?? '';
		expect(resolveTitle(out)?.text).toBe('A --- # Injected');
		// Exactly the two delimiters of the one block — no third `---` opening a slide.
		expect(out.match(/^---$/gm)).toHaveLength(2);
	});

	it('the override drives the DECK LIST, not just the resolver', () => {
		const deck = createDeck('Untitled deck');
		saveSource(deck.id, `---\ntitle: Board pack — Q4\n---\n\n# Q4\n\nbody`);
		expect(loadDeckList().find((d) => d.id === deck.id)?.title).toBe('Board pack — Q4');
	});

	// ── Rename must SPLICE the `title:` line, never rebuild the block ──────────────────
	// Every case below was found by the adversarial trio against the first cut, which routed
	// this path through `setFrontMatter`. That rebuilds the whole block through parseFm/emitFm,
	// so it silently dropped everything the grammar does not model and normalized what it did.
	describe('Rename preserves the rest of the front matter byte-for-byte', () => {
		const rename = (src: string, to = 'New Name') => retitleSource(src, to) ?? '';

		it('preserves CRLF — a Windows-authored deck does not come back mixed-EOL', () => {
			// #1248 built `lineEnd` precisely so Rename could not convert a CRLF line to LF; the
			// first cut of the override bypassed it and produced an LF block with a CRLF body.
			const src = '---\r\ntitle: Old Name\r\nsize: 16:9\r\n---\r\n\r\n<!-- _class: title -->\r\n\r\n# Q4\r\n\r\nbody\r\n';
			const out = rename(src);
			// The value is quoted exactly as `setFrontMatter` would quote it — one convention, not two.
			expect(out).toBe('---\r\ntitle: "New Name"\r\nsize: 16:9\r\n---\r\n\r\n<!-- _class: title -->\r\n\r\n# Q4\r\n\r\nbody\r\n');
			expect(out).not.toMatch(/[^\r]\n/); // no bare LF anywhere — line endings uniform
		});

		it('keeps YAML comments, key order, and every key the parser grammar does not model', () => {
			const src = [
				'---',
				'# author note about this deck',
				'title: Old',
				'theme: indaco',
				'_class: lead', // leading underscore: the ENGINE accepts it, parseFm's grammar does not
				'style: |',
				'  section { color: red; }',
				'tags: [alpha, beta]',
				'---',
				'',
				'# Q4',
				'',
			].join('\n');
			const out = rename(src);
			expect(out).toContain('# author note about this deck'); // comment survives
			expect(out).toContain('_class: lead'); // underscore key survives
			expect(out).toContain('style: |\n  section { color: red; }'); // block scalar + its lines survive
			expect(out).toContain('tags: [alpha, beta]'); // flow sequence not stringified
			expect(out).toBe(src.replace('title: Old', 'title: "New Name"')); // …and NOTHING else moved
		});

		it('preserves a nested block and does not reorder around it', () => {
			const src = '---\ntitle: Old\nfinish-override:\n  backdrop:\n    strength: 0.4\nsize: wide\n---\n\n# Q4\n';
			expect(rename(src)).toBe(src.replace('title: Old', 'title: "New Name"'));
		});

		it('rewrites only the FIRST `title:`, and leaves a duplicate key alone', () => {
			// getFrontMatter reads the first; the writer must target that same line rather than
			// collapsing the block (which silently deleted the author's second key).
			const src = '---\ntitle: First\nsize: wide\ntitle: Second\n---\n\n# Cover\n';
			const out = rename(src);
			expect(out).toBe('---\ntitle: "New Name"\nsize: wide\ntitle: Second\n---\n\n# Cover\n');
		});

		it('does NOT strip a leading `#` on the front-matter path — the scalar is literal', () => {
			// The `#` strip is a HEADING concern (it stops a prefilled `# Title` doubling). Applied
			// here it renamed the deck to something other than what the user typed, and made the
			// no-op guard non-convergent.
			const src = '---\ntitle: Old\n---\n\n# Cover\n';
			expect(resolveTitle(rename(src, '#1 Priority'))?.text).toBe('#1 Priority');
			expect(storedTitleFor(src, '#1 Priority')).toBe('#1 Priority');
			// …while the heading path still strips it.
			expect(storedTitleFor('# Cover\n', '#1 Priority')).toBe('1 Priority');
			expect(retitleSource('# Cover\n', '#1 Priority')).toBe('# 1 Priority\n');
		});

		it('an INDENTED `title:` is not a directive — it names nothing and is never written to', () => {
			// An earlier cut of this change accepted it, on the reasoning that `parseFm` matches the
			// trimmed line so the writer must follow the reader. The red team showed where that
			// leads: the continuation of a folded scalar becomes both the deck's name AND Rename's
			// write target. A real top-level directive sits at column 0; both halves now require it.
			const src = '---\ntheme: indaco\n  title: sneaky\n---\n\n# Cover\n';
			expect(resolveTitle(src)).toEqual({ text: 'Cover', from: 'heading' });
			expect(rename(src)).toBe('---\ntheme: indaco\n  title: sneaky\n---\n\n# New Name\n');
		});

		it('writeFrontMatterLine CREATES the key losslessly — the path Rename never takes', () => {
			// The trio's blocker: Rename never creates `title:`, so the FIRST write to it is always
			// the Deck-name control. Routing that through `setFrontMatter` shredded the block, which
			// meant the splice only ever protected decks already damaged once.
			const rich = ['---', '# author note — keep me', 'theme: indaco', '_class: lead', 'style: |', '  section { color: red; }', 'tags: [alpha, beta]', '---', '', '# Q4', ''].join('\n');
			const out = writeFrontMatterLine(rich, 'title', 'Board pack');
			expect(out).toContain('# author note — keep me');
			expect(out).toContain('_class: lead');
			expect(out).toContain('style: |\n  section { color: red; }');
			expect(out).toContain('tags: [alpha, beta]');
			expect(out).toBe(rich.replace('\n---\n\n# Q4', '\ntitle: "Board pack"\n---\n\n# Q4'));
			expect(resolveTitle(out)).toEqual({ text: 'Board pack', from: 'front-matter' });
		});

		it('CREATING a name on a deck whose leading `---` is a slide SEPARATOR does not eat slide 1', () => {
			// FM_RE cannot tell a separator from front matter, so the whole-block rebuild deleted the
			// swallowed slide outright — verified on the real Studio by two lenses.
			const src = '---\n\n<!-- _class: title -->\n\n# Cover slide\n\nRevenue up 12 percent.\n\n---\n\n# Second slide\n';
			const out = writeFrontMatterLine(src, 'title', 'Board pack');
			expect(out).toContain('# Cover slide');
			expect(out).toContain('Revenue up 12 percent.');
			expect(out).toContain('# Second slide');
		});

		it('CLEARING the name removes the line, keeps the block, and drops an empty block', () => {
			const src = '---\n# keep me\ntitle: Board pack\ntheme: indaco\n---\n\n# Q4\n';
			const cleared = writeFrontMatterLine(src, 'title', null);
			expect(cleared).toBe('---\n# keep me\ntheme: indaco\n---\n\n# Q4\n');
			// …and when the key was the only content, the block goes with it.
			expect(writeFrontMatterLine('---\ntitle: Solo\n---\n\n# Q4\n', 'title', null)).toBe('# Q4\n');
			// CRLF survives a create+clear round-trip.
			const crlf = '---\r\ntheme: indaco\r\n---\r\n\r\n# Q4\r\n';
			expect(writeFrontMatterLine(writeFrontMatterLine(crlf, 'title', 'X'), 'title', null)).toBe(crlf);
		});

		it('a `title:` inside a FOLDED SCALAR is not the deck name, and Rename will not write into it', () => {
			// parseFm matches the trimmed line, so an indented `title:` reads as a flat pair — which
			// made a continuation line both the deck's name and Rename's write target, rewriting the
			// author's `header:` value. The heading path has always refused to write into content it
			// doesn't own; the front-matter path now holds the same line (top-level only).
			const src = '---\nheader: >\n  title: folded\ntheme: x\n---\n\n# Real Cover\n';
			expect(resolveTitle(src)).toEqual({ text: 'Real Cover', from: 'heading' });
			expect(retitleSource(src, 'ZZ')).toBe('---\nheader: >\n  title: folded\ntheme: x\n---\n\n# ZZ\n');
		});

		it('the 60-char display cap lands on a CODE POINT boundary — no lone surrogate', () => {
			const src = `---\ntitle: ${'x'.repeat(59)}😀tail\n---\n\n# Cover\n`;
			const out = titleFromSource(src);
			expect([...out].length).toBeLessThanOrEqual(60); // 60 CHARACTERS, not UTF-16 units
			expect(/[\uD800-\uDBFF]$/.test(out)).toBe(false); // no dangling high surrogate
			expect([...out].every((ch) => ch.codePointAt(0) !== 0xfffd)).toBe(true);
		});

		it('AGREEMENT: for every deck shape, the spliced value is what the reader reads back', () => {
			// The drift guard. If frontMatterKeySpan and parseFm ever diverge, this fails.
			const shapes = [
				'---\ntitle: A\n---\n\n# H\n',
				'---\r\ntitle: A\r\nsize: wide\r\n---\r\n\r\n# H\r\n',
				'---\n# note\ntitle: A\ntheme: indaco\n---\n\n# H\n',
				'---\nfinish-override:\n  backdrop:\n    strength: 0.4\ntitle: A\n---\n\n# H\n',
				'---\ntitle: A\nlexicon:\n  "α": alpha\n---\n\n# H\n',
			];
			for (const shape of shapes) {
				for (const name of ['Board pack — Q4', 'The "final" \\ pack', 'plain', '#1 Priority']) {
					const out = retitleSource(shape, name) ?? '';
					expect(resolveTitle(out)).toEqual({ text: name, from: 'front-matter' });
					// and the body is untouched
					expect(out.slice(out.lastIndexOf('---') + 3)).toBe(shape.slice(shape.lastIndexOf('---') + 3));
				}
			}
		});
	});

	it('the pre-paint MIRROR carries the override, so a reload does not flash the cover heading', () => {
		// syncDerivedTitle is fed resolveTitle(src).text by the shell; the mirror is what
		// studio.astro paints before hydration. Feeding it the heading would show "Q4" for a deck
		// the author deliberately named something else, then snap on hydration.
		const deck = createDeck('Untitled deck');
		syncDerivedTitle(deck.id, resolveTitle(OVERRIDDEN)?.text ?? null);
		const row = JSON.parse(localStorage.getItem('lattice-studio-deck-index') ?? '[]').find((e: { id: string }) => e.id === deck.id);
		expect(row.derived).toBe('Board pack — Q4 FY26 (final)');
		expect(row.title).toBe('Untitled deck'); // the creation label still stays put
	});
});

describe('studio-store — the index label vs the derived mirror', () => {
	// The label is a CREATION record. Typing must never overwrite it: it is what the
	// demo dedupes its starter deck by, what the e2e specs locate that deck by, and the
	// only evidence a deck was ever explicitly named. (An earlier cut of this change
	// overwrote it on every save — silently, irreversibly, on the first keystroke.)
	it('typing a new heading refreshes the MIRROR and leaves the creation label alone', () => {
		const d = createDeck('My First Deck');
		saveSource(d.id, '# Q4 Board Update\n\nbody');
		syncDerivedTitle(d.id, headingText('# Q4 Board Update\n\nbody'));

		expect(loadDeckList().find((x) => x.id === d.id)?.title).toBe('Q4 Board Update'); // display tracks the heading
		expect(deckLabels().find((x) => x.id === d.id)?.label).toBe('My First Deck'); // …the label does not move
		const raw = JSON.parse(localStorage.getItem('lattice-studio-deck-index') ?? '[]') as { id: string; derived?: string }[];
		expect(raw.find((e) => e.id === d.id)?.derived).toBe('Q4 Board Update'); // the pre-paint shell's only source
	});

	it('syncDerivedTitle ignores a heading-less deck (nothing to mirror)', () => {
		const d = createDeck('Temp');
		syncDerivedTitle(d.id, headingText('no heading at all'));
		const raw = JSON.parse(localStorage.getItem('lattice-studio-deck-index') ?? '[]') as { id: string; derived?: string }[];
		expect(raw.find((e) => e.id === d.id)?.derived).toBeUndefined();
	});

	it('deckLabels finds a deck the author has since retitled — the demo-dedupe handle', () => {
		const d = createDeck('My First Deck');
		saveSource(d.id, '# Something Else Entirely\n\nbody');
		expect(loadDeckList().find((x) => x.id === d.id)?.title).toBe('Something Else Entirely');
		expect(deckLabels().filter((x) => x.label === 'My First Deck').map((x) => x.id)).toEqual([d.id]);
	});

	it('an explicit rename MOVES the label — so a renamed deck escapes the demo slot', () => {
		const d = createDeck('My First Deck');
		setDeckLabel(d.id, 'Acme board pack');
		expect(deckLabels().filter((x) => x.label === 'My First Deck')).toEqual([]);
	});
});

describe('studio-store — built-in deck titles (drift gate)', () => {
	// A deck is named by its first heading, so a built-in's DECLARED title is only the
	// seed/fallback for the index — if the two drift apart, the switcher silently shows
	// one name while the deck's cover slide says another. Pin them together here.
	it('every built-in deck\'s declared title IS its first heading', () => {
		for (const d of DECKS) expect(titleFromSource(deckSource(d))).toBe(d.title);
	});
});

describe('studio-store — settings', () => {
	it('defaults then round-trips', () => {
		expect(loadSettings()).toMatchObject({ validation: true, pageNumbers: true, headerFooter: false, posture: 'read' });
		saveSettings({ pageNumbers: false });
		expect(loadSettings().pageNumbers).toBe(false);
		expect(loadSettings().validation).toBe(true); // untouched keys keep defaults
	});

	it('derives the boot posture across the three populations, and drops the legacy flag', () => {
		// (1) A legacy engaged user (onboarded:true) reached the full surface → keep it → Build.
		localStorage.setItem('lattice-studio-settings', JSON.stringify({ onboarded: true }));
		expect(loadSettings().posture).toBe('build');
		// The retired flag is not re-persisted — no stale second source of truth beside posture.
		saveSettings({ pageNumbers: false });
		expect('onboarded' in JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}')).toBe(false);
		// (2) Prior Studio use but no full surface (a saved deck index) → the calm middle → Write.
		localStorage.clear();
		localStorage.setItem('lattice-studio-deck-index', JSON.stringify([{ id: 'x', title: 'X', builtin: true }]));
		expect(loadSettings().posture).toBe('write');
		// (3) A true first visit (nothing stored) → the gentlest home → Read.
		localStorage.clear();
		expect(loadSettings().posture).toBe('read');
	});

	it('seeds language from the browser the first time, then honors the saved pick', () => {
		// No saved value → detected (jsdom navigator resolves to a supported code).
		const seeded = loadSettings().language;
		expect(typeof seeded).toBe('string');
		expect(seeded.length).toBeGreaterThan(0);
		// An explicit pick persists and overrides detection on later reads.
		saveSettings({ language: 'en-GB' });
		expect(loadSettings().language).toBe('en-GB');
		// And it survives an unrelated settings write (no re-detect clobber).
		saveSettings({ validation: false });
		expect(loadSettings().language).toBe('en-GB');
	});
});

describe('studio-store — standing instructions', () => {
	it('round-trips a raw (non-JSON) string, empty by default', () => {
		expect(loadInstructions()).toBe('');
		saveInstructions('Be terse.');
		expect(loadInstructions()).toBe('Be terse.');
		// Stored verbatim — the format the drawer has always written.
		expect(localStorage.getItem('lattice-studio-instructions')).toBe('Be terse.');
	});
});

describe('studio-store — on-device standing instructions (separate + capped)', () => {
	it('round-trips independently of the cloud field, under its own key', () => {
		expect(loadOnDeviceInstructions()).toBe('');
		saveInstructions('Cloud voice.');
		saveOnDeviceInstructions('Short local note.');
		expect(loadInstructions()).toBe('Cloud voice.');
		expect(loadOnDeviceInstructions()).toBe('Short local note.');
		expect(localStorage.getItem('lattice-studio-ondevice-instructions')).toBe('Short local note.');
	});

	it('caps what is saved at ON_DEVICE_INSTRUCTIONS_MAX characters', () => {
		const long = 'x'.repeat(ON_DEVICE_INSTRUCTIONS_MAX + 50);
		saveOnDeviceInstructions(long);
		expect(loadOnDeviceInstructions().length).toBe(ON_DEVICE_INSTRUCTIONS_MAX);
	});

	it('also caps on READ — a value written before the cap existed (or restored raw) never injects an oversized block', () => {
		const long = 'y'.repeat(ON_DEVICE_INSTRUCTIONS_MAX + 200);
		localStorage.setItem('lattice-studio-ondevice-instructions', long); // bypass saveOnDeviceInstructions
		expect(loadOnDeviceInstructions().length).toBe(ON_DEVICE_INSTRUCTIONS_MAX);
	});

	// Red-team finding: a plain `.slice(0, N)` counts UTF-16 CODE UNITS, so a value
	// ending on an astral-plane character (any emoji, e.g. 😀 = 2 units) right at the
	// boundary gets split mid-character — the last unit becomes a lone surrogate
	// (U+FFFD once re-encoded), a silent, invisible-to-the-author corruption.
	it('caps at a Unicode CODE POINT boundary, never splitting a surrogate pair', () => {
		const long = `${'x'.repeat(ON_DEVICE_INSTRUCTIONS_MAX - 1)}😀extra`; // emoji straddles the boundary
		saveOnDeviceInstructions(long);
		const saved = loadOnDeviceInstructions();
		// The emoji (2 UTF-16 units) is kept whole — the cap lands one code point
		// short of the naive unit count, not mid-surrogate. (A valid emoji legitimately
		// contains surrogate-range code units in a PAIR; `isWellFormed` is the actual
		// "no lone/broken surrogate" check — a bare regex for the range would false-
		// positive on every correctly-paired astral character.)
		expect(saved).toBe(`${'x'.repeat(ON_DEVICE_INSTRUCTIONS_MAX - 1)}😀`);
		expect(saved.isWellFormed()).toBe(true);
		expect(Array.from(saved).length).toBe(ON_DEVICE_INSTRUCTIONS_MAX);
	});

	it('truncateCodePoints: a plain slice would have split the pair; this does not', () => {
		const s = `${'a'.repeat(9)}😀`; // 11 UTF-16 units, 10 code points
		expect(s.length).toBe(11); // the naive (wrong) unit count
		expect(s.slice(0, 10)).not.toBe(s); // .slice(0,10) WOULD cut the emoji in half
		expect(truncateCodePoints(s, 10)).toBe(s); // code-point-safe: all 10 chars fit whole
		expect(truncateCodePoints(s, 9)).toBe('a'.repeat(9)); // drops the whole emoji, not half of it
	});
});

describe('studio-store — workspace backup carries both instruction fields', () => {
	it('exports and restores the on-device field alongside the cloud one', () => {
		saveInstructions('Cloud voice.');
		saveOnDeviceInstructions('Local note.');
		const snapshot = exportStudioState();
		expect(snapshot.instructions).toBe('Cloud voice.');
		expect(snapshot.onDeviceInstructions).toBe('Local note.');

		localStorage.clear();
		expect(loadOnDeviceInstructions()).toBe('');
		importStudioState(snapshot, 1000);
		expect(loadInstructions()).toBe('Cloud voice.');
		expect(loadOnDeviceInstructions()).toBe('Local note.');
	});

	it('a pre-split backup with no onDeviceInstructions field restores to empty, never throws', () => {
		saveOnDeviceInstructions('stale local note');
		const legacy = exportStudioState();
		// @ts-expect-error — simulating a backup file from before this field existed.
		delete legacy.onDeviceInstructions;
		expect(() => importStudioState(legacy, 2000)).not.toThrow();
		expect(loadOnDeviceInstructions()).toBe('');
	});
});

describe('studio-store — Privacy & Data (clearAllDecks / deckContentStats)', () => {
	it('deckContentStats counts the deck index and grows with edited content', () => {
		const before = deckContentStats();
		expect(before.count).toBe(DECKS.length);
		const d = createDeck('Extra');
		saveSource(d.id, '# Extra\n\nbody');
		saveCheckpoint(d.id, '# Extra v1', 'first', 1000);
		saveChat(d.id, [{ role: 'user', content: 'hi' }]);
		const after = deckContentStats();
		expect(after.count).toBe(DECKS.length + 1);
		expect(after.bytes).toBeGreaterThan(before.bytes);
	});

	it('clearAllDecks wipes every deck\'s content and resets the index to the built-in seed', () => {
		const d = createDeck('Temp');
		saveSource(d.id, '# Temp\n\nbody');
		saveCheckpoint(d.id, '# Temp v1', 'first', 1000);
		saveChat(d.id, [{ role: 'user', content: 'hi' }]);
		saveChatDraft(d.id, 'unsent thought');
		// A built-in deck carrying local edits should also lose its override.
		saveSource(DECKS[0].id, '# Edited built-in');

		clearAllDecks();

		const list = loadDeckList();
		expect(list.map((x) => x.id)).toEqual(DECKS.map((x) => x.id)); // back to the built-in seed only
		expect(loadSource(DECKS[0].id)).toBeNull(); // the built-in's edit is gone too
		expect(loadCheckpoints(d.id)).toEqual([]);
		expect(loadChatDraft(d.id)).toBe('');
		expect(deckContentStats().count).toBe(DECKS.length);
	});

	it('clearAllDecks leaves settings and standing instructions untouched (data, not preferences)', () => {
		saveSettings({ headerFooter: true });
		saveInstructions('Board voice.');
		clearAllDecks();
		expect(loadSettings().headerFooter).toBe(true);
		expect(loadInstructions()).toBe('Board voice.');
	});

	it('deleteDeck also clears the deck\'s checkpoints, chat, and chat draft (previously left orphaned — a red-team/checker finding)', () => {
		const d = createDeck('Temp2');
		saveCheckpoint(d.id, '# Temp2 v1', 'first', 1000);
		saveChat(d.id, [{ role: 'user', content: 'hi' }]);
		saveChatDraft(d.id, 'unsent draft');
		addComment(d.id, 1, 'a comment');

		deleteDeck(d.id);

		expect(loadCheckpoints(d.id)).toEqual([]);
		expect(loadChat(d.id)).toEqual([]);
		expect(loadChatDraft(d.id)).toBe('');
		expect(listComments(d.id)).toEqual([]);
	});

	it('clearAllDecks sweeps ORPHANED sidecar keys too — content a deck no longer in the index left behind (the pre-fix deleteDeck gap; "Delete Everything" must not leave this)', () => {
		// Simulate exactly what the pre-fix deleteDeck() left behind: checkpoint/
		// chat/chat-draft/comment keys for an id that is NOT (or no longer) in the
		// deck index. These helpers write straight to localStorage regardless of
		// index membership, so this reproduces the orphan without needing a real
		// stale deleteDeck build.
		saveCheckpoint('orphan-1', '# Orphan v1', 'first', 1000);
		saveChat('orphan-1', [{ role: 'user', content: 'hi' }]);
		saveChatDraft('orphan-1', 'unsent');
		addComment('orphan-1', 1, 'leftover comment');
		expect(loadCheckpoints('orphan-1').length).toBeGreaterThan(0);
		expect(loadChatDraft('orphan-1')).toBe('unsent');
		expect(listComments('orphan-1').length).toBeGreaterThan(0);

		clearAllDecks();

		expect(loadCheckpoints('orphan-1')).toEqual([]);
		expect(loadChat('orphan-1')).toEqual([]);
		expect(loadChatDraft('orphan-1')).toBe('');
		expect(listComments('orphan-1')).toEqual([]);
	});

	it('clearAllDecks fires DECKS_CLEARED_EVENT — the live editor (StudioShell) listens for this to stop autosaving a just-cleared deck', () => {
		const seen: string[] = [];
		const onCleared = () => seen.push('fired');
		window.addEventListener(DECKS_CLEARED_EVENT, onCleared);
		try {
			clearAllDecks();
		} finally {
			window.removeEventListener(DECKS_CLEARED_EVENT, onCleared);
		}
		expect(seen).toEqual(['fired']);
	});
});

describe('studio-store — last-active deck (boot where you left off)', () => {
	it('round-trips the active deck + slide, clamping a negative index to 0', () => {
		expect(loadActiveDeck()).toBeNull();
		saveActiveDeck('q3-board', 3);
		expect(loadActiveDeck()).toEqual({ deckId: 'q3-board', slideIndex: 3 });
		saveActiveDeck('q3-board', -5);
		expect(loadActiveDeck()).toEqual({ deckId: 'q3-board', slideIndex: 0 });
	});

	it('a malformed active record reads back as null (never throws)', () => {
		localStorage.setItem('lattice-studio-active', '{"deckId":""}'); // empty id
		expect(loadActiveDeck()).toBeNull();
		localStorage.setItem('lattice-studio-active', 'not json');
		expect(loadActiveDeck()).toBeNull();
	});

	it('loadBootDeck returns the last-active deck when it still exists, else the first', () => {
		// No pointer → first deck (the historical behavior).
		expect(loadBootDeck().id).toBe(DECKS[0].id);
		// A pointer at a real built-in → that deck boots.
		saveActiveDeck('q3-board', 2);
		expect(loadBootDeck().id).toBe('q3-board');
		expect(loadBootSlide()).toBe(2);
		// A pointer at a user deck → that deck boots.
		const d = createDeck('Working deck');
		saveActiveDeck(d.id, 1);
		expect(loadBootDeck().id).toBe(d.id);
	});

	it('a dangling pointer (deck no longer in the list) falls back to the first deck + slide 0', () => {
		saveActiveDeck('does-not-exist', 4);
		expect(loadBootDeck().id).toBe(DECKS[0].id);
		expect(loadBootSlide()).toBe(0); // slide only restored when the pointer matches the boot deck
	});

	it('deleteDeck forgets a pointer that names the deleted deck (no dangling boot target)', () => {
		const d = createDeck('Temp active');
		saveActiveDeck(d.id, 2);
		deleteDeck(d.id);
		expect(loadActiveDeck()).toBeNull();
		expect(loadBootDeck().id).toBe(DECKS[0].id);
	});

	it('deleteDeck keeps a pointer that names a DIFFERENT deck', () => {
		const keep = createDeck('Keep');
		const drop = createDeck('Drop');
		saveActiveDeck(keep.id, 1);
		deleteDeck(drop.id);
		expect(loadActiveDeck()).toEqual({ deckId: keep.id, slideIndex: 1 });
	});

	it('clearAllDecks removes the active pointer (it is deck content state)', () => {
		saveActiveDeck('q3-board', 1);
		clearAllDecks();
		expect(loadActiveDeck()).toBeNull();
	});

	// Maker-checker Finding 1: the boot resolver's membership must match studio.astro's
	// inline `isKnown` EXACTLY, or the instant-shell paints a deck the app doesn't boot
	// (a wrong-deck flash). loadDeckList()=loadIndex() is the PERSISTED index when one
	// exists — a built-in DELETED from it is NOT a boot target. studio.astro mirrors this
	// by gating its all-built-ins fallback on an empty index. This pins that contract.
	it('a built-in absent from a PERSISTED index is not a valid boot target (guards the astro parity)', () => {
		// A saved index that omits the built-in `q3-board` (e.g. it was deleted), plus an
		// active pointer that still names it (a stale cross-tab write).
		localStorage.setItem('lattice-studio-deck-index', JSON.stringify([{ id: 'welcome', title: 'Welcome to Lattice', builtin: true }]));
		saveActiveDeck('q3-board', 2);
		// Not in the persisted list → falls back to index[0], NOT the deleted built-in.
		expect(loadBootDeck().id).toBe('welcome');
		expect(loadBootSlide()).toBe(0);
	});

	it('a built-in IS a valid boot target when NO index is persisted (the switched-to-before-any-mutation case)', () => {
		// No persisted index → loadIndex() seeds from all built-ins, so a switched-to
		// built-in boots. studio.astro accepts it via BD in exactly this (idx empty) case.
		expect(localStorage.getItem('lattice-studio-deck-index')).toBeNull();
		saveActiveDeck('q3-board', 1);
		expect(loadBootDeck().id).toBe('q3-board');
		expect(loadBootSlide()).toBe(1);
	});
});

describe('studio-store — chat draft (Architect no-lost-work)', () => {
	it('round-trips a per-deck draft so a closed panel keeps the unsent text', () => {
		expect(loadChatDraft('deck-a')).toBe('');
		saveChatDraft('deck-a', 'tighten slide 3');
		expect(loadChatDraft('deck-a')).toBe('tighten slide 3');
		// Drafts are isolated per deck — switching decks never bleeds the text.
		expect(loadChatDraft('deck-b')).toBe('');
	});
	it('clears the stored key when the draft goes empty (sent / erased)', () => {
		saveChatDraft('deck-a', 'half a thought');
		saveChatDraft('deck-a', '');
		expect(loadChatDraft('deck-a')).toBe('');
		expect(localStorage.getItem('lattice-studio-chatdraft-deck-a')).toBeNull();
	});
});
