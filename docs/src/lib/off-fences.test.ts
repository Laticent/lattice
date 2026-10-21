import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { offFences, offFencesSentence } from './off-fences';

// The host narrowed its defaults to nothing: every plugin is off for the deck.
beforeEach(() => {
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { pluginAdmission: () => [] };
});
afterEach(() => {
	(window as unknown as { LatticePlayground?: unknown }).LatticePlayground = undefined;
});

const count = (md: string) => offFences(md)?.count ?? 0;

describe('offFences', () => {
	it('counts a plain fence, a tilde fence, a quoted fence and a list-item fence', () => {
		expect(count('```mermaid\nflowchart LR\n```\n')).toBe(1);
		expect(count('~~~mermaid\nflowchart LR\n~~~\n')).toBe(1);
		expect(count('> ```mermaid\n> flowchart LR\n> ```\n')).toBe(1);
		expect(count('1. ```mermaid\n   flowchart LR\n   ```\n')).toBe(1);
	});
	it('does not count what is not a fence of the plugin', () => {
		expect(count('```\nmermaid\n```\n')).toBe(0);
		expect(count('```js\nlet a;\n```\n\nmermaid is a tool\n')).toBe(0);
		expect(count('````markdown\n```mermaid\nflowchart LR\n```\n````\n')).toBe(0);
	});
	it('says nothing when the plugin is on', () => {
		(window as unknown as { LatticePlayground: unknown }).LatticePlayground = undefined;
		expect(offFences('```mermaid\nflowchart LR\n```\n')).toBeNull();
	});
	it('words the notice with a count and the plugin title', () => {
		const o = offFences('```mermaid\na\n```\n\n```mermaid\nb\n```\n');
		expect(o && offFencesSentence(o)).toMatch(/^2 mermaid fences will ship as source: the .+ plugin is off for this deck$/);
	});
});
