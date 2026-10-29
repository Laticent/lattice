// The reference fix engine, `edits` (design §7.3): declarative operations on spans, lowered to
// text edits. Always present in a ruleset. A code rule builds its fix with `editsFix()`.
//
// A declarative manifest's `fix` block (with templates) lowers to the same operations once the
// selector language lands (by M4); the operations themselves are what M1 builds.

import type { Edit, EngineContext, EngineSkip, Fix, FixEngine, Safety, Source, Span } from './types.js';

export type EditOp =
	/** Replace the span with `text`. */
	| { readonly op: 'replace'; readonly span: Span; readonly text: string }
	/** Replace a named part's span, such as a key's name (`rename: name`). Same edit as `replace`. */
	| { readonly op: 'rename'; readonly span: Span; readonly to: string }
	/** Remove the span. */
	| { readonly op: 'delete'; readonly span: Span }
	/** Remove the whole line holding the span, with its line ending. Guarded: see `deleteLine`. */
	| { readonly op: 'deleteLine'; readonly span: Span }
	| { readonly op: 'insertBefore'; readonly span: Span; readonly text: string }
	| { readonly op: 'insertAfter'; readonly span: Span; readonly text: string }
	/** Two insertions, atomic. */
	| { readonly op: 'wrap'; readonly span: Span; readonly before: string; readonly after: string };

export interface EditsPayload {
	readonly ops: readonly EditOp[];
}

/** Build a fix for the `edits` engine. Several ops make one atomic fix, applied in array order. */
export function editsFix(description: string, ops: EditOp | readonly EditOp[], safety: Safety = 'safe'): Fix<EditsPayload> {
	return { engine: 'edits', safety, description, payload: { ops: Array.isArray(ops) ? (ops as readonly EditOp[]) : [ops as EditOp] } };
}

function lineAround(text: string, span: Span): Span {
	const from = span.from === 0 ? 0 : text.lastIndexOf('\n', span.from - 1) + 1;
	const nl = text.indexOf('\n', Math.max(span.to - (span.to > span.from && text[span.to - 1] === '\n' ? 1 : 0), span.from));
	return { from, to: nl < 0 ? text.length : nl + 1 };
}

/**
 * The line delete, with the two guards a line needs because it is a coarser unit than a node:
 *
 * - It applies only when the span is alone on its line and the next line is not an indented
 *   continuation (a `style: |` block). Otherwise it skips as `not-alone`, because deleting the
 *   line would lose author text or orphan the block.
 * - When the line is the only content of the language's header (front matter), the whole header
 *   goes. An empty `---`/`---` block reads on to the next `---`, so it would turn the first slide
 *   into front matter: the bug PR #2947 fixed in Lattice's old fixer.
 */
export function deleteLine(text: string, span: Span, header: Span | null): Edit | EngineSkip {
	if (text.slice(span.from, span.to).replace(/\n$/, '').includes('\n')) return { skip: 'not-alone', detail: 'the span covers more than one line' };
	const line = lineAround(text, span);
	const body = text.slice(line.from, line.to).replace(/\n$/, '');
	const before = text.slice(line.from, span.from);
	const after = text.slice(span.to, line.from + body.length);
	if (/\S/.test(before) || /\S/.test(after) || span.to > line.from + body.length + 1) return { skip: 'not-alone', detail: 'the line holds more than the span' };
	const next = text.slice(line.to, text.indexOf('\n', line.to) < 0 ? text.length : text.indexOf('\n', line.to));
	const indent = (s: string) => (/^[ \t]*/.exec(s) as RegExpExecArray)[0].length;
	if (/\S/.test(next) && indent(next) > indent(body)) return { skip: 'not-alone', detail: 'the next line is an indented continuation' };
	if (header && line.from >= header.from && line.to <= header.to) {
		const open = lineAround(text, { from: header.from, to: header.from });
		const close = headerCloseLine(text, header);
		const inside = text.slice(open.to, close.from);
		const rest = inside.slice(0, line.from - open.to) + inside.slice(line.to - open.to);
		if (line.from >= open.to && line.to <= close.from && !/\S/.test(rest)) return { from: header.from, to: header.to, text: '' };
	}
	return { from: line.from, to: line.to, text: '' };
}

/** The header's last line: the closing delimiter. */
function headerCloseLine(text: string, header: Span): Span {
	const end = header.to > header.from && text[header.to - 1] === '\n' ? header.to - 1 : header.to;
	return lineAround(text, { from: Math.max(header.from, end - 1), to: Math.max(header.from, end - 1) });
}

export const editsEngine: FixEngine<EditsPayload> = {
	id: 'edits',
	toEdits(source: Source, fix: Fix<EditsPayload>, ctx: EngineContext): readonly Edit[] | EngineSkip | null {
		const out: Edit[] = [];
		const ops = fix.payload?.ops;
		if (!Array.isArray(ops)) return { skip: 'invalid-edit', detail: 'an edits fix needs payload.ops' };
		for (const o of ops) {
			switch (o.op) {
				case 'replace':
					out.push({ from: o.span.from, to: o.span.to, text: o.text });
					break;
				case 'rename':
					out.push({ from: o.span.from, to: o.span.to, text: o.to });
					break;
				case 'delete':
					out.push({ from: o.span.from, to: o.span.to, text: '' });
					break;
				case 'deleteLine': {
					const e = deleteLine(source.text, o.span, ctx.header);
					if ('skip' in e) return e;
					out.push(e);
					break;
				}
				case 'insertBefore':
					out.push({ from: o.span.from, to: o.span.from, text: o.text });
					break;
				case 'insertAfter':
					out.push({ from: o.span.to, to: o.span.to, text: o.text });
					break;
				case 'wrap':
					out.push({ from: o.span.from, to: o.span.from, text: o.before }, { from: o.span.to, to: o.span.to, text: o.after });
					break;
				default:
					return { skip: 'invalid-edit', detail: `unknown op '${(o as { op?: unknown }).op}'` };
			}
		}
		return out;
	},
};
