// @vitest-environment node
// A bare newline inside a paragraph is a line break on the slide (the engine runs markdown-it with `breaks: true`),
// so editing the paragraph must keep it a line break (followups.d/2846-p6).
import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { roundTripSlideProse } from './deck-markdown';
import { hasLossyConstruct, parseDeck } from './deck-source';

const rt = (md: string) => roundTripSlideProse(md).trimEnd();
const brs = (md: string) => (new MarkdownIt({ breaks: true }).render(md).match(/<br\s*\/?>/g) ?? []).length;
// This markdown-it has neither the engine's math rules nor its raw-HTML handling, so a `$$` block or a comment line would read
// as paragraph text here. Compose models both as blocks of their own; leave those slides to their own tests.
const MODELED_BLOCK = /^\s*(?:\$\$|<)/m;

describe('soft line breaks', () => {
	it('a paragraph keeps its newline', () => {
		expect(rt('line one\nline two\nline three')).toBe('line one\nline two\nline three');
	});
	it('a list item and a quote keep theirs, with the container prefix', () => {
		expect(rt('- first\n  second')).toBe('- first\n  second');
		expect(rt('> a\n> b')).toBe('> a\n> b');
	});
	it('a typed hard break still writes a backslash', () => {
		expect(rt('a\\\nb')).toBe('a\\\nb');
	});
	it('marks around a break survive', () => {
		expect(rt('**bold**\n*it*')).toBe('**bold**\n*it*');
	});
});

describe('soft breaks across the shipped decks', () => {
	const ROOT = path.resolve(__dirname, '../../../..');
	function mdIn(dir: string, out: string[] = []): string[] {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
			const full = path.join(dir, e.name);
			if (e.isDirectory()) mdIn(full, out);
			else if (e.name.endsWith('.md')) out.push(full);
		}
		return out;
	}
	const files = [
		...mdIn(path.join(ROOT, 'examples')),
		...mdIn(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.gallery.md')),
		...mdIn(path.join(ROOT, 'test/integration/baseline-decks')),
	];

	it('an unlocked slide renders as many <br> after a round trip as before', () => {
		let checked = 0;
		for (const file of files) {
			let slides: ReturnType<typeof parseDeck>['slides'];
			try {
				slides = parseDeck(fs.readFileSync(file, 'utf8')).slides;
			} catch {
				continue;
			}
			for (const s of slides) {
				if (hasLossyConstruct(s.prose) || MODELED_BLOCK.test(s.prose) || brs(s.prose) === 0) continue;
				checked++;
				expect(brs(roundTripSlideProse(s.prose)), path.relative(ROOT, file)).toBe(brs(s.prose));
			}
		}
		expect(checked).toBeGreaterThan(0); // anti-vacuity
	});
});
