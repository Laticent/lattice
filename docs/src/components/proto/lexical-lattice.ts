// ISOLATED PROTOTYPE support — the Lattice ⟷ Lexical bridge for the Compose
// leg spike (/proto/compose). Kept OUT of the shipped Studio: this is a
// throwaway to let a non-markdown user (the "what is markdown?" test) build a
// slide by typing, and to PROVE whether real component content survives the
// round-trip (rich edit → back to Lattice markdown). Delete the proto/ files to
// revert; nothing in src/ imports this outside proto/.

import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { TRANSFORMERS } from '@lexical/markdown';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import type { Klass, LexicalNode } from 'lexical';

// The node set the editor registers. It MUST cover every node the markdown
// transformers can produce (heading/quote/list/code/link) or importing a
// skeleton that uses one throws. This is exactly the "custom syntax Lexical
// doesn't model" surface I flagged — for the prototype we stay inside the
// constructs @lexical/markdown round-trips cleanly and SHOW where a component
// falls outside them (the preview reveals it, because it renders the export).
export const LATTICE_NODES: ReadonlyArray<Klass<LexicalNode>> = [
	HeadingNode,
	QuoteNode,
	ListNode,
	ListItemNode,
	CodeNode,
	CodeHighlightNode,
	LinkNode,
];

// The transformer set. The default set handles the rich-markdown grammar the
// toolbar assembles — headings, bold/italic, bullet + numbered lists, blockquote,
// inline code, links, fenced code. The `<!-- _class -->` directive is never typed;
// it's a structured chip (see composeSlide). NOTE: nested-list fidelity (a KPI's
// indented detail lines) is the open serialization item — the default list
// transformer flattens indentation; a custom nested-list transformer is next.
export const LATTICE_TRANSFORMERS = TRANSFORMERS;

const CLASS_RE = /<!--\s*_class:\s*([^>]*?)\s*-->/;
// A per-slide directive comment: `<!-- _paginate: false -->`, `_header`, `_footer`,
// `_backgroundColor`, … Everything that starts `<!-- _`. These are STRUCTURE, not
// prose — they must never reach the rich-text editor (they leak as literal text),
// but we DO preserve them so the composed slide renders faithfully.
const DIRECTIVE_LINE_RE = /^[ \t]*<!--\s*_[A-Za-z][\w-]*:[\s\S]*?-->[ \t]*$/gm;

export type SkeletonParts = { cls: string | null; directives: string[]; body: string };

/** Split an insert skeleton into (1) the `_class` component, (2) its OTHER
 *  per-slide directive comments (kept, re-emitted verbatim), and (3) the prose
 *  body the rich-text editor owns. The user never sees or types any comment. */
export function splitSkeleton(skeleton: string): SkeletonParts {
	const clsMatch = skeleton.match(CLASS_RE);
	const cls = clsMatch ? clsMatch[1].trim() : null;
	// Pull every directive line out (including _class) — capture the non-_class
	// ones to re-emit; drop _class (managed as the component chip).
	const directives: string[] = [];
	const withoutDirectives = skeleton.replace(DIRECTIVE_LINE_RE, (line) => {
		if (!CLASS_RE.test(line)) directives.push(line.trim());
		return '';
	});
	const body = withoutDirectives.replace(/^\s+/, '').trimEnd();
	return { cls, directives, body };
}

/** Re-assemble a full Lattice slide from the picked component + its preserved
 *  directives + the prose the editor exported. ONE-WAY generation — we write the
 *  directive scaffold, so it is always well-formed regardless of the prose. */
export function composeSlide(componentName: string, directives: string[], body: string): string {
	const head = [`<!-- _class: ${componentName} -->`, ...directives].join('\n');
	const prose = body.trim();
	return `${head}\n\n${prose}\n`;
}

/** The Lexical theme → classnames (styled in compose.astro). Named for role. */
export const COMPOSE_THEME = {
	paragraph: 'ce-p',
	heading: { h1: 'ce-h1', h2: 'ce-h2', h3: 'ce-h3', h4: 'ce-h4' },
	quote: 'ce-quote',
	list: { ul: 'ce-ul', ol: 'ce-ol', listitem: 'ce-li', nested: { listitem: 'ce-li-nested' } },
	text: { bold: 'ce-bold', italic: 'ce-italic', code: 'ce-code', strikethrough: 'ce-strike' },
	code: 'ce-codeblock',
	link: 'ce-link',
};
