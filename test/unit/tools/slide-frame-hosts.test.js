/**
 * THE ONE SLIDE FRAME — the gate that keeps it one.
 *
 * A slide's corner kept coming back wrong on some surface because every surface that shows a
 * slide drew its own box around it: 12px in three arrangements in the exported player, 6px in
 * the Playground, `rounded-xl`/`rounded-lg` across the Studio, 14px on the docs site. Each box
 * rounded a square deck, or cut the edge it carried at the corners (the gapped corners on a
 * phone). `lib/core/slide-frame.mjs` replaced all of them with one rule: the ENGINE owns the
 * slide's shape and opacity, the HOST never shapes it, and the edge + lift are a drop-shadow
 * filter that traces the slide the engine painted.
 *
 * This file fails the moment a host goes back to shaping the slide itself, or a theme gives a
 * slide a see-through canvas. Record: engineering/decisions/2026-09-25-one-slide-frame.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function walk(dir, out = []) {
	for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
		const rel = path.join(dir, e.name);
		if (e.isDirectory()) {
			if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
			walk(rel, out);
		} else out.push(rel);
	}
	return out;
}

const DOCS_SRC = walk('docs/src').filter((f) => /\.(tsx|ts|jsx|js|astro)$/.test(f) && !/\.test\.|\.generated\./.test(f));

/** Chrome a slide host may not carry: it would shape, border, shadow or back the slide. */
const HOST_CHROME = /(^|[\s'"`])(rounded(-[\w[\]./%-]+)?|border(-[\w[\]./%()-]+)?|shadow(-[\w[\]./%(),-]+)?|drop-shadow(-[\w[\]./%(),-]+)?|bg-[\w[\]./%()-]+|ring(-[\w[\]./-]+)?|outline(-[\w[\]./-]+)?|\[(border|border-radius|box-shadow|filter|outline|background)[:-][^\]]*\])(?=[\s'"`]|$)/;
/** Inline-style keys a slide host may not set: they shape, border, filter or back the slide. */
const HOST_STYLE_KEYS = /\b(borderRadius|border(Top|Right|Bottom|Left)?(Width|Style|Color)?|outline\w*|filter|background(Color|Image)?)\s*:/;

/** The opening tag starting at `at`: up to the first `>` outside a `{…}` expression or a string. */
function openingTag(src, at) {
	let depth = 0;
	let quote = null;
	for (let k = at; k < src.length; k++) {
		const c = src[k];
		if (quote) {
			if (c === quote && src[k - 1] !== '\\') quote = null;
		} else if (c === '/' && src[k + 1] === '/') {
			// A JSX attribute comment: its apostrophes are prose, not strings.
			const nl = src.indexOf('\n', k);
			k = nl === -1 ? src.length : nl;
		} else if (c === '/' && src[k + 1] === '*') {
			const end = src.indexOf('*/', k + 2);
			k = end === -1 ? src.length : end + 1;
		} else if (c === '"' || c === "'" || c === '`') quote = c;
		else if (c === '{') depth++;
		else if (c === '}') depth--;
		else if (c === '>' && depth === 0) return src.slice(at, k + 1);
	}
	return src.slice(at);
}

/** The literal class tokens a tag carries: a plain `className="…"`, or the strings in a `cn(…)`. */
function classLiterals(tag) {
	const m = tag.match(/className=("[^"]*"|\{)/);
	if (!m) return [];
	if (m[1].startsWith('"')) return [m[1].slice(1, -1)];
	const expr = openingTag(`<x ${tag.slice(m.index + 'className='.length)}`, 0);
	const body = expr.slice(0, expr.indexOf('}') === -1 ? undefined : expr.lastIndexOf('}') + 1);
	return [...body.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)].map((x) => x[1] ?? x[2] ?? x[3]);
}

/**
 * Every SLIDE HOST in the docs site and the Studio: a `<DeckPreview>`, any element marked
 * `data-slide-frame` (the boxes a host frames itself — the editor preview box, Present's
 * card, a pooled frame, a hand-rolled figure), and any `live-host` (the landing's slide boxes,
 * which must also be marked).
 */
function slideHosts() {
	const hosts = [];
	for (const rel of DOCS_SRC) {
		const src = read(rel);
		const re = /<(DeckPreview\b|[a-z]+\b)/g;
		for (let m = re.exec(src); m; m = re.exec(src)) {
			const tag = openingTag(src, m.index);
			const isDeckPreview = m[1].startsWith('DeckPreview');
			const marked = /\bdata-slide-frame\b/.test(tag);
			const live = /className=[^>]*\blive-host\b/.test(tag);
			if (!isDeckPreview && !marked && !live) continue;
			hosts.push({ where: `${rel}:${src.slice(0, m.index).split('\n').length}`, tag, isDeckPreview, marked, live });
		}
	}
	return hosts;
}

test('every slide host carries no radius, border, shadow or background of its own', () => {
	const hosts = slideHosts();
	assert.ok(hosts.filter((h) => h.marked).length >= 7, `found the marked slide hosts (${hosts.filter((h) => h.marked).length})`);
	const offenders = [];
	for (const h of hosts) {
		for (const lit of classLiterals(h.tag)) {
			const hit = lit.match(HOST_CHROME);
			if (hit) offenders.push(`${h.where} — "${hit[2]}"`);
		}
		// Inline style is the other way to shape a host (`style={{ borderRadius: 16 }}`).
		const style = h.tag.match(/style=\{\{([\s\S]*?)\}\}/)?.[1] ?? '';
		const key = style.match(HOST_STYLE_KEYS);
		if (key) offenders.push(`${h.where} — inline style ${key[1]}`);
		// A marked host must actually wear the frame, and a landing `live-host` must be marked.
		if (h.marked && !h.isDeckPreview && !/slideFrame(Style|Shadow|Filter)\(/.test(h.tag)) offenders.push(`${h.where} — marked data-slide-frame but applies no slide frame`);
		if (h.live && !h.marked && !/\bframe="/.test(h.tag)) offenders.push(`${h.where} — a live-host with no slide frame`);
	}
	assert.deepEqual(offenders, [], 'a slide host shapes the slide itself — use the slide frame instead (docs/src/lib/slide-frame.ts)');
});

test('the slide hosts that wrap their own box use the shared frame, and nothing reads the corner back', () => {
	// These hosts put the frame on a box they own. Each must name the kernel AND mark the box,
	// so the test above can see its classes; a copy of the filter string would drift.
	const hosts = {
		'docs/src/components/DeckPreview.tsx': /slideFrameStyle\(frame\)[^\n]*data-slide-frame/,
		'docs/src/components/studio/preview-pool.tsx': /data-slide-frame[^\n]*slideFrameStyle\('flat'\)/,
		'docs/src/components/studio/StudioShell.tsx': /data-slide-frame[\s\S]*slideFrameShadow\('card'\)/,
		'docs/src/components/studio/PresentOverlay.tsx': /data-slide-frame[^\n]*slideFrameStyle\('stage'\)/,
		'docs/src/components/landing/RestyleShowcase.tsx': /data-slide-frame\s*style=\{slideFrameStyle\('stage'\)\}/,
		'docs/src/components/landing/sections.tsx': /data-slide-frame\s*style=\{slideFrameStyle\('tile'\)\}/,
		'docs/src/playground/specimen.js': /slideFrameShadow\('tile'\)[\s\S]*data-slide-frame/,
		'docs/src/pages/studio.astro': /\.ssr-slidebox\{[^}]*box-shadow:\$\{slideFrameShadow\('card'\)\}/,
		'docs/src/playground/deck-preview.js': /^(?=[\s\S]*slideFrameFilter\('card'\))(?=[\s\S]*"--slide-edge-k")/,
		'lib/export/player-core.mjs': /slideFrameShadow\('stage'\)[\s\S]*slideFrameShadow\('card'\)[\s\S]*slideFrameShadow\('card'\)/,
		// The hosts that SCALE a slide hand the engine its scale, so its edge stays a true 1px…
		'docs/src/lib/single-slide-render.ts': /setProperty\('--slide-edge-k', String\(slideEdgeK\(w\)\)\)/,
		// …and the exporter that captures from a preview frame takes it away again.
		'docs/src/components/studio/export/deck-export.js': /section\.style\.setProperty\('--slide-edge-k', '0'\)/,
	};
	for (const [rel, re] of Object.entries(hosts)) assert.match(read(rel), re, `${rel} frames its slide with the shared kernel`);
	// The Studio's pre-hydration box is CSS, not a tag, so it is checked here.
	const shell = read('docs/src/pages/studio.astro').match(/#studio-ssr-shell \.ssr-slidebox\{[^}]*\}/)?.[0] ?? '';
	assert.doesNotMatch(shell, /border-radius|filter:/, 'the Studio loading box draws no corner of its own');
	// The previous fix measured the slide's radius and copied it onto the host box. It is gone;
	// a host that needs "the deck's corner" gets it from the filter, which needs no radius.
	const readers = DOCS_SRC.filter((rel) => /deck-corner|slideCornerFraction|cornerRadiusCss/.test(read(rel)));
	assert.deepEqual(readers, [], 'nothing measures the slide corner back onto a host box');
});

test('the Playground and the player never give the slide a radius or frame chrome', () => {
	const pg = read('docs/src/playground/deck-preview.js');
	const sectionRule = pg.match(/'\.lattice>section\{[^;]*;transform-origin[\s\S]*?'\}' \+/);
	assert.ok(sectionRule, 'the Playground section rule is where this test expects it');
	assert.doesNotMatch(sectionRule[0], /border-radius|box-shadow/, 'the Playground section keeps the engine corner');
	// Every rule in the player's own CSS that targets the slide or its frame.
	const css = read('lib/export/player-core.mjs');
	const rules = [...css.matchAll(/^([^\n{]*(?:\.lp-frame|section\[data-lattice-slide\])[^\n{]*)\{([^}]*)\}/gm)];
	assert.ok(rules.length >= 5, `found the player's frame + section rules (${rules.length})`);
	for (const [, sel, body] of rules) assert.doesNotMatch(body, /border-radius|box-shadow|(^|;)\s*border:/, `player rule "${sel.trim()}" shapes the slide`);
});

test('the ENGINE owns the slide edge: on a berth above content, the spectrum side yields, never exported', () => {
	// The first cut drew the edge OUTSIDE the slide on each host box, and WebKit clipped it
	// away wherever that box also clipped. A second cut drew it as the section's own
	// `outline`, and a split panel's positioned half painted straight over it. It is an
	// engine berth now; this pins how.
	assert.ok(require('../../../lib/core/fit-berth.js').BERTHS.includes('slide-edge'), 'every render path berths the edge element');
	const css = read('lib/base/base.modifiers.css');
	const rule = css.match(/section > \.slide-edge\[data-lattice-berth\] \{[^}]*\}/)?.[0] ?? '';
	assert.ok(rule, 'the engine edge rule is where this test expects it');
	assert.match(css, /section \{\n[^}]*--_edge-w: calc\(var\(--slide-edge-k, 0\) \* var\(--_sec-1cqi, 1cqi\)\);/, "width = the host scale, in the slide's own units; 0 with no host");
	assert.match(rule, /var\(--_edge-w\)/, 'the berth draws at that width');
	assert.match(css, /background-size: 100% max\(1px, var\(--_edge-w, 0px\)\)/, "a dark slide's 1px top line is at least one screen pixel where it is the edge");
	assert.match(rule, /position: absolute;/, 'over the whole slide');
	assert.match(rule, /z-index: var\(--z-chrome\)/, 'above content');
	assert.match(rule, /border-radius: var\(--slide-radius, 0px\)/, "the slide's own corner, from the length the clip rounds by");
	assert.match(rule, /inset: calc\(-1 \* var\(--_bar-t, 0px\)\)/, 'over the whole border box, under the bars');
	// A BORDER, per-side width = flag x width. Inset shadows were tried first: on an iPhone
	// only their corner arcs painted, while the bars — borders on the same slide — painted whole.
	assert.match(rule, /border-style: solid;/, 'the keyline is a border');
	assert.match(rule, /border-color: var\(--border\);/, "in the deck's --border");
	const widths = rule.match(/border-width:([^;]*);/)?.[1] ?? '';
	assert.deepEqual([...widths.matchAll(/var\(--_edge-([trbl]), 1\) \* var\(--_edge-w\)/g)].map((m) => m[1]), ['t', 'r', 'b', 'l'], 'each side flagged, in border-width order');
	assert.doesNotMatch(rule, /box-shadow/, 'no inset shadows: WebKit on iOS dropped their straight runs');
	assert.match(css, /@media print \{\n {2}section \{ --slide-edge-k: 0 !important; \}\n\}/, 'print never carries a host keyline');
	assert.match(read('lib/base/base.elements.css'), /border-image-slice: 1;\n {2}--_edge-t: 0;/, 'the default top bar is the top edge, said in the rule that paints it');
});

test('every rule that moves or drops the spectrum bar says which edge it now owns', () => {
	// The keyline yields to the bar on whichever side the bar sits, and the side flags live
	// IN the rules that place the bar. A rule that drops the top bar without saying who owns
	// the top edge leaves that slide edgeless or doubled there; one that paints a side bar
	// without silencing that keyline draws a double line. Parsed with css-tree, not a regex,
	// so a selector inside `:is()`, a rule inside `@media`, `border-top: 0` and a bar painted
	// as a section BACKGROUND are all seen — the shapes an earlier regex version missed.
	const csstree = require('css-tree');
	const files = [...walk('lib/base'), ...walk('lib/components'), ...walk('lib/shared'), ...walk('lib/forms'), ...walk('lib/integrations'), ...walk('themes')].filter((f) => f.endsWith('.css'));
	const offenders = [];
	let rulesSeen = 0;
	const targetsSection = (sel) => {
		// The section ITSELF: a compound selector starting with `section`, no top-level combinator.
		const kids = sel.children.toArray();
		return kids[0]?.type === 'TypeSelector' && kids[0].name === 'section' && !kids.some((k) => k.type === 'Combinator' || k.type === 'PseudoElementSelector');
	};
	for (const rel of files) {
		const ast = csstree.parse(read(rel), { parseValue: false, parseCustomProperty: false, onParseError: () => {} });
		csstree.walk(ast, {
			visit: 'Rule',
			enter(rule) {
				if (rule.prelude?.type !== 'SelectorList') return;
				const sels = rule.prelude.children.toArray().filter(targetsSection);
				if (!sels.length) return;
				const decls = {};
				for (const d of rule.block.children.toArray()) if (d.type === 'Declaration') decls[d.property] = csstree.generate(d.value).trim();
				const flag = (side) => `--_edge-${side}` in decls;
				const zero = (v) => /^(none|0|0px)\b/.test(v ?? '');
				const where = `${rel}: ${csstree.generate(rule.prelude)}`;
				rulesSeen++;
				if ((zero(decls['border-top']) || zero(decls['border-top-width']) || zero(decls.border)) && !flag('t')) offenders.push(`${where} drops the top bar but does not say who owns the top edge (--_edge-t)`);
				// A rule that PAINTS a top bar (over another rule that dropped it) owns the top edge too.
				const top = decls['border-top'] ?? '';
				if (top && !zero(top) && /solid/.test(top) && !flag('t')) offenders.push(`${where} paints a top bar but does not say it is the top edge (--_edge-t: 0)`);
				for (const [side, s1] of [['left', 'l'], ['right', 'r'], ['bottom', 'b']]) {
					const v = decls[`border-${side}`] ?? decls[`border-${side}-width`];
					if (v && !zero(v) && /solid|calc|\d/.test(v) && !flag(s1)) offenders.push(`${where} paints a ${side} bar but keeps that keyline (--_edge-${s1})`);
				}
				if (/var\(--spectrum/.test(decls['background-image'] ?? '') && !['t', 'r', 'b', 'l'].some(flag)) offenders.push(`${where} paints a spectrum bar as a background but names no edge flag`);
				// Every border declaration names that side's bar room in the SAME rule, so the edge
				// box (which covers the bars to take the true corner) wins the cascade with it.
				for (const [side, s1] of [['top', 't'], ['right', 'r'], ['bottom', 'b'], ['left', 'l']]) {
					const touches = `border-${side}` in decls || `border-${side}-width` in decls || 'border' in decls;
					if (touches && !(`--_bar-${s1}` in decls)) offenders.push(`${where} sets the ${side} border without --_bar-${s1}`);
				}
			},
		});
	}
	assert.ok(rulesSeen > 100, `parsed the section rules (${rulesSeen})`);
	assert.deepEqual(offenders, []);
});

test('a slide canvas is 100% opaque in every theme', () => {
	// The frame traces the slide's alpha: a see-through canvas would show the host through the
	// slide and put the edge under it. The engine paints `section` with `--bg`, and the title /
	// closing / divider panels with `--surface-inverse` (→ `--brand-canvas`); the dark scheme
	// resolves `--bg` through `--scheme-dark-bg`. None of them may carry alpha.
	const TOKENS = /(?:^|[{;\s])--(bg|scheme-dark-bg|brand-canvas|surface-inverse|print-bg|print-surface-inverse)\s*:\s*([^;}]+)[;}]/gm;
	const ALPHA = /transparent|#[0-9a-f]{4}\b|#[0-9a-f]{8}\b|rgba\(|hsla\(|\/\s*[\d.]+%?\s*\)|color-mix\([^)]*transparent/i;
	const files = [...walk('themes'), ...walk('lib/base'), ...walk('lib/tokens')].filter((f) => f.endsWith('.css'));
	let seen = 0;
	const offenders = [];
	for (const rel of files) {
		for (const m of read(rel).matchAll(TOKENS)) {
			seen++;
			const value = m[2].replace(/\/\*[\s\S]*?\*\//g, '');
			if (ALPHA.test(value)) offenders.push(`${rel}: --${m[1]}: ${value.trim()}`);
		}
	}
	assert.ok(seen > 40, `scanned the canvas tokens (${seen})`);
	assert.deepEqual(offenders, [], 'a theme gives the slide a see-through canvas');
});
