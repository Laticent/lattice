// Critical-CSS extraction — given the full engine stylesheet and one rendered
// slide's HTML, return only the CSS rules that slide can actually use.
//
// WHY. The engine emits the WHOLE component-library sheet (~563KB) for any deck,
// regardless of which components a slide uses. Inlining that into the build-time
// SSG first-slide shell (studio.astro) would bloat the HTML and defeat the LCP
// win it exists to deliver. This prunes it to the rules whose selectors match the
// slide's real DOM — typically ~20% of the sheet, ~15KB gzipped for a title
// slide — which paints the slide faithfully at HTML-parse time, no JS, no engine.
// See engineering/decisions/2026-07-11-preview-performance-diagnosis.md (front B).
//
// HOW. css-tree parses the sheet to an AST; jsdom gives a real DOM to test
// selectors against (`document.querySelector`). Both are loaded via createRequire
// so Astro/Vite treats them as build-time externals rather than trying to bundle
// them into a page chunk.
//
// CONSERVATIVE BY DESIGN. When a selector uses a pseudo jsdom can't evaluate
// (`:has`, `::selection`, container-query internals) the rule is KEPT, never
// dropped — a slightly-larger critical sheet is harmless; a dropped rule that the
// slide needed is a visible defect. @font-face / @keyframes / @property / @import
// are always kept (position-independent, cheap, and hard to prove unused safely).

import { createRequire } from 'node:module';
import { join } from 'node:path';

// Anchor at the real working dir (docs/ under `astro build`, the repo root under a
// standalone node run) so bare specifiers resolve via node's upward node_modules
// walk. import.meta.url would point at the bundled chunk under Vite, which can't
// reliably reach the root node_modules where css-tree/jsdom live (devDeps).
const require = createRequire(join(process.cwd(), 'noop.cjs'));
const csstree = require('css-tree');
const { JSDOM } = require('jsdom');

// Pseudo-classes/elements jsdom can't (or shouldn't) be asked to match; strip
// them from the probe selector so the STRUCTURAL part still tests, and keep the
// rule if what remains matches. A functional pseudo we can't evaluate → keep.
const STRIP_PSEUDO =
	/::[a-z-]+(\([^)]*\))?|:(hover|focus|focus-within|focus-visible|active|visited|target|checked|disabled|enabled|first-child|last-child|only-child|first-of-type|last-of-type|nth-child\([^)]*\)|nth-of-type\([^)]*\)|not\([^)]*\)|is\([^)]*\)|where\([^)]*\)|has\([^)]*\))/gi;

// At-rules whose contents we never prune (position-independent or unsafe to
// prove-unused): keep verbatim.
const KEEP_ATRULES = new Set(['font-face', 'keyframes', '-webkit-keyframes', 'property', 'import', 'charset']);

function makeMatcher(slideHtml) {
	const { document } = new JSDOM(`<!doctype html><html><head></head><body>${slideHtml}</body></html>`).window;
	return (selectorText) => {
		const probe = selectorText.replace(STRIP_PSEUDO, '').replace(/\s+/g, ' ').trim();
		if (!probe || probe === '*') return true; // universal / emptied by strip → keep
		try {
			return !!document.querySelector(probe);
		} catch {
			return true; // selector jsdom can't parse → keep (safe)
		}
	};
}

// Prune one block's children in place; return how many survived.
function pruneBlock(node, matches) {
	if (!node?.children) return 0;
	let kept = 0;
	node.children.forEach((child, item, list) => {
		if (child.type === 'Rule') {
			const sel = csstree.generate(child.prelude);
			if (sel.split(',').some((s) => matches(s))) kept++;
			else list.remove(item);
		} else if (child.type === 'Atrule') {
			const name = (child.name || '').toLowerCase();
			if (KEEP_ATRULES.has(name)) {
				kept++;
			} else if (child.block) {
				// @media / @container / @supports / @layer{…} — recurse; drop if empty.
				if (pruneBlock(child.block, matches) > 0) kept++;
				else list.remove(item);
			} else {
				kept++; // bodiless at-rule (e.g. `@layer a, b;`) — keep for ordering.
			}
		} else {
			kept++;
		}
	});
	return kept;
}

/**
 * Extract the critical CSS for one rendered slide.
 * @param {string} fullCss   The full engine stylesheet (`render().css`).
 * @param {string} slideHtml The slide's HTML (`render().html`).
 * @returns {string} A pruned stylesheet containing only rules the slide can use.
 */
export function extractCriticalCss(fullCss, slideHtml) {
	const matches = makeMatcher(slideHtml);
	const ast = csstree.parse(fullCss);
	pruneBlock(ast, matches);
	return csstree.generate(ast);
}
