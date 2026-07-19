import { describe, expect, it } from 'vitest';
import type { Finding } from '../architect';
import { assessDeck, countSlides, hasContent, hasFencedSeparator, rankFindings, structureCheck, theAsk, topFixes, weakestSlide } from './coach-core';

const f = (severity: string, message: string, slide?: number): Finding => ({ severity, message, slide, rule: 'r' }) as Finding;

describe('hasContent — the empty-deck guard (K1: never fabricate a grade)', () => {
	it('is false for blank / whitespace / separators-only / prose-only', () => {
		expect(hasContent('')).toBe(false);
		expect(hasContent('   \n  ')).toBe(false);
		expect(hasContent('---\n---\n---')).toBe(false);
		expect(hasContent('hello')).toBe(false);
	});
	it('is true only with a classed slide and more than one chunk', () => {
		expect(hasContent('<!-- _class: title -->\n# Hi\n\n---\n\n<!-- _class: statement -->\n## Point')).toBe(true);
	});
});

describe('assessDeck', () => {
	it('returns a content-false assessment (NOT a grade) for an empty deck', async () => {
		const a = await assessDeck('', { names: ['title'] });
		expect(a.hasContent).toBe(false);
		expect(a.scorecard).toBeNull();
		expect(a.findings).toEqual([]);
	});
	it('still produces a REAL review-based grade for a content deck without a vocabulary', async () => {
		// No lint vocab → lint findings are skipped, but the review layer + scorecard still
		// run (a lint-less grade is degraded, not fabricated). The empty-deck K1 guard above
		// is what prevents a fake grade — not the vocab.
		const a = await assessDeck('<!-- _class: title -->\n# Hi\n\n---\n\n## Two', null);
		expect(a.hasContent).toBe(true);
		expect(a.scorecard).not.toBeNull();
		expect(typeof a.scorecard?.band).toBe('string');
	});
});

describe('hasFencedSeparator — K3 guard (--- inside a code fence)', () => {
	it('detects a --- inside a ``` block', () => {
		expect(hasFencedSeparator('<!-- _class: code -->\n```yaml\nname: app\n---\nenv: prod\n```')).toBe(true);
	});
	it('detects a --- inside a ~~~ block', () => {
		expect(hasFencedSeparator('~~~md\nfront\n---\nback\n~~~')).toBe(true);
	});
	it('is false for a real slide separator', () => {
		expect(hasFencedSeparator('# A\n\n---\n\n# B')).toBe(false);
	});
});

describe('rankFindings + chips', () => {
	const findings = [f('suggestion', 'tighten lead', 2), f('error', 'unknown class', 4), f('warning', 'dense slide', 4)];
	it('ranks by severity then slide', () => {
		expect(rankFindings(findings).map((x) => x.severity)).toEqual(['error', 'warning', 'suggestion']);
	});
	it('topFixes leads with the severest and jumps to its slide', () => {
		const card = topFixes(findings);
		expect(card.body[0]).toContain('unknown class');
		expect(card.jump).toBe(4);
	});
	it('topFixes celebrates a clean deck', () => {
		expect(topFixes([]).body[0]).toContain('Nothing flagged');
	});
	it('weakestSlide picks the slide carrying the most severity-weight', () => {
		const card = weakestSlide(findings);
		expect(card.jump).toBe(4); // slide 4: error(3)+warning(2)=5 > slide 2: suggestion(1)
	});
	it('countSlides ignores front matter', () => {
		expect(countSlides('---\ntitle: x\n---\n# A\n\n---\n\n# B')).toBe(2);
	});
	it('theAsk recognizes a decision slide', async () => {
		expect((await theAsk('<!-- _class: decision -->\n# Approve X')).body[0]).toContain('decision slide');
	});
	it('structureCheck reports opening/ask/close presence', async () => {
		const card = await structureCheck('<!-- _class: title -->\n# Open\n\n---\n\n<!-- _class: decision -->\n# Approve');
		expect(card.body[0]).toContain('Opening');
		expect(card.body).toHaveLength(3);
	});
});
