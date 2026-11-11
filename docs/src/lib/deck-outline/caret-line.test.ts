import { describe, expect, it } from 'vitest';
import { lineOffsetIn, plainColumnOf, plainLine, rawColumnFor } from './caret-line';

describe('the caret line carried between the editors', () => {
	it('reads a Markdown line and a Compose block as the same text', () => {
		expect(plainLine('## Revenue grew')).toBe('Revenue grew');
		expect(plainLine('- **Speed.** It renders fast.')).toBe('Speed. It renders fast.');
		expect(plainLine('  1. First point')).toBe('First point');
		expect(plainLine('> - [x] done `code`')).toBe('done code');
		expect(plainLine('Revenue grew')).toBe('Revenue grew');
	});

	it('finds the line inside the slide, and only inside it', () => {
		const src = '# Title\n\nIntro text\n\n---\n\n## Second\n\n- Point one\n- Point two\n';
		const second = src.indexOf('## Second');
		expect(lineOffsetIn(src, second, src.length, 'Point two')).toBe(src.indexOf('- Point two'));
		expect(lineOffsetIn(src, second, src.length, 'Intro text')).toBe(-1);
	});

	it('gives up on a line that is not there, is empty, or appears twice', () => {
		const src = '## A\n\n- same\n- same\n';
		expect(lineOffsetIn(src, 0, src.length, 'missing')).toBe(-1);
		expect(lineOffsetIn(src, 0, src.length, '')).toBe(-1);
		expect(lineOffsetIn(src, 0, src.length, 'same')).toBe(-1);
	});
});

describe('the caret column carried between the editors', () => {
	it('maps a column through block markers and emphasis, both ways', () => {
		const line = '- **Speed.** It renders fast.';
		// Plain: 'Speed. It renders fast.'; the caret before 'It' is plain column 7.
		expect(rawColumnFor(line, 7)).toBe(line.indexOf('It'));
		expect(plainColumnOf(line, line.indexOf('It'))).toBe(7);
		// Inside the bold run: before 'eed'.
		expect(rawColumnFor(line, 2)).toBe(line.indexOf('eed'));
		expect(plainColumnOf(line, line.indexOf('eed'))).toBe(2);
	});

	it('puts the caret at the line\'s text, not its markers, at the edges', () => {
		const line = '## Revenue grew';
		expect(rawColumnFor(line, 0)).toBe(3);
		expect(rawColumnFor(line, 99)).toBe(line.length);
		expect(plainColumnOf(line, 0)).toBe(0);
		expect(plainColumnOf(line, line.length)).toBe('Revenue grew'.length);
	});

	it('agrees with plainLine on every line it maps', () => {
		for (const l of ['> quoted *text*', '1. First `code` point', '  - [x] done ~~old~~', 'plain words']) {
			const p = plainLine(l);
			for (let c = 0; c <= p.length; c++) expect(plainColumnOf(l, rawColumnFor(l, c))).toBe(c);
		}
	});
});
