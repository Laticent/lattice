// @vitest-environment node
// Pure: the record finder and writer against a REAL deck document (`deckToDoc`), with every
// assertion that matters made on the SOURCE the round-trip emits, as code-commands.test.ts does.
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
// The engine's own writer, which the record editor calls (through the authoring bundle in the app).
import recordEdit from '../../../../lib/plugins/code/shared/record-edit.js';
import { fenceRecord, setFenceRecord } from './code-record';
import { deckToDoc, docToDeck } from './deck-doc';

// No final newline: `docToDeck` writes none (the Studio keeps the file's own ending through `emitDeck`).
const deck = (body: string) => `---\ntheme: indaco\n---\n\n## Code\n\n${body}\n\nAfter.`;
const FENCE = '```ts\nconst a = 1;\nlet b = 2;\n```';

function caretInFence(source: string): EditorState {
	const state = EditorState.create({ doc: deckToDoc(source) });
	let pos = -1;
	state.doc.descendants((node, p) => {
		if (pos === -1 && node.type.name === 'code_block') pos = p + 1;
	});
	if (pos === -1) throw new Error('no code block in fixture');
	return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

/** The writer's answer, which these cases all expect to be a record (null would be a refusal). */
function edited(text: string, edit: Record<string, unknown>): string {
	const out = recordEdit.editRecord(text, edit);
	if (out === null) throw new Error(`editRecord refused ${JSON.stringify(edit)} on ${text}`);
	return out;
}

function run(state: EditorState, command: Command) {
	let next = state;
	const ok = command(state, (tr) => {
		next = state.apply(tr);
	});
	return { ok, state: next, source: docToDeck(next.doc) };
}

describe('fenceRecord', () => {
	it('finds the record directly above the caret fence', () => {
		const state = caretInFence(deck(`\`@code{title="a, b.ts",  numbers}\`\n${FENCE}`));
		expect(fenceRecord(state)?.text).toBe('@code{title="a, b.ts",  numbers}');
	});

	it('is null for no record, for a code span with other words, and with the caret outside a fence', () => {
		expect(fenceRecord(caretInFence(deck(FENCE)))).toBeNull();
		expect(fenceRecord(caretInFence(deck(`\`Before\`\n\n${FENCE}`)))).toBeNull();
		expect(fenceRecord(caretInFence(deck(`See \`@code{numbers}\`\n\n${FENCE}`)))).toBeNull();
		expect(fenceRecord(EditorState.create({ doc: deckToDoc(deck(`\`@code{numbers}\`\n${FENCE}`)) }))).toBeNull();
	});
});

describe('setFenceRecord — the source is the deliverable', () => {
	it('an untouched deck round-trips byte for byte', () => {
		const src = deck(`\`@code{title="a, b.ts",  numbers, focus=1}\`\n${FENCE}`);
		expect(docToDeck(deckToDoc(src))).toBe(src);
	});

	it('toggling numbers changes only that word, and the record stays on the line above the fence', () => {
		const src = deck(`\`@code{title="a, b.ts",  focus=1}\`\n${FENCE}`);
		const state = caretInFence(src);
		const next = edited(fenceRecord(state)?.text ?? '', { numbers: true });
		const out = run(state, setFenceRecord(next));
		expect(out.ok).toBe(true);
		expect(out.source).toBe(src.replace('focus=1}', 'focus=1, numbers}'));
		// And back: the deck is the one we started from.
		const back = run(out.state, setFenceRecord(edited(fenceRecord(out.state)?.text ?? '', { numbers: false })));
		expect(back.source).toBe(src);
	});

	it('adds a record to a fence that has none, on the line above it', () => {
		const src = deck(FENCE);
		const out = run(caretInFence(src), setFenceRecord(edited('', { numbers: true })));
		expect(out.source).toBe(deck(`\`@code{numbers}\`\n${FENCE}`));
	});

	it('removes the record line when the last field goes', () => {
		const src = deck(`\`@code{numbers}\`\n${FENCE}`);
		const state = caretInFence(src);
		const out = run(state, setFenceRecord(edited(fenceRecord(state)?.text ?? '', { numbers: false })));
		expect(out.source).toBe(deck(FENCE));
	});

	it('keeps the caret in the fence, and refuses a no-op or a non-record', () => {
		const state = caretInFence(deck(FENCE));
		const out = run(state, setFenceRecord('@code{wrap}'));
		expect(out.state.selection.$from.parent.type.name).toBe('code_block');
		expect(run(out.state, setFenceRecord('@code{wrap}')).ok).toBe(false);
		expect(run(state, setFenceRecord('numbers')).ok).toBe(false);
	});
});
