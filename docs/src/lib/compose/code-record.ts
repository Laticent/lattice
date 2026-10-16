import type { Node as PMNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import { codeBlockAt } from './code-commands';
import { deckSchema } from './deck-doc';

// The `@code{…}` record of the caret's fence, as Compose holds it: a paragraph whose only content is
// one inline code span reading `@code{…}`, directly before the `code_block` it configures
// (lib/plugins/code/code.syntax.mjs reads the same shape; deck-markdown.ts `recordHugsFence` writes
// it back on the line above the fence). Pure: no DOM, no React. The words inside the record are
// changed by the engine's own writer (lib/plugins/code/shared/record-edit.js `editRecord`), never here,
// so this file only finds the record and puts a new one in its place.
// Design: engineering/decisions/2026-10-15-code-plugin.md §7 and §11.

/** A span is a record when it is exactly `@code{…}` (record.js `RECORD_RE`). */
const RECORD = /^@code\{[^`\n]*\}$/;

export interface FenceRecord {
	/** The record's text, `@code{…}`. */
	text: string;
	/** The paragraph's position in the document. */
	pos: number;
	node: PMNode;
}

/** The paragraph holding only a `@code{…}` span, or null. */
function recordOf(node: PMNode | null | undefined): string | null {
	if (!node || node.type !== deckSchema.nodes.paragraph || node.childCount !== 1) return null;
	const only = node.firstChild;
	if (!only?.isText || !only.marks.some((m) => m.type === deckSchema.marks.code)) return null;
	return RECORD.test(only.text ?? '') ? (only.text as string) : null;
}

/** The caret fence's record, or null when the fence has none (or the caret is not in a fence). */
export function fenceRecord(state: EditorState): FenceRecord | null {
	const block = codeBlockAt(state);
	if (!block) return null;
	const $block = state.doc.resolve(block.pos);
	const index = $block.index();
	if (index === 0) return null;
	const node = $block.parent.child(index - 1);
	const text = recordOf(node);
	return text === null ? null : { text, pos: block.pos - node.nodeSize, node };
}

/**
 * Put `text` (`@code{…}`) in as the caret fence's record: replacing the one it has, adding one
 * directly above the fence when it has none, or removing it when `text` is ''. False when the caret
 * is not in a fence or nothing would change. The caret stays in the fence: the transaction maps it.
 */
export function setFenceRecord(text: string): Command {
	return (state, dispatch) => {
		const block = codeBlockAt(state);
		if (!block) return false;
		if (text && !RECORD.test(text)) return false;
		const rec = fenceRecord(state);
		if ((rec?.text ?? '') === text) return false;
		if (!dispatch) return true;
		const tr = state.tr;
		if (rec && !text) tr.delete(rec.pos, rec.pos + rec.node.nodeSize);
		else if (rec) tr.replaceWith(rec.pos + 1, rec.pos + 1 + rec.node.content.size, deckSchema.text(text, [deckSchema.marks.code.create()]));
		else tr.insert(block.pos, deckSchema.nodes.paragraph.create(null, deckSchema.text(text, [deckSchema.marks.code.create()])));
		dispatch(tr.scrollIntoView());
		return true;
	};
}

/** A record's fields as the engine reads them (record.js `readBody`). Line targets are Sets. */
export interface CodeRecordFields {
	title?: string;
	numbers?: boolean;
	start?: number;
	focus?: Set<number>;
	mark?: Set<number>;
	diff?: boolean;
	wrap?: boolean;
	format?: boolean;
	copy?: boolean;
	width?: number;
	dialect?: string;
	indent?: string;
	quotes?: string;
}

/** One edit: a field to its new value; `null` takes the field out. */
export type CodeRecordEdit = Partial<Record<keyof CodeRecordFields, string | number | boolean | null>>;

/** The code kernel: the reader from lib/authoring/inline-editors.js (`code`), with the writer's `edit`
 *  and `problem` from record-edit.js (esm/code-record.js), as code-controls.tsx composes them. */
export interface CodeRecordKernel {
	/** A record's fields (`@code{…}` → fields), with what it could not read. Never throws. */
	read(text: string): { ok: boolean; value?: CodeRecordFields; problems?: string[] };
	/** The record with only these fields changed; '' when none is left, null when it cannot be done safely. */
	edit(text: string, edit: CodeRecordEdit): string | null;
	/** Why one field's new value does not read, or null. */
	problem(key: string, value: unknown): string | null;
	/** The deck's `code:` default, from the front matter body. */
	deckDefaults(frontMatter: string): CodeRecordFields;
	readonly INDENTS: readonly string[];
}

/** The deck's front matter body (no `---`), or ''. */
export function frontMatterOf(source: string): string {
	return /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';
}
