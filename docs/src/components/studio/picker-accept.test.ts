// @vitest-environment node
// Unit: neither deck picker filters by file type, on any device (2026-11-20).
//
// iOS maps every `accept` entry to a system file type and grays out whatever matches none of
// them, and it has no type for `.lattice`. The Studio dropped the list only when a device sniff
// said iOS, and a real iPhone still showed every `.lattice` grayed out in Files. So the rule is
// now the plain one: "Import deck…" and the Library's Import name no `accept` at all, and the
// readers sniff the bytes. This reads the two inputs out of their source, so a list (or a sniff
// that brings one back on some devices) fails here before it reaches a phone. The real DOM, under
// an iPhone's user agent and two desktop engines, is e2e/library-deck-import.spec.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const here = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');

/** The JSX of the one `<input …>` element that `marker` sits in. */
function inputWith(src: string, marker: string): string {
	const at = src.indexOf(marker);
	expect(at, `${marker} is in the source`).toBeGreaterThan(-1);
	const open = src.lastIndexOf('<input', at);
	const close = src.indexOf('/>', at);
	expect(open).toBeGreaterThan(-1);
	return src.slice(open, close + 2);
}

describe('the deck pickers name no accept list', () => {
	it('"Import deck…" (StudioShell) has no accept, whatever the device', () => {
		const input = inputWith(here('./StudioShell.tsx'), 'ref={importInputRef}');
		expect(input).toContain('type="file"');
		expect(input).not.toMatch(/\baccept\s*=/);
	});

	it("the Library's one Import has no accept, whatever the device", () => {
		const input = inputWith(here('./Library.tsx'), 'data-testid="library-import-input"');
		expect(input).toContain('type="file"');
		expect(input).not.toMatch(/\baccept\s*=/);
	});

	it('no device sniff decides either picker any more', () => {
		// The module that held the list and the sniff is gone; nothing may import it back.
		for (const f of ['./StudioShell.tsx', './Library.tsx']) {
			expect(here(f)).not.toMatch(/deck-import-accept|deckImportAccept|IMPORT_ACCEPT/);
		}
	});
});
