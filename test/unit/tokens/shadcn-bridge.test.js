/**
 * Unit: invariants of the shadcn ↔ Lattice token bridge (docs/src/styles/
 * tailwind.css). The website's whole "switch palette → every shadcn component
 * re-themes" guarantee rests on these, and the Preflight-off invariant is what
 * keeps Tailwind from silently resetting the ~7k lines of hand-written site CSS
 * (an accidental full `@import "tailwindcss"` would pull Preflight back in).
 * See engineering/decisions/2026-06-09-shadcn-migration.md §0/§4.2.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const TAILWIND = path.join(ROOT, 'docs/src/styles/tailwind.css');
const css = fs.readFileSync(TAILWIND, 'utf8');

describe('shadcn bridge: Tailwind Preflight is OFF', () => {
	test('imports the theme + utilities layers only, never preflight', () => {
		assert.match(css, /@import\s+['"]tailwindcss\/theme\.css['"]/, 'must import the theme layer');
		assert.match(css, /@import\s+['"]tailwindcss\/utilities\.css['"]/, 'must import the utilities layer');
		assert.doesNotMatch(css, /@import\s+['"]tailwindcss\/preflight/, 'must NOT import preflight (global reset)');
		// The bare `@import "tailwindcss"` pulls in preflight transitively — banned.
		assert.doesNotMatch(css, /@import\s+['"]tailwindcss['"]\s*;/, 'must NOT use the bare tailwindcss import (it includes preflight)');
	});

	test('the baseline reset is scoped to .lx-ui island roots, not global', () => {
		// Every reset selector in the @layer base block must be namespaced to .lx-ui.
		const base = /@layer\s+base\s*\{([\s\S]*?)\n\}/.exec(css);
		assert.ok(base, 'expected an @layer base block');
		// Extract EVERY selector list (the text before each `{`), including bare
		// element selectors like `button {…}` — those are exactly the global-leak
		// case this guard exists to catch, so the matcher must not pre-filter to
		// selectors that start with .#:[ (the original bug: it skipped `button`).
		const body = base[1].replace(/\/\*[\s\S]*?\*\//g, '');
		const selectors = (body.match(/[^{}]+(?=\{)/g) || [])
			.flatMap((group) => group.split(','))
			.map((s) => s.trim())
			.filter(Boolean);
		assert.ok(selectors.length > 0, 'expected scoped reset selectors');
		for (const sel of selectors) {
			assert.match(sel, /\.lx-ui/, `reset selector must be scoped to .lx-ui (global leak): ${sel}`);
		}
	});

	test('a long press on a CONTROL cannot select its label (#1216)', () => {
		// Reported from a real iPhone: press-and-hold a Studio drawer row and iOS selects
		// the word and raises the Copy / Look Up callout instead of the row reading as
		// pressed. Nothing in the app set `user-select` on a control — NOT a Preflight
		// gap (Preflight declares none), but a per-component convention (shadcn's
		// `select-none` utility) that a hand-rolled <button> never opted into.
		//
		// Extraction is bounded to the @layer base BLOCK (same regex as the guard above),
		// not sliced to EOF, so moving the rule out of the layer fails this guard: an
		// unlayered copy would outrank the `utilities` layer, and with it any future
		// `select-text` opt-in (none exists in source today — Tailwind only emits
		// utilities it finds, so one has to be written before it can win).
		const base = /@layer\s+base\s*\{([\s\S]*?)\n\}/.exec(css);
		assert.ok(base, 'expected an @layer base block');
		const body = base[1].replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = body.split('}').find((r) => r.includes("[role='button']"));
		assert.ok(rule, 'expected a control-scoped selection rule inside @layer base');
		// `.lx-ui button` is the arm that fixes the report: an attribute selector does not
		// match an IMPLICIT role, so `[role='button']` could never reach those rows.
		// Dropping it as "redundant" restores the bug.
		assert.match(rule, /\.lx-ui button\b/, 'the bare element selector must stay — [role=button] does not match an implicit role');
		assert.match(rule, /-webkit-user-select:\s*none/);
		assert.match(rule, /[^-]user-select:\s*none/);
		assert.match(rule, /-webkit-touch-callout:\s*none/);
		for (const role of ['button', 'menuitem', 'tab', 'option']) {
			assert.ok(rule.includes(`[role='${role}']`), `role=${role} must be covered`);
		}
	});

	// The two guards below assert the rule's EFFECT, not its text. A red-team pass showed
	// that asserting only the rule's presence is half a guard: a later `user-select: text`
	// on `.lx-ui button` — inside this layer, or unlayered anywhere in the site's ~7k lines
	// of hand-written CSS, which outranks it — restores the reported bug verbatim while a
	// text-presence assertion stays green. The e2e that measures the computed value
	// (docs/e2e/touch-chrome.spec.ts) is NIGHTLY, so on the PR path these are the guard.
	const SITE_CSS_DIR = path.join(ROOT, 'docs/src/styles');
	/** Every `selector { … }` rule that declares `user-select`, across the site's stylesheets. */
	const selectionRules = fs
		.readdirSync(SITE_CSS_DIR)
		.filter((f) => f.endsWith('.css'))
		.flatMap((f) => {
			const text = fs.readFileSync(path.join(SITE_CSS_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
			return [...text.matchAll(/([^{}@]+)\{([^{}]*user-select[^{}]*)\}/g)].map((m) => ({
				file: f,
				selectors: m[1].split(',').map((s) => s.trim()).filter(Boolean),
				body: m[2],
			}));
		});

	test('nothing re-enables selection on an .lx-ui control (#1216 stays fixed)', () => {
		const CONTROL = /\.lx-ui\s+(button|\[role=)/;
		for (const rule of selectionRules) {
			const value = /(?:^|[^-])user-select:\s*([a-z]+)/.exec(rule.body)?.[1];
			if (!value || value === 'none') continue;
			for (const sel of rule.selectors) {
				assert.ok(
					!CONTROL.test(sel) && sel.trim() !== '.lx-ui',
					`${rule.file}: \`${sel}\` sets user-select:${value} on an .lx-ui control — that restores #1216 ` +
						'(a long press selects the label instead of pressing). Scope the opt-in to the specific ' +
						'element that needs it, never to the control baseline.',
				);
			}
		}
	});

	test('selection is never disabled for PROSE', () => {
		// Keyed on which selectors carry `user-select: none`, not on one wildcard shape:
		// `.lx-ui { user-select: none }` or `.lx-ui p { … }` would make the editor, chat
		// transcript, code blocks and panel bodies uncopyable by inheritance — worse than
		// the bug being fixed — and the old wildcard-only matcher was green on exactly that.
		const CONTROL_TOKEN = /(?:^|\s)(button|\[role=|\[data-slot='button'\])/;
		for (const rule of selectionRules) {
			if (!/(?:^|[^-])user-select:\s*none/.test(rule.body)) continue;
			for (const sel of rule.selectors) {
				if (!sel.includes('.lx-ui')) continue; // scoped elsewhere (e.g. a drag gutter) — not ours
				assert.ok(
					CONTROL_TOKEN.test(sel),
					`${rule.file}: \`${sel}\` disables selection for something that is not a control. ` +
						'Prose (the editor, chat transcript, code blocks, panel bodies) must stay selectable.',
				);
			}
		}
	});
});

describe('shadcn bridge: required semantic tokens are mapped', () => {
	const required = [
		'--color-background',
		'--color-foreground',
		'--color-card',
		'--color-popover',
		'--color-primary',
		'--color-primary-foreground',
		'--color-secondary',
		'--color-muted',
		'--color-muted-foreground',
		'--color-accent',
		'--color-accent-foreground',
		'--color-destructive',
		'--color-border',
		'--color-input',
		'--color-ring',
		'--color-chart-1',
		'--color-chart-5',
	];
	for (const token of required) {
		test(`maps ${token}`, () => {
			assert.match(css, new RegExp(`${token.replace(/[-]/g, '\\-')}\\s*:`), `bridge must define ${token}`);
		});
	}

	test('never redefines the Lattice brand --accent (collision guard)', () => {
		// shadcn's accent is a hover surface; the brand must stay --primary, and the
		// bridge must not declare a raw `--accent:` (which would clobber 900+ rules).
		assert.doesNotMatch(css, /(^|[^-])--accent\s*:/m, 'bridge must not redefine the Lattice --accent token');
		assert.match(css, /--color-primary:\s*var\(--accent\)/, 'brand accent must flow through --color-primary');
	});
});

describe('shadcn bridge: contrast gate passes for all 14 palettes', () => {
	test('every bridge-derived/critical pair meets its WCAG floor', () => {
		// Runs the standalone gate; throws (failing the test) on any FAIL.
		const out = execFileSync('node', [path.join(ROOT, 'tools/check-shadcn-bridge-contrast.js')], {
			cwd: ROOT,
			encoding: 'utf8',
		});
		assert.match(out, /every bridge-derived\/critical pair meets its WCAG floor/);
	});
});
