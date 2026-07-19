// On-brand, zero-new-dep syntax highlighting for chat code blocks.
//
// We reuse the lezer highlighter the CodeMirror editor is already built on
// (`@lezer/highlight` + the `@codemirror/lang-*` grammars are existing deps — see
// docs/package.json), NOT highlight.js. `tokenize` parses a code string with the
// language's lezer parser and walks the tree with `highlightTree` + `classHighlighter`,
// returning flat {text, cls} tokens that COVER the whole string (gaps filled with a
// null class). The React `ChatCodeBlock` renders each token as an escaped text child,
// so nothing here produces HTML — the color is applied by mapping the lezer class to a
// palette var() (palette-blind, dark/light aware), never an injected stylesheet.

import { cssLanguage } from '@codemirror/lang-css';
import { htmlLanguage } from '@codemirror/lang-html';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { pythonLanguage } from '@codemirror/lang-python';
import { classHighlighter, highlightTree } from '@lezer/highlight';

export type CodeToken = { text: string; cls: string | null };

// A deck edit is Markdown, so an unlabeled block defaults to Markdown highlighting.
function parserFor(lang: string) {
	const l = (lang || '').toLowerCase();
	if (l === 'js' || l === 'jsx' || l === 'ts' || l === 'tsx' || l === 'javascript' || l === 'typescript') return javascriptLanguage.parser;
	if (l === 'json') return jsonLanguage.parser;
	if (l === 'css') return cssLanguage.parser;
	if (l === 'html' || l === 'xml' || l === 'svg') return htmlLanguage.parser;
	if (l === 'py' || l === 'python') return pythonLanguage.parser;
	if (l === '' || l === 'md' || l === 'markdown' || l === 'lattice' || l === 'deck' || l === 'text') return markdownLanguage.parser;
	return null; // unknown language → no highlight (plain, still escaped by React)
}

/** Flat, gap-filled tokens for `code`. Never throws — falls back to one plain token. */
export function tokenize(code: string, lang: string): CodeToken[] {
	const src = String(code ?? '');
	const parser = parserFor(lang);
	if (!parser || !src) return [{ text: src, cls: null }];
	try {
		const tree = parser.parse(src);
		const toks: CodeToken[] = [];
		let pos = 0;
		highlightTree(tree, classHighlighter, (from, to, cls) => {
			if (from > pos) toks.push({ text: src.slice(pos, from), cls: null });
			toks.push({ text: src.slice(from, to), cls });
			pos = to;
		});
		if (pos < src.length) toks.push({ text: src.slice(pos), cls: null });
		return toks.length ? toks : [{ text: src, cls: null }];
	} catch {
		return [{ text: src, cls: null }];
	}
}

// Map a lezer highlight class (space-separated `tok-*`) to a palette var(). Checked
// most-specific first; the same colors the editor's studioHighlight uses so the chat
// and the editor read as one language.
export function tokenColor(cls: string | null): string | undefined {
	if (!cls) return undefined;
	if (cls.includes('tok-comment')) return 'var(--text-muted)';
	if (cls.includes('tok-string')) return 'var(--chart-3, #2e6f00)';
	if (cls.includes('tok-number') || cls.includes('tok-bool') || cls.includes('tok-null') || cls.includes('tok-atom')) return 'var(--chart-2, #9c3f00)';
	if (cls.includes('tok-keyword')) return 'var(--accent)';
	if (cls.includes('tok-heading') || cls.includes('tok-tagName') || cls.includes('tok-typeName') || cls.includes('tok-className')) return 'var(--accent)';
	if (cls.includes('tok-propertyName') || cls.includes('tok-attributeName') || cls.includes('tok-variableName')) return 'var(--chart-2, #9c3f00)';
	if (cls.includes('tok-link') || cls.includes('tok-url')) return 'var(--accent)';
	if (cls.includes('tok-meta') || cls.includes('tok-punctuation') || cls.includes('tok-operator') || cls.includes('tok-processingInstruction')) return 'var(--text-muted)';
	if (cls.includes('tok-emphasis')) return 'var(--text-body)';
	return undefined;
}
