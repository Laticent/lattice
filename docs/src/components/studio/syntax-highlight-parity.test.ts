import { describe, expect, it } from 'vitest';
import { latticeHighlight } from '@/playground/editor.js';
import { tokenColor } from './chat-highlight';
import { studioHighlight } from './editor-theme';

// The Studio highlights code on TWO surfaces from two independent maps: the CodeMirror
// editors go through `studioHighlight` (lezer tags → a CSS rule per row) and chat code
// blocks go through `tokenColor` (a lezer CLASS name → a color string). Nothing in the
// type system ties them together, and they have already drifted once: the propertyName
// row read `var(--chart-2)` — the NUMBER color — while its own comment claimed parity
// with the editor's `--text-heading` (#1688).
//
// So this asserts the two agree per ROLE, and that neither has quietly reverted to the
// status trio the syntax ink tier replaced.

/** Every color literal a HighlightStyle compiles into its stylesheet. */
function colorsOf(style: unknown, label: string): string[] {
	const specs = (style as { specs?: Array<{ color?: string }> }).specs;
	expect(Array.isArray(specs), `${label}: HighlightStyle.specs is no longer an array — re-point this test`).toBe(true);
	const out = (specs as Array<{ color?: string }>).map((sp) => sp.color).filter((c): c is string => typeof c === 'string');
	expect(out.length, `${label}: no colors read`).toBeGreaterThan(5);
	return out;
}

/** Every color literal `studioHighlight` compiles into its stylesheet. */
function editorColors(): string[] {
	// HighlightStyle keeps its rows in `.specs` (the array handed to `define`). Read that
	// rather than the compiled StyleModule: the compiled form is class names, and the point
	// here is the token each ROLE resolves to.
	const specs = (studioHighlight as unknown as { specs: Array<{ color?: string }> }).specs;
	expect(Array.isArray(specs), 'HighlightStyle.specs is no longer an array — re-point this test').toBe(true);
	return specs.map((s) => s.color).filter((c): c is string => typeof c === 'string');
}

describe('syntax highlighting — the two surfaces agree', () => {
	// role → the lezer class the chat map keys on. The editor side is asserted by index
	// below, against `studioHighlight`'s declaration order.
	const ROLES: Array<{ role: string; cls: string; expected: string }> = [
		{ role: 'string', cls: 'tok-string', expected: 'var(--syntax-string-ink)' },
		{ role: 'number', cls: 'tok-number', expected: 'var(--syntax-number-ink)' },
		{ role: 'bool', cls: 'tok-bool', expected: 'var(--syntax-number-ink)' },
		{ role: 'keyword', cls: 'tok-keyword', expected: 'var(--syntax-keyword-ink)' },
		{ role: 'heading', cls: 'tok-heading', expected: 'var(--syntax-keyword-ink)' },
		{ role: 'tagName', cls: 'tok-tagName', expected: 'var(--syntax-keyword-ink)' },
		{ role: 'link', cls: 'tok-link', expected: 'var(--syntax-keyword-ink)' },
		{ role: 'comment', cls: 'tok-comment', expected: 'var(--text-muted)' },
		{ role: 'propertyName', cls: 'tok-propertyName', expected: 'var(--text-heading)' },
		{ role: 'punctuation', cls: 'tok-punctuation', expected: 'var(--text-muted)' },
	];

	for (const { role, cls, expected } of ROLES) {
		it(`chat: ${role} → ${expected}`, () => {
			expect(tokenColor(cls)).toBe(expected);
		});
	}

	it('the editor paints all three syntax inks', () => {
		const colors = editorColors();
		for (const t of ['string', 'number', 'keyword']) {
			expect(colors, t).toContain(`var(--syntax-${t}-ink)`);
		}
	});

	// COMMENTS AND PUNCTUATION STAY ON `--text-muted`, and this pins the decision rather than
	// the accident. A `muted` role was added to the tier and reverted: the solve moves lightness
	// AWAY from the canvas, which is where `--text-body` sits, so repairing the comment's
	// contrast collapsed its separation FROM body text (cuoio/light, the default palette: OKLab
	// 0.198 -> 0.038) while `.cm-gutters` — still on `--text-muted` — was left dimmer than the
	// comment beside it. `--text-muted` genuinely is sub-AA on 44 of 72 palette-mode-surface
	// pairs; repairing it is a THEME-TOKEN change so the gutter and chrome move with it.
	it('comments and punctuation stay on --text-muted — this tier does not own that token', () => {
		expect(editorColors()).toContain('var(--text-muted)');
		for (const cls of ['tok-comment', 'tok-punctuation', 'tok-operator', 'tok-meta']) {
			expect(tokenColor(cls), cls).toBe('var(--text-muted)');
		}
	});

	// The rows this change exists to fix. `--pass` / `--warn` are STATUS tokens; they
	// carried the string and number roles as #1703's stopgap and must not come back. A
	// plain "does not contain" is deliberately weak on its own, so the positive assertions
	// above carry the weight — this one catches a REVERT.
	it('no syntax row reads a status token — --pass / --warn are off-label here', () => {
		const colors = editorColors();
		expect(colors).not.toContain('var(--pass)');
		expect(colors).not.toContain('var(--warn)');
		for (const cls of ['tok-string', 'tok-number', 'tok-bool', 'tok-atom', 'tok-null', 'tok-keyword']) {
			expect(tokenColor(cls), cls).not.toMatch(/--(pass|warn)\)/);
		}
	});

	// `t.invalid` KEEPS `--fail`, and that is correct rather than leftover: invalid input
	// is exactly what a status token names. Asserted so a later sweep of "remove status
	// tokens from the highlighter" does not take it out too.
	it('t.invalid deliberately KEEPS --fail', () => {
		expect(editorColors()).toContain('var(--fail)');
	});

	// Every color on either surface must be a bare `var(--token)` with no literal
	// fallback. A fallback is how the #1688 class hid: `var(--chart-3, #2e6f00)` looked
	// themed and painted the hex on all 36 palette-mode rows forever, because the token
	// was declared nowhere and nothing could tell the difference.
	it('every color is a bare var(--token) — no hex, no literal fallback', () => {
		const chat = ROLES.map(({ cls }) => tokenColor(cls)).filter((c): c is string => !!c);
		for (const c of [...editorColors(), ...chat]) {
			expect(c, c).toMatch(/^var\(--[a-z0-9-]+\)$/);
		}
	});
});

// THE PLAYGROUND'S OWN HIGHLIGHTER — a THIRD map, on the public surface. It is not a fork to be
// merged (it covers Markdown + Mermaid tags the Studio's CSS/JSON fields never see), but it must
// not keep painting from `--accent`, which bottoms out at 3.89:1 over the emitted per-palette
// sheet. The first cut of #1688 repaired only the Studio's field and left this one, which is the
// larger surface. `--text-muted` rows stay as they are here for the same reason as in the Studio:
// this tier does not own that token (see the note above).
describe('the Playground highlighter uses the same contrast-repaired tokens', () => {
	it('paints no row from --accent — it is sub-AA on the canvas', () => {
		const colors = colorsOf(latticeHighlight, 'latticeHighlight');
		expect(colors).not.toContain('var(--accent)');
	});

	it('reads the syntax ink tier', () => {
		const colors = colorsOf(latticeHighlight, 'latticeHighlight');
		for (const t of ['keyword', 'number']) {
			expect(colors, t).toContain(`var(--syntax-${t}-ink)`);
		}
	});

	// `--text-heading` and `--text-body` STAY — both are AA against the canvas by contract, and
	// repointing them would be a redesign rather than a contrast repair.
	it('keeps --text-heading and --text-body, which ARE AA by contract', () => {
		const colors = colorsOf(latticeHighlight, 'latticeHighlight');
		expect(colors).toContain('var(--text-heading)');
		expect(colors).toContain('var(--text-body)');
	});

	it('every color is a bare var(--token) — no hex, no literal fallback', () => {
		for (const c of colorsOf(latticeHighlight, 'latticeHighlight')) expect(c, c).toMatch(/^var\(--[a-z0-9-]+\)$/);
	});
});

// A HighlightStyle that is never INSTALLED paints nothing, and the map above cannot tell
// the difference. Editor.tsx composed `markdown()` + `editorTheme` and no
// `syntaxHighlighting(…)` extension at all, so the deck editor rendered its source as bare
// text nodes with ZERO token spans — every assertion above passed the whole time (#1715,
// found while verifying #1720). So each CodeMirror surface is checked for the extension
// itself, at the source, which is where the omission lived.
describe('every CodeMirror surface INSTALLS its highlighter', () => {
	const SURFACES: Array<{ file: string; style: string }> = [
		{ file: 'Editor.tsx', style: 'studioHighlight' },
		{ file: 'CodeField.tsx', style: 'studioHighlight' },
	];
	for (const { file, style } of SURFACES) {
		it(`${file} composes syntaxHighlighting(${style})`, async () => {
			const fs = await import('node:fs');
			const nodePath = await import('node:path');
			// Resolved from the vitest root (docs/), not `import.meta.url` — under vitest that
			// is a VIRTUAL module path, so fileURLToPath yields `/src/components/...` and the
			// read fails with ENOENT rather than measuring the file.
			const abs = nodePath.resolve(process.cwd(), 'src/components/studio', file);
			const src = fs.readFileSync(abs, 'utf8');
			expect(src.length, `${file}: read nothing — re-point this test`).toBeGreaterThan(500);
			expect(src, `${file} builds a CodeMirror editor without installing a highlighter`)
				.toMatch(new RegExp(`syntaxHighlighting\\(\\s*${style}\\s*\\)`));
		});
	}
});
