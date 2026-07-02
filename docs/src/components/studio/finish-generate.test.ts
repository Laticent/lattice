import { describe, expect, it } from 'vitest';
import {
	coerceRecipe,
	DEFAULT_RECIPE,
	EDGE_TYPES,
	type FinishRecipe,
	generateFinishCss,
	generateSwatch,
	MARK_TYPES,
	PRESET_RECIPES,
	safeFinishSlug,
	sanitizeGlyph,
	TEXTURE_TYPES,
	WASH_TYPES,
} from './finish-generate';

// Exercise every layer type so the export-safety assertions cover the full vocab.
const everyRecipe = (): FinishRecipe[] => {
	const out: FinishRecipe[] = [DEFAULT_RECIPE, ...Object.values(PRESET_RECIPES)];
	for (const w of WASH_TYPES) out.push({ ...DEFAULT_RECIPE, wash: { type: w, intensity: 12 } });
	for (const t of TEXTURE_TYPES) out.push({ ...DEFAULT_RECIPE, texture: { type: t, intensity: 9, scale: 30 } });
	for (const m of MARK_TYPES) out.push({ ...DEFAULT_RECIPE, mark: { type: m, placement: 'top-right' } });
	for (const e of EDGE_TYPES) out.push({ ...DEFAULT_RECIPE, edge: { type: e, intensity: 10 } });
	return out;
};

describe('finish-generate', () => {
	it('emits a rich screen rule + a @media print + .lattice-exporting opaque override', () => {
		const css = generateFinishCss('my-finish', DEFAULT_RECIPE);
		// The RICH (screen default) rule comes first and drives the engine compositor.
		expect(css.startsWith('section.finish.finish-my-finish {')).toBe(true);
		// All four engine layer slots are declared (self-defining — never inherits).
		expect(css).toContain('--fin-wash:');
		expect(css).toContain('--fin-texture:');
		expect(css).toContain('--fin-mark:');
		expect(css).toContain('--fin-edge:');
		// BOTH export guards are present, each re-pointing the full-bleed slots. The
		// export-class guard matches an ancestor OR the section itself (the latter is
		// load-bearing for the html-to-image raster, which clones the section only).
		expect(css).toContain('@media print {');
		expect(css).toContain(':where(.lattice-exporting) section.finish.finish-my-finish');
		expect(css).toContain('section.finish.finish-my-finish.lattice-exporting {');
	});

	// Split the generated CSS into the SCREEN block (the leading `section…{…}` rule,
	// before the first `@media`) and the EXPORT blocks (`@media print` + the
	// `.lattice-exporting` rule). The export face is what bakes into a PDF/PPTX.
	const screenBlock = (css: string): string => css.slice(0, css.indexOf('@media print'));
	const exportBlocks = (css: string): string => css.slice(css.indexOf('@media print'));
	// Pull one slot's value out of a rule (e.g. `--fin-wash`). The slot value runs to
	// the terminating `;` (color-mix has no `;` inside it).
	const slotValue = (css: string, slot: string): string => new RegExp(`--${slot}:([^;]*)`).exec(css)?.[1] ?? '';

	it('the EXPORT face is export-safe for EVERY layer type: no full-bleed transparent fade, no mask/url/hex/margin', () => {
		for (const r of everyRecipe()) {
			const css = generateFinishCss('x', r);
			const exp = exportBlocks(css);
			// OPAQUE-TO-OPAQUE — the load-bearing PDF rule (base.finish.css header). In the
			// EXPORT blocks the FULL-BLEED slots (wash z1, edge z4) must fade opaque→opaque:
			// NO `transparent` (a 0-alpha area fade grays into a muddy cloud in PDF export).
			expect(slotValue(exp, 'fin-wash'), `transparent in the EXPORT full-bleed WASH: ${exp}`).not.toMatch(/transparent/);
			expect(slotValue(exp, 'fin-edge'), `transparent in the EXPORT full-bleed EDGE: ${exp}`).not.toMatch(/transparent/);
			// The TEXTURE also flips to opaque on export (it's face-variant — the rich face
			// mixes the line/dot into `transparent`). In the export block, every color-mix in
			// the texture must mix into var(--bg), never into `transparent`; the ONLY allowed
			// `transparent` is the hard 1px stripe/dot GAP, never a `transparent <pct>%` fade.
			const expTex = slotValue(exp, 'fin-texture');
			expect(expTex, `EXPORT texture must mix the pattern into var(--bg), not transparent: ${expTex}`).not.toMatch(/transparent\)/);
			expect(expTex, `EXPORT texture must not area-fade to transparent: ${expTex}`).not.toMatch(/transparent\s+\d+%/);
			// No mask/url/hex/margin in EITHER face (whole CSS).
			expect(css, 'mask drops in PDFKit').not.toMatch(/\bmask/i);
			expect(css, 'url() adds exfil surface').not.toMatch(/url\(/i);
			expect(css, 'hex literal violates HARD RULE #3').not.toMatch(/#[0-9a-f]{3,8}\b/i);
			expect(css, 'margin violates HARD RULE #20').not.toMatch(/(^|[\s;{])margin\b/i);
			// Palette-blind — color comes only through var()/color-mix.
			expect(css).toMatch(/var\(--accent\)|var\(--bg\)|var\(--ink/);
		}
	});

	it('a fabricated TEXTURE finish flips its texture to opaque on export (matching the presets)', () => {
		// A grid texture, no wash/edge — the rich screen face mixes the lines into
		// `transparent`; the export face (both @media print and .lattice-exporting) must
		// mix them into var(--bg) instead, so the pattern bakes opaque-clean.
		const css = generateFinishCss('grid-only', {
			wash: { type: 'none', intensity: 10 },
			texture: { type: 'grid', intensity: 9, scale: 30 },
			mark: { type: 'none', placement: 'center' },
			edge: { type: 'none', intensity: 6 },
		});
		const exp = exportBlocks(css);
		// The export block re-declares the texture, and its color mixes into var(--bg).
		expect(exp).toContain('--fin-texture:');
		expect(slotValue(exp, 'fin-texture')).toContain('var(--bg)');
		expect(slotValue(exp, 'fin-texture'), 'export texture line color must be opaque, not alpha').not.toMatch(/transparent\)/);
		// The screen (rich) texture, by contrast, DOES mix into transparent.
		expect(slotValue(screenBlock(css), 'fin-texture')).toMatch(/transparent\)/);
	});

	it('the SCREEN face may use alpha fades (rich look) but still NO mask/url/hex/margin', () => {
		for (const r of everyRecipe()) {
			const css = generateFinishCss('x', r);
			const screen = screenBlock(css);
			// Screen is allowed alpha (fade-to-transparent / color-mix into transparent) —
			// it's composited by the browser, never baked into a PDF. No assertion against
			// `transparent` here (that's the whole point of the rich variant).
			// But the screen face is still exfil/palette safe.
			expect(screen, 'mask drops in PDFKit').not.toMatch(/\bmask/i);
			expect(screen, 'url() adds exfil surface').not.toMatch(/url\(/i);
			expect(screen, 'hex literal violates HARD RULE #3').not.toMatch(/#[0-9a-f]{3,8}\b/i);
			expect(screen, 'margin violates HARD RULE #20').not.toMatch(/(^|[\s;{])margin\b/i);
			expect(screen).toMatch(/var\(--accent\)|var\(--bg\)|var\(--ink/);
		}
	});

	it('re-sanitizes the slug (defense in depth — a crafted name cannot escape the selector)', () => {
		const css = generateFinishCss('evil } body { color: red ', DEFAULT_RECIPE);
		expect(css.startsWith('section.finish.finish-evil-body-color-red {')).toBe(true);
		expect(css).not.toContain('body {');
		expect(safeFinishSlug('  ')).toBe('custom');
		expect(safeFinishSlug('A B/C')).toBe('a-b-c');
	});

	it('intensity + scale flow into the output as numbers', () => {
		const css = generateFinishCss('a', { wash: { type: 'corner-glow', intensity: 14 }, texture: { type: 'grid', intensity: 9, scale: 32 }, mark: { type: 'none', placement: 'center' }, edge: { type: 'none', intensity: 6 } });
		// The EXPORT (opaque) wash carries the literal intensity (no rich lift).
		expect(exportBlocks(css)).toContain('var(--accent) 14%');
		// The SCREEN (rich) wash lifts the accent a touch (alpha falloff): 14 → 17.
		expect(screenBlock(css)).toContain('var(--accent) 17%');
		// Scale flows through (face-invariant) on the screen texture.
		expect(css).toContain('32px');
	});

	it('coerceRecipe clamps an out-of-vocab / out-of-range AI reply to the closed set', () => {
		const r = coerceRecipe({ wash: { type: 'rainbow', intensity: 999 }, texture: { type: 'grid', intensity: -5, scale: 5 }, mark: { type: 'skull', placement: 'nowhere' }, edge: {} });
		expect(WASH_TYPES).toContain(r.wash.type);
		expect(r.wash.type).toBe('none'); // unknown → none
		expect(r.wash.intensity).toBeLessThanOrEqual(20);
		expect(r.texture.intensity).toBeGreaterThanOrEqual(3);
		expect(r.texture.scale).toBeGreaterThanOrEqual(12);
		expect(MARK_TYPES).toContain(r.mark.type);
		expect(r.mark.type).toBe('none');
		expect(EDGE_TYPES).toContain(r.edge.type);
	});

	it('coerceRecipe never throws on garbage input', () => {
		expect(() => coerceRecipe(null)).not.toThrow();
		expect(() => coerceRecipe('nonsense')).not.toThrow();
		expect(() => coerceRecipe(42)).not.toThrow();
	});

	it('coerceRecipe carries a BAKED backdrop (strength/clearance), dropping defaults', () => {
		// a real baked backdrop round-trips (clamped)
		expect(coerceRecipe({ backdrop: { strength: 0.6, clearance: 'on' } }).backdrop).toEqual({ strength: 0.6, clearance: true });
		expect(coerceRecipe({ backdrop: { strength: 1.8 } }).backdrop).toBeUndefined(); // clamps to 1 = full = default → dropped
		expect(coerceRecipe({ backdrop: { strength: 1, clearance: false } }).backdrop).toBeUndefined(); // all-default → no key
		// a plain finish (no backdrop) carries no backdrop key
		expect('backdrop' in coerceRecipe({ wash: { type: 'grid' } })).toBe(false);
		// clearance alone (no strength) is kept
		expect(coerceRecipe({ backdrop: { clearance: true } }).backdrop).toEqual({ clearance: true });
		// backdrop is NEVER emitted into the generated CSS (it's a front-matter stamp, not a layer)
		expect(generateFinishCss('x', coerceRecipe({ backdrop: { strength: 0.5, clearance: true } }))).not.toMatch(/backdrop/i);
	});

	it('generateSwatch returns a usable background string for every preset', () => {
		for (const r of Object.values(PRESET_RECIPES)) {
			const sw = generateSwatch(r);
			expect(typeof sw.background).toBe('string');
			expect(sw.background.length).toBeGreaterThan(0);
		}
	});

	describe('mark glyph — author-personalized, never a baked placeholder (#5b)', () => {
		it('sanitizeGlyph strips string-escape + tag chars and clamps length', () => {
			expect(sanitizeGlyph('AB')).toBe('AB');
			expect(sanitizeGlyph('toolong')).toBe('too'); // ~3 chars
			expect(sanitizeGlyph('"; } body {')).toBe('bod'); // quotes/braces/semicolon/spaces gone
			expect(sanitizeGlyph('a"b')).toBe('ab'); // quote removed
			expect(sanitizeGlyph('<svg>')).toBe('svg'); // angle brackets gone
			expect(sanitizeGlyph('')).toBe(''); // empty → empty (NO baked placeholder)
			expect(sanitizeGlyph('   ')).toBe(''); // whitespace-only → empty
			expect(sanitizeGlyph(42)).toBe(''); // non-string → empty
		});

		it('a monogram emits the author glyph (sanitized), or NOTHING when empty (no baked "L")', () => {
			const withGlyph = generateFinishCss('x', { ...DEFAULT_RECIPE, mark: { type: 'monogram', placement: 'center', glyph: 'AB' } });
			expect(withGlyph).toContain('--fin-mark-text:"AB"');
			const noGlyph = generateFinishCss('x', { ...DEFAULT_RECIPE, mark: { type: 'monogram', placement: 'center' } });
			// Empty glyph → empty content, so NOTHING renders. Never the old "L" placeholder.
			expect(noGlyph).toContain('--fin-mark-text:""');
			expect(noGlyph).not.toContain('--fin-mark-text:"L"');
		});

		it('a numeral emits the author glyph, or NOTHING when empty (no baked "03") — and cannot break the rule', () => {
			const numeral = generateFinishCss('x', { ...DEFAULT_RECIPE, mark: { type: 'numeral', placement: 'bottom-right', glyph: '7' } });
			expect(numeral).toContain('--fin-mark-text:"7"');
			// Empty glyph → empty content, so NOTHING renders. Never the old "03" placeholder.
			const noGlyph = generateFinishCss('x', { ...DEFAULT_RECIPE, mark: { type: 'numeral', placement: 'bottom-right' } });
			expect(noGlyph).toContain('--fin-mark-text:""');
			expect(noGlyph).not.toContain('--fin-mark-text:"03"');
			// A crafted glyph cannot close the content string or inject a declaration.
			const evil = generateFinishCss('x', { ...DEFAULT_RECIPE, mark: { type: 'numeral', placement: 'bottom-right', glyph: '";color:red;"' } });
			expect(evil).not.toContain('color:red');
			expect(evil).not.toMatch(/--fin-mark-text:"[^"]*"[^;]*"/); // no extra quote escapes the value
		});

		it('coerceRecipe keeps a string glyph and drops a non-string one', () => {
			expect(coerceRecipe({ mark: { type: 'monogram', glyph: 'AB' } }).mark.glyph).toBe('AB');
			expect(coerceRecipe({ mark: { type: 'monogram', glyph: 42 } }).mark.glyph).toBeUndefined();
		});
	});

	describe('transform axes — marks freely sized/moved/tilted, washes with a movable hotspot', () => {
		const slotValue = (css: string, slot: string): string => new RegExp(`--${slot}:([^;]*)`).exec(css)?.[1] ?? '';
		const markRecipe = (over: Partial<FinishRecipe['mark']>): FinishRecipe => ({ ...DEFAULT_RECIPE, mark: { type: 'numeral', placement: 'center', glyph: '7', ...over } });

		it('mark SCALE drives the glyph font-size (100% → 30cqi base; clamps to range)', () => {
			expect(slotValue(generateFinishCss('x', markRecipe({ scale: 100 })), 'fin-mark-fs')).toBe('30cqi');
			expect(slotValue(generateFinishCss('x', markRecipe({ scale: 200 })), 'fin-mark-fs')).toBe('60cqi');
			expect(slotValue(generateFinishCss('x', markRecipe({ scale: 50 })), 'fin-mark-fs')).toBe('15cqi');
			// Out-of-range is clamped by coerceRecipe (min 30 → 9cqi, max 200 → 60cqi).
			expect(slotValue(generateFinishCss('x', markRecipe({ scale: 9999 })), 'fin-mark-fs')).toBe('60cqi');
			expect(slotValue(generateFinishCss('x', markRecipe({ scale: 1 })), 'fin-mark-fs')).toBe('9cqi');
		});

		it('mark X/Y move the centered glyph via translate; angle rotates it', () => {
			const t = slotValue(generateFinishCss('x', markRecipe({ x: 88, y: 84, angle: 12 })), 'fin-mark-transform');
			// translate is (x-50, y-50)% of the slide; rotate by angle.
			expect(t).toBe('translate(38%, 34%) rotate(12deg)');
			// Centered + center-aligned so the translate resolves about the slide center.
			const css = generateFinishCss('x', markRecipe({ x: 50, y: 50, angle: 0 }));
			expect(css).toContain('--fin-mark-align:center');
			expect(css).toContain('--fin-mark-justify:center');
			expect(slotValue(css, 'fin-mark-transform')).toBe('translate(0%, 0%) rotate(0deg)');
		});

		it('the mark transform is face-INVARIANT (identical glyph placement in screen + export)', () => {
			const css = generateFinishCss('x', markRecipe({ x: 70, y: 30, scale: 120 }));
			// The transform/fs slots are emitted once (rich rule) and never overridden by the
			// export blocks — a glyph must sit in the same spot/size in the baked PDF.
			const occurrences = css.split('--fin-mark-transform:').length - 1;
			expect(occurrences).toBe(1);
		});

		it('a single-source WASH reads its movable hotspot from x/y and scales reach by spread', () => {
			const css = generateFinishCss('x', { ...DEFAULT_RECIPE, wash: { type: 'spotlight', intensity: 8, x: 20, y: 70, spread: 150 } });
			const wash = slotValue(css, 'fin-wash');
			expect(wash).toContain('at 20% 70%');
			// spread 150% scales the spotlight's 80%/70% reach up.
			expect(wash).toContain('120% 105%');
		});

		it('a directional/multi-source wash (duotone) ignores the hotspot (no `at x% y%`)', () => {
			const wash = slotValue(generateFinishCss('x', { ...DEFAULT_RECIPE, wash: { type: 'duotone', intensity: 8, x: 20, y: 70 } }), 'fin-wash');
			expect(wash).not.toContain('at 20% 70%');
		});

		it('coerceRecipe fills the transform axes from the coarse fields and clamps them', () => {
			// Absent axes → derived: placement keyword → glyph x/y; wash type → hotspot; defaults.
			const r = coerceRecipe({ mark: { type: 'numeral', placement: 'top-left' }, wash: { type: 'corner-glow', intensity: 10 } });
			expect(r.mark.x).toBe(12); // top-left home
			expect(r.mark.y).toBe(16);
			expect(r.mark.scale).toBe(100);
			expect(r.mark.angle).toBe(0);
			expect(r.wash.x).toBe(100); // corner-glow natural hotspot
			expect(r.wash.y).toBe(0);
			expect(r.wash.spread).toBe(100);
			// Present-but-out-of-range → clamped, not dropped.
			const c = coerceRecipe({ mark: { type: 'numeral', x: 999, y: -5, scale: 9999, angle: 999 } });
			expect(c.mark.x).toBe(100);
			expect(c.mark.y).toBe(0);
			expect(c.mark.scale).toBe(200);
			expect(c.mark.angle).toBe(30);
		});
	});
});
