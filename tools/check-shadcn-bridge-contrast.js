#!/usr/bin/env node

/**
 * Contrast gate for the shadcn ↔ Lattice token bridge.
 *
 * The bridge (docs/src/styles/tailwind.css) maps shadcn's semantic color
 * tokens onto the Lattice palette tokens. One mapping is DERIVED, not a direct
 * alias, so it needs validating per palette/mode forever (not "reviewed once"):
 *   • shadcn `--accent` (hover/active surface) = mix(bg-alt → accent, 14% oklab)
 * Plus every theme pairing the site chrome PAINTS, scored where the site paints it:
 * primary button text, card body, muted caption, destructive (= the theme's `--fail`
 * ink and its `--fail-mark` / `--fail-on-mark` pill), the five status kinds as ink,
 * dot and pill, the asides and tip on their grounds, the text tiers, and the docs
 * Card icon tile (the category chip: on-fill glyph on the fill, mark rim).
 *
 * This reads the SAME generated token file the site themes from
 * (docs/src/styles/lattice-tokens.generated.css) and the bridge's own
 * constants (parsed out of tailwind.css, so there is one source of truth), and
 * fails the build if any pair regresses below its WCAG floor. Reuses the exact
 * WCAG + OKLab math in lib/core/color.js (HARD RULE 15 — don't reinvent).
 *
 * Usage: `node tools/check-shadcn-bridge-contrast.js`  (exit 1 on any FAIL)
 *
 * Distinct from tools/contrast-audit.js (which audits the *theme* token pairs
 * used in slides/Mermaid): this gate validates the *website* shadcn-bridge
 * mappings in docs/src/styles/tailwind.css, not themes/.
 */

const fs = require('node:fs');
const path = require('node:path');
const { contrastRatio, mix, hexToOklab } = require('../lib/core/color.js');

const ROOT = path.join(__dirname, '..');
const TOKENS = path.join(ROOT, 'docs/src/styles/lattice-tokens.generated.css');
const BRIDGE = path.join(ROOT, 'docs/src/styles/tailwind.css');

// Must match the formula in tailwind.css: --lx-ui-accent.
const ACCENT_MIX = 0.14;
// WCAG floors.
const AA = 4.5; // normal text
const AA_SECONDARY = 3.0; // muted captions / large text
const HOVER_DL = 0.02; // min OKLab-L delta: hover surface vs the card it sits on

/** Parse `html[data-palette="X"][data-mode="Y"]{ --a:#..; }` blocks. */
function parsePalettes(css) {
	const out = [];
	const re = /html\[data-palette="([^"]+)"\]\[data-mode="([^"]+)"\]\{([^}]*)\}/g;
	let m;
	while ((m = re.exec(css))) {
		const [, palette, mode, body] = m;
		const tokens = {};
		for (const decl of body.split(';')) {
			const i = decl.indexOf(':');
			if (i === -1) continue;
			tokens[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
		}
		out.push({ palette, mode, tokens });
	}
	return out;
}

/** The site's destructive mapping, read from the bridge so the gate scores what ships. It
 *  must be the theme's blocked status: `--fail` as the ink, `--fail-mark` under `--fail-on-mark`
 *  as the pill. A fixed red here is the defect this replaced (one value per mode, every palette). */
function checkDestructiveMapping(css) {
	const want = {
		'--color-destructive': 'var(--fail)',
		'--color-destructive-mark': 'var(--fail-mark)',
		'--color-destructive-foreground': 'var(--fail-on-mark)',
	};
	const bad = [];
	for (const [name, value] of Object.entries(want)) {
		const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
		if (!m || m[1].trim() !== value) bad.push(`${name} is ${m ? m[1].trim() : 'missing'}, want ${value}`);
	}
	return bad;
}

const AA_GRAPHIC = 3.0; // WCAG 1.4.11: a dot, a rim, an icon glyph
const STATUS = ['pass', 'warn', 'fail', 'info', 'mute'];

function lOf(hex) {
	return hexToOklab(hex).L;
}

function main() {
	const tokensCss = fs.readFileSync(TOKENS, 'utf8');
	const bridgeCss = fs.readFileSync(BRIDGE, 'utf8');
	const palettes = parsePalettes(tokensCss);
	const failures = checkDestructiveMapping(bridgeCss).map((m) => `tailwind.css: ${m}`);
	const warnings = [];
	const rows = [];

	for (const { palette, mode, tokens } of palettes) {
		const t = (n) => tokens[n];
		const lxAccent = mix(t('--bg-alt'), t('--accent'), ACCENT_MIX); // oklab, matches CSS

		// `soft: true` pairs are the THEME's own property (--text-muted on a
		// surface), not a bridge-derived token. The bridge maps shadcn's muted
		// onto the palette's existing muted tone, so a low ratio there is the
		// theme's intentional choice — out of the bridge's scope to police
		// (themes/ is off-limits). Report it as a warning; never fail on it.
		const checks = [
			['primary btn (on-accent/accent)', t('--on-accent'), t('--accent'), AA, false],
			['accent hover text (heading/lx-ui-accent)', t('--text-heading'), lxAccent, AA, false],
			['destructive ink (fail/bg)', t('--fail'), t('--bg'), AA, false],
			['destructive ink (fail/bg-alt)', t('--fail'), t('--bg-alt'), AA, false],
			['destructive pill (fail-on-mark/fail-mark)', t('--fail-on-mark'), t('--fail-mark'), AA, false],
			...STATUS.flatMap((s) => [
				[`${s} ink on canvas (${s}/bg)`, t(`--${s}`), t('--bg'), AA, false],
				[`${s} ink on card (${s}/bg-alt)`, t(`--${s}`), t('--bg-alt'), AA, false],
				[`${s} pill (${s}-on-mark/${s}-mark)`, t(`--${s}-on-mark`), t(`--${s}-mark`), AA, false],
				[`${s} dot (${s}-mark/bg)`, t(`--${s}-mark`), t('--bg'), AA_GRAPHIC, false],
			]),
			// Starlight asides sit on --bg-alt with the title in the status ink: the `ink on card` rows above.
			// The tip aside takes the accent (it has no status meaning): its title is --accent on --accent-soft.
			['tip aside title (accent/accent-soft)', t('--accent'), t('--accent-soft'), AA, false],
			['text-secondary on canvas', t('--text-secondary'), t('--bg'), AA, false],
			['text-secondary on card', t('--text-secondary'), t('--bg-alt'), AA, false],
			['text-label on canvas', t('--text-label'), t('--bg'), AA, false],
			['text-label on card', t('--text-label'), t('--bg-alt'), AA, false],
			// Docs Card icon tiles: the category chip (lattice.css) — glyph --cat-on-fill on the fill, rim the mark.
			...Array.from({ length: 12 }, (_, i) => [
				`card tile glyph (cat-on-fill/cat-${i + 1}-fill)`, t('--cat-on-fill'), t(`--cat-${i + 1}-fill`), AA_GRAPHIC, false,
			]),
			...Array.from({ length: 12 }, (_, i) => [
				`card tile rim (cat-${i + 1}-mark/bg)`, t(`--cat-${i + 1}-mark`), t('--bg'), AA_GRAPHIC, false,
			]),
			['card body (body/bg-alt)', t('--text-body'), t('--bg-alt'), AA, false],
			['muted caption (muted/bg-alt)', t('--text-muted'), t('--bg-alt'), AA_SECONDARY, true],
			// MEASURED, DELIBERATELY NOT A PAIR. Five call sites once put `text-primary`
			// (shadcn primary = the palette --accent) on `bg-accent` (the derived hover
			// surface, a 14% oklab tint of that same --accent) — an undeclared pairing the
			// bridge never sanctioned and this gate never scored, shipping at 4.47:1 in the
			// component reference. Tuning cannot rescue it: an accent-tinted ground cannot
			// carry accent-colored ink, and at ACCENT_MIX 0.14 it is sub-AA on 7 of the 36
			// palette x mode blocks (worst mustard/light at 3.29:1), while lowering the mix
			// to buy contrast collapses the hover surface into the card (the HOVER_DL check
			// below). The call sites now use the DECLARED ink for that surface,
			// --accent-foreground = --text-heading, which is the row above this one. This
			// row stays soft so the number is measured on every run rather than remembered:
			// it is a standing reason not to reintroduce the pairing, not a failure.
			['(non-pair) accent ink on the accent surface — see note', t('--accent'), lxAccent, AA, true],
			// The SAME lesson from the other side, and the reason the row above is not a
			// one-off. --text-muted is gated AA on the two backdrops a palette declares —
			// the canvas and the card (tools/contrast-audit.js PAIRS) — and clears both in
			// all 32 themes. It is NOT gated on the bridge's derived accent surface, and
			// there it is sub-AA on 33 of the 36 palette x mode blocks (3.05:1 at worst).
			// The site header's current-row description shipped at 3.80:1 on exactly that
			// ground. Measured across the three --text-* roles the generated token file actually
			// carried when this was written — heading, body, muted (--text-secondary and --text-label
			// are scored above now that the sheet carries them) —
			// --text-heading is the ONLY
			// one that clears 4.5 on this surface everywhere (worst 7.01) — which is what
			// the bridge already declares --accent-foreground to be. So the rule the two
			// soft rows encode together is: the accent surface has exactly one ink.
			['(non-pair) muted ink on the accent surface — see note', t('--text-muted'), lxAccent, AA, true],
		];

		for (const [name, fg, bg, min, soft] of checks) {
			const ratio = contrastRatio(fg, bg);
			const pass = ratio >= min;
			if (!pass) {
				// 3 dp so a borderline 2.997 doesn't display as a misleading "3.00".
				const line = `${palette}/${mode}: ${name} = ${ratio.toFixed(3)} (need ${min})`;
				(soft ? warnings : failures).push(line);
			}
			rows.push({ palette, mode, name, ratio: ratio.toFixed(3), min, pass, soft });
		}

		// hover surface must be visibly distinct from the card it overlays
		const dl = Math.abs(lOf(lxAccent) - lOf(t('--bg-alt')));
		const hoverPass = dl >= HOVER_DL;
		if (!hoverPass) failures.push(`${palette}/${mode}: hover surface ΔL vs card = ${dl.toFixed(3)} (need ${HOVER_DL})`);
		rows.push({ palette, mode, name: 'hover ΔL vs card', ratio: dl.toFixed(3), min: HOVER_DL, pass: hoverPass });
	}

	const failed = failures.length > 0;
	const checkedPairs = rows.length;
	console.log(
		`shadcn bridge contrast: ${palettes.length} palette×mode blocks, ${checkedPairs} checks — ${failed ? `${failures.length} FAIL` : 'bridge tokens all pass'}${warnings.length ? `, ${warnings.length} theme warnings` : ''}`,
	);
	if (warnings.length) {
		console.log('\n⚠ soft rows below their floor (informational, never a failure — the palette’s own --text-muted on a card, and the accent-on-accent NON-pair the note in `checks` explains):');
		for (const w of warnings) console.log(`  • ${w}`);
	}
	if (failed) {
		console.error('\n✗ bridge contrast failures:');
		for (const f of failures) console.error(`  • ${f}`);
		console.error('\nFix the bridge mapping or the palette-blind ramp in docs/src/styles/tailwind.css.');
		process.exit(1);
	}
	console.log(`\n✓ every bridge-derived/critical pair meets its WCAG floor in all ${new Set(palettes.map((p) => p.palette)).size} palettes (light + dark).`);
}

main();
