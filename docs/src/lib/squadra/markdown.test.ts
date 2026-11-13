import { describe, expect, it } from 'vitest';
import { BlockParser, deckModel } from '../segno-markdown/index';
import { compileRuleset, editsFix, fix, lint } from './index';
import { type MarkdownTree, markdownLanguage } from './markdown';
import type { CodeRule, Node } from './types';

// The reference Markdown language over the Segno deck model (design §5.6). The tests hand it the package's own
// CommonMark parser, as a host would hand in its configured one.
const parser = new BlockParser({});
const md = markdownLanguage({ model: (text) => deckModel(text, { parser }) });
const src = (text: string) => ({ path: 'a.md', text, language: 'markdown' });
const kinds = (n: Node): string[] => n.kids.map((k) => k.kind);

describe('markdown language', () => {
	it('reads front matter, slides, breaks and the blocks of each slide', () => {
		const text = '---\ntitle: x\n---\n# One\n\nBody text.\n\n---\n\n```js\ncode\n```\n\n<!-- note -->\n';
		const { tree } = md.parse(src(text));
		expect(kinds(tree)).toEqual(['front-matter', 'slide', 'break', 'slide']);
		const [, one, , two] = tree.kids;
		expect(kinds(one)).toEqual(['heading', 'paragraph']);
		expect(kinds(two)).toEqual(['fence', 'comment']);
		expect(text.slice(one.kids[0].from, one.kids[0].to)).toBe('# One');
		expect(two.kids[0].attrs?.info).toBe('js');
		expect(text.slice(two.kids[1].from, two.kids[1].to)).toBe('<!-- note -->');
	});

	it('marks fenced and indented code inert, and states the shape', () => {
		const text = 'Para\n\n```\nfenced\n```\n\n    indented\n';
		const s = src(text);
		const { tree } = md.parse(s);
		const inert = md.inert?.(tree, s) ?? [];
		expect(inert.map((r) => text.slice(r.from, r.to))).toEqual(['```\nfenced\n```', '    indented']);
		expect(md.shape(tree, s)).toEqual({ units: 1, header: null, inert: ['```\nfenced\n```', '    indented'] });
	});

	it('maps the model offsets back onto a CRLF source with a BOM', () => {
		const text = '﻿# A\r\n\r\ntext here\r\n\r\n---\r\n# B\r\n';
		const { tree } = md.parse(src(text));
		const slides = (tree as MarkdownTree).slideNodes;
		expect(slides).toHaveLength(2);
		const para = slides[0].kids.find((k) => k.kind === 'paragraph');
		expect(para && text.slice(para.from, para.to)).toBe('text here');
		const head = slides[1].kids[0];
		expect(text.slice(head.from, head.to)).toBe('# B');
	});

	it('locates a span by slide, and front matter as slide 0', () => {
		const text = '---\nk: v\n---\n# One\n\n---\n\n# Two\n';
		const { tree } = md.parse(src(text));
		expect(md.locate?.(tree, { from: 5, to: 6 })).toEqual({ slide: 0 });
		expect(md.locate?.(tree, { from: text.indexOf('# Two'), to: text.length })).toEqual({ slide: 2 });
	});

	it('runs a rule end to end: it fires on a heading, skips the fenced copy, and its fix converges', () => {
		const rule: CodeRule = {
			id: 'md/no-shout',
			language: 'markdown',
			severity: 'warning',
			summary: 'A heading in capitals.',
			examples: 'no-shout.md',
			fixable: true,
			budget: { ops: 10_000 },
			visit: {
				heading(node, ctx) {
					const t = ctx.text(node);
					if (/^#+ [A-Z ]+$/.test(t) && /[A-Z]{3}/.test(t)) {
						const span = { from: node.from, to: node.to };
						ctx.report({ span, message: 'Shouting.', fixes: [editsFix('Lower it.', { op: 'replace', span, text: t.replace(/[A-Z]+/g, (w) => w[0] + w.slice(1).toLowerCase()) })] });
					}
				},
			},
		};
		const examples = { 'no-shout.md': '````md bad\n⟦# LOUD⟧\n````\n````md fixed\n# Loud\n````\n````md good\n# Quiet\n\n```\n# LOUD\n```\n````\n' };
		const rs = compileRuleset({ name: 'md', version: '1', languages: [md], rules: [rule], examples });
		expect(lint(rs, [src('# LOUD\n\n```\n# LOUD\n```\n')]).findings.map((f) => f.start.line)).toEqual([1]);
		expect(fix(rs, src('# LOUD\n')).text).toBe('# Loud\n');
	});
});
