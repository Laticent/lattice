// Version history rows read each version's stored slide count instead of parsing its text
// (2026-11-11-studio-storage-pointer-records.md §4 item 2): the list used to parse up to 25 deck
// copies every time it opened. The parser is spied, so "no parse" is checked, not inferred.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const parses = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/lib/deck-outline', async (importOriginal) => {
	const real = await importOriginal<typeof import('@/lib/deck-outline')>();
	return {
		...real,
		buildDeckIndex: (src: string) => {
			parses.n++;
			return real.buildDeckIndex(src);
		},
	};
});

import { __resetCheckpointStoreForTests } from './checkpoint-store';
import { checkpointMeta, importStudioState, loadCheckpoints, saveCheckpoint } from './studio-store';

const THREE = '# One\n\n---\n\n# Two\n\n---\n\n# Three\n';
// Each source is new to the parser's memo, so a parse cannot hide behind it.
let n = 0;
const fresh = (body: string) => `${body}\n<!-- ${n++} -->\n`;

beforeEach(() => {
	localStorage.clear();
	__resetCheckpointStoreForTests({ backend: 'local' });
	parses.n = 0;
});

describe('version slide counts', () => {
	it('a row with a stored count shows it without parsing the version', () => {
		const label = checkpointMeta({ id: 'a', ts: 1, label: 'v', source: fresh(THREE), slides: 3 });
		expect(label).toBe('3 slides');
		expect(parses.n).toBe(0);
	});

	it('a version saved before counts were stored is counted from its text', () => {
		expect(checkpointMeta({ id: 'a', ts: 1, label: 'v', source: fresh(THREE) })).toBe('3 slides');
		expect(parses.n).toBe(1);
	});

	it('a count that is not a positive whole number is ignored, not shown', () => {
		for (const slides of [0, -2, 2.5, Number.NaN, '7' as unknown as number]) expect(checkpointMeta({ id: 'a', ts: 1, label: 'v', source: fresh(THREE), slides })).toBe('3 slides');
	});

	it('saving a version stores its rendered slide count', () => {
		saveCheckpoint('d1', fresh(THREE), 'Saved version', 1000);
		expect(loadCheckpoints('d1')[0].slides).toBe(3);
	});

	it('a restored backup does not carry its counts in: the row counts from the text', () => {
		const source = fresh(THREE);
		importStudioState({ index: [{ id: 'b1', title: 'B', builtin: false }], sources: { b1: source }, checkpoints: { b1: [{ id: 'x', ts: 1, label: 'v', source, slides: 99 }] }, chats: {}, settings: {}, instructions: '', onDeviceInstructions: '' } as never, 5);
		const [cp] = loadCheckpoints('b1');
		expect(cp.slides).toBeUndefined();
		expect(checkpointMeta(cp)).toBe('3 slides');
	});
});
