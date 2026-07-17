import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { TRANSFORMERS } from '@lexical/markdown';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import type { Klass, LexicalNode } from 'lexical';

// The Lattice ⟷ Lexical bridge for the Compose editing mode (the rich-markdown
// surface, Option B). Promoted from the /proto spike into the real Studio. Compose
// owns PROSE — headings, bold/italic, lists, blockquote, inline code, links; a
// slide's `<!-- _class -->` (and sibling `<!-- _x -->`) directives are NEVER typed —
// they're split off, preserved, and re-emitted on compile (splitSlideDirectives /
// composeSlideChunk). NOTE (known limit, tracked): the default list transformer
// flattens nested-list indentation, so a structured slide's `- ` detail lines don't
// yet round-trip losslessly — a custom nested-list transformer is the next slice.

export const COMPOSE_NODES: ReadonlyArray<Klass<LexicalNode>> = [
	HeadingNode,
	QuoteNode,
	ListNode,
	ListItemNode,
	CodeNode,
	CodeHighlightNode,
	LinkNode,
];

export const COMPOSE_TRANSFORMERS = TRANSFORMERS;

// A per-slide directive comment line — `<!-- _class: content -->`, `_paginate`,
// `_header`, … Everything that opens `<!-- _`. Structure, never prose.
const DIRECTIVE_LINE_RE = /^[ \t]*<!--\s*_[A-Za-z][\w-]*:[\s\S]*?-->[ \t]*$/gm;

export type SlideChunk = { directives: string[]; prose: string };

/** Split one slide chunk into its preserved directive lines and the prose body the
 *  rich editor owns. The author never sees or types a directive comment. */
export function splitSlideDirectives(chunk: string): SlideChunk {
	const directives: string[] = [];
	const prose = chunk
		.replace(DIRECTIVE_LINE_RE, (line) => {
			directives.push(line.trim());
			return '';
		})
		.replace(/^\s+/, '')
		.trimEnd();
	return { directives, prose };
}

/** Re-assemble a slide chunk from its preserved directives + the edited prose. */
export function composeSlideChunk(directives: string[], prose: string): string {
	const head = directives.join('\n');
	const body = prose.trim();
	if (!head) return body;
	return body ? `${head}\n\n${body}` : head;
}

/** The `_class` component name of a slide chunk (first token), for the break label. */
export function slideClassOf(directives: string[]): string {
	for (const d of directives) {
		const m = d.match(/<!--\s*_class:\s*([A-Za-z0-9-]+)/);
		if (m) return m[1];
	}
	return 'content';
}

// Lexical theme → classnames (styled in ComposeSurface's scoped stylesheet).
export const COMPOSE_THEME = {
	paragraph: 'cs-p',
	heading: { h1: 'cs-h1', h2: 'cs-h2', h3: 'cs-h3', h4: 'cs-h4' },
	quote: 'cs-quote',
	list: { ul: 'cs-ul', ol: 'cs-ol', listitem: 'cs-li', nested: { listitem: 'cs-li-nested' } },
	text: { bold: 'cs-bold', italic: 'cs-italic', code: 'cs-code', strikethrough: 'cs-strike' },
	code: 'cs-codeblock',
	link: 'cs-link',
};
