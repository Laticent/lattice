import { describe, expect, it } from 'vitest';
import { lineOffsetIn, plainLine } from './caret-line';

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
