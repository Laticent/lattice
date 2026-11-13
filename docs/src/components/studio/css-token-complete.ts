// CSS token completion for the Studio's code fields (CodeField.tsx: Theme CSS, Component CSS, the Craft lab).
// Every color and type size in Lattice CSS goes through a token (HARD RULES #3, #4, #11), so after `var(--` the
// field offers the token names, grouped by role:
//   - the palette contract a theme supplies (lib/theme/derive.js `REQUIRED_TOKENS`, through theme-core, loaded on
//     first use), each group named for its role;
//   - the type scale (lib/core/type-tokens.js), each with its role, first after `font-size:`.
// CodeMirror's own CSS completion (properties, values, the variables the file itself declares) runs beside this one.
// (engineering/decisions/2026-11-13-studio-autocomplete-audit.md, slice 4.)

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import typeTokens from '../../../../lib/core/type-tokens.js';

const TYPE_OPTIONS: Completion[] = (typeTokens.TYPE_TOKENS as readonly { name: string; role: string }[]).map((t) => ({ label: t.name, type: 'variable', detail: 'type', info: t.role }));

// The palette contract's sections, named for an author: what each group of tokens is for.
const GROUP_LABELS: Record<string, string> = {
	surfaces: 'surface',
	ink: 'text ink',
	graphical: 'mark ink',
	accent: 'accent',
	semantic: 'status',
	dark: 'dark variant',
	categorical: 'categorical',
	heatmap: 'heatmap',
	containment: 'container',
	spectrum: 'spectrum',
	sequential: 'sequential',
	universal: 'alarm',
	syntax: 'code syntax',
	chart: 'chart',
};

let paletteOptions: Promise<Completion[]> | null = null;
function loadPaletteOptions(): Promise<Completion[]> {
	paletteOptions ??= import('@/playground/theme-core.generated.js').then((core) =>
		Object.entries(core.REQUIRED_TOKENS as Record<string, readonly string[]>).flatMap(([group, names]) =>
			names.map((n): Completion => ({ label: `--${n}`, type: 'variable', detail: GROUP_LABELS[group] ?? group })),
		),
	);
	return paletteOptions;
}

/** The token name being typed inside `var(`, or null: `{ from, typed }` with `typed` starting at its `--`. Exported for a test. */
export function tokenNameAt(before: string): { from: number; typed: string } | null {
	const m = /var\(\s*(-{0,2}[\w-]*)$/.exec(before);
	if (!m) return null;
	return { from: before.length - m[1].length, typed: m[1] };
}

/** The CodeMirror source. Inside `var(` only, so a property name or a selector never sees it. */
export function cssTokenCompletion(context: CompletionContext): Promise<CompletionResult | null> | null {
	const line = context.state.doc.lineAt(context.pos);
	const before = context.state.sliceDoc(line.from, context.pos);
	const spot = tokenNameAt(before);
	if (!spot) return null;
	// A `font-size` value wants the type scale; anything else, the palette first.
	const sizing = /(?:^|[\s;{])font(?:-size)?\s*:[^;]*$/.test(before);
	return loadPaletteOptions().then((palette) => {
		if (context.aborted) return null;
		const type = TYPE_OPTIONS.map((o) => ({ ...o, boost: sizing ? 10 : -10 }));
		return { from: line.from + spot.from, options: [...type, ...palette], validFor: /^-{0,2}[\w-]*$/ };
	});
}
