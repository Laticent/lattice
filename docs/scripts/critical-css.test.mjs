// Unit tests for the critical-CSS extractor (docs/scripts/critical-css.mjs).
// Verifies it keeps rules the slide uses, drops the ones it can't, preserves the
// always-keep at-rules, recurses into @media/@container, and errs toward keeping
// (a dropped-but-needed rule is a visible defect; an extra rule is harmless).

import { describe, expect, it } from 'vitest';
import { extractCriticalCss } from './critical-css.mjs';

const SLIDE = '<div class="lattice"><section class="title"><h1>Hi</h1><p>body</p></section></div>';

describe('extractCriticalCss', () => {
	it('keeps rules whose selectors match the slide', () => {
		const css = '.title{color:red}h1{font-size:2em}.unused-xyz{color:blue}section.kpi{gap:4px}';
		const out = extractCriticalCss(css, SLIDE);
		expect(out).toContain('.title');
		expect(out).toContain('h1');
		expect(out).not.toContain('unused-xyz'); // class absent from the slide
		expect(out).not.toContain('.kpi'); // a component the slide doesn't use
	});

	it('always keeps @font-face and @keyframes (position-independent)', () => {
		const css = '@font-face{font-family:X;src:url(x.woff2)}@keyframes spin{to{transform:rotate(1turn)}}.unused-abc{color:red}';
		const out = extractCriticalCss(css, SLIDE);
		expect(out).toContain('@font-face');
		expect(out).toContain('@keyframes');
		expect(out).not.toContain('unused-abc');
	});

	it('recurses into @media / @container and drops the block only when empty', () => {
		const css = '@media (min-width:1px){.title{color:green}.unused-q{color:red}}@container (min-width:1px){.unused-w{x:1}}';
		const out = extractCriticalCss(css, SLIDE);
		expect(out).toContain('@media');
		expect(out).toContain('.title');
		expect(out).not.toContain('unused-q');
		expect(out).not.toContain('unused-w');
		expect(out).not.toContain('@container'); // its only rule was unused → block dropped
	});

	it('is conservative: keeps a rule with a selector jsdom cannot evaluate', () => {
		const css = 'section:has(> .nope-xyz){color:red}';
		const out = extractCriticalCss(css, SLIDE);
		// :has is stripped to `section`, which matches — kept. (The point is it is not dropped.)
		expect(out).toContain('color:red');
	});

	it('substantially shrinks a sheet dominated by unused rules', () => {
		const used = '.title{color:red}';
		const unused = Array.from({ length: 200 }, (_, i) => `.comp-${i}{color:blue}`).join('');
		const out = extractCriticalCss(used + unused, SLIDE);
		expect(out.length).toBeLessThan((used + unused).length / 4);
		expect(out).toContain('.title');
	});
});
