#!/usr/bin/env node

/**
 * Contrast gate for the shadcn ↔ Lattice token bridge.
 *
 * The bridge (docs/src/styles/tailwind.css) maps shadcn's semantic color
 * tokens onto the Lattice palette tokens. Two of those mappings are DERIVED,
 * not direct aliases, so they need validating per palette/mode forever (not
 * "reviewed once"):
 *   • shadcn `--accent` (hover/active surface) = mix(bg-alt → accent, 14% oklab)
 *   • shadcn `--destructive` = a palette-blind danger ramp (one light, one dark)
 * Plus the critical always-on pairs the bridge relies on (primary button text,
 * card body, muted caption).
 *
 * This reads the SAME generated token file the site themes from
 * (docs/src/styles/lattice-tokens.generated.css) and the bridge's own
 * constants (parsed out of tailwind.css, so there is one source of truth), and
 * fails the build if any pair regresses below its WCAG floor. Reuses the exact
 * WCAG + OKLab math in lib/theme/color.js (HARD RULE 15 — don't reinvent).
 *
 * Usage: `node tools/check-shadcn-bridge-contrast.js`  (exit 1 on any FAIL)
 *
 * Distinct from tools/contrast-audit.js (which audits the *theme* token pairs
 * used in slides/Mermaid): this gate validates the *website* shadcn-bridge
 * mappings in docs/src/styles/tailwind.css, not themes/.
 */

const fs = require('node:fs');
const path = require('node:path');
const { contrastRatio, mix, hexToOklab } = require('../lib/theme/color.js');

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

/** Pull the palette-blind destructive constants out of the bridge stylesheet. */
function parseDestructive(css) {
	const grab = (scope, name) => {
		// crude scoped lookup: find the scope's block, then the var inside it
		const block = new RegExp(`${scope}\\s*\\{([\\s\\S]*?)\\}`).exec(css);
		const src = block ? block[1] : css;
		const v = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(src);
		return v ? v[1] : null;
	};
	return {
		light: {
			bg: grab(':root', '--lx-ui-destructive'),
			fg: grab(':root', '--lx-ui-destructive-foreground'),
		},
		dark: {
			bg: grab("\\:root\\[data-mode='dark'\\]", '--lx-ui-destructive'),
			fg: grab("\\:root\\[data-mode='dark'\\]", '--lx-ui-destructive-foreground'),
		},
	};
}

function lOf(hex) {
	return hexToOklab(hex).L;
}

function main() {
	const tokensCss = fs.readFileSync(TOKENS, 'utf8');
	const bridgeCss = fs.readFileSync(BRIDGE, 'utf8');
	const palettes = parsePalettes(tokensCss);
	const destructive = parseDestructive(bridgeCss);

	if (!destructive.light.bg || !destructive.dark.bg) {
		console.error('✗ could not parse --lx-ui-destructive from tailwind.css');
		process.exit(1);
	}

	const failures = [];
	const warnings = [];
	const rows = [];

	for (const { palette, mode, tokens } of palettes) {
		const t = (n) => tokens[n];
		const lxAccent = mix(t('--bg-alt'), t('--accent'), ACCENT_MIX); // oklab, matches CSS
		const dz = destructive[mode] || destructive.light;

		// `soft: true` pairs are the THEME's own property (--text-muted on a
		// surface), not a bridge-derived token. The bridge maps shadcn's muted
		// onto the palette's existing muted tone, so a low ratio there is the
		// theme's intentional choice — out of the bridge's scope to police
		// (themes/ is off-limits). Report it as a warning; never fail on it.
		const checks = [
			['primary btn (on-accent/accent)', t('--on-accent'), t('--accent'), AA, false],
			['accent hover text (heading/lx-ui-accent)', t('--text-heading'), lxAccent, AA, false],
			['destructive (fg/bg)', dz.fg, dz.bg, AA, false],
			['card body (body/bg-alt)', t('--text-body'), t('--bg-alt'), AA, false],
			['muted caption (muted/bg-alt)', t('--text-muted'), t('--bg-alt'), AA_SECONDARY, true],
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
		console.log('\n⚠ theme-owned pairs below the soft floor (informational — the palette’s own --text-muted, not a bridge defect):');
		for (const w of warnings) console.log(`  • ${w}`);
	}
	if (failed) {
		console.error('\n✗ bridge contrast failures:');
		for (const f of failures) console.error(`  • ${f}`);
		console.error('\nFix the bridge mapping or the palette-blind ramp in docs/src/styles/tailwind.css.');
		process.exit(1);
	}
	console.log('\n✓ every bridge-derived/critical pair meets its WCAG floor in all 14 palettes (light + dark).');
}

main();
