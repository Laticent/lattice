// The inline door's sanitizer (lib/core/door-attr.mjs `doorFinishInline`, 2026-10-14-plugin-inline-door.md §4.4),
// through the real slide sanitizer the Studio's door builds (door-run.ts `doorSanitizer`). An inline kind's output
// stands where a word stood, so it may hold phrasing content and a drawing, and nothing that breaks the line.

import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { doorFinishInline } from '../../../../lib/core/door-attr.mjs';
import { createSlideSanitizer } from '../../../../lib/core/sanitize-slide-html.mjs';

// As door-run.ts `doorSanitizer` builds it: the door hands its attribute rule in with each call.
const sanitize = (() => {
	let current: unknown = () => false;
	const s = createSlideSanitizer(DOMPurify, window, { filterAttr: (t: string, n: string, v: string) => (current as (a: string, b: string, c: string) => boolean | string)(t, n, v) });
	return (html: string, filter?: unknown) => {
		current = filter ?? (() => false);
		try {
			return s(html);
		} finally {
			current = () => false;
		}
	};
})();
const finish = (html: string) => doorFinishInline(document, sanitize, html, 'lp-gantt-plugin') as { html: string } | { error: string };

describe('doorFinishInline — phrasing content only', () => {
	it('keeps a span, text and an svg drawing', () => {
		const out = finish('<span class="bar"><svg viewBox="0 0 10 2" width="40" height="8"><rect width="6" height="2"></rect><title>Design, 2</title></svg> Design</span>');
		expect('html' in out).toBe(true);
		expect((out as { html: string }).html).toMatch(/<svg[^>]*><rect/);
	});

	it('refuses a block that would break the sentence, naming it', () => {
		for (const tag of ['div', 'p', 'ul', 'table', 'h2', 'figure']) {
			const out = finish(`<span>x</span><${tag}>y</${tag}>`);
			expect('error' in out, tag).toBe(true);
			expect((out as { error: string }).error).toMatch(new RegExp(`<${tag}>`));
		}
	});

	it('refuses a foreignObject, which would carry HTML back into the line', () => {
		const out = finish('<svg><foreignObject><div>x</div></foreignObject></svg>');
		// The sanitizer may remove it first; either way no block markup comes back.
		expect('html' in out ? (out as { html: string }).html : '').not.toMatch(/<div|foreignObject/i);
	});

	it('keeps every refusal the fence sanitizer makes: a section, a script, nothing at all', () => {
		expect('error' in finish('<section>x</section>')).toBe(true);
		expect('html' in finish('<span>ok</span><script>alert(1)</script>') && !(finish('<span>ok</span><script>alert(1)</script>') as { html: string }).html.includes('<script')).toBe(true);
		expect('error' in finish('<script>alert(1)</script>')).toBe(true);
	});

	it('takes no <a> and no <code> (a link in link text re-parses; a <code> is redrawn as a host kind)', () => {
		for (const tag of ['a', 'code']) {
			const out = finish(`<span>x</span><${tag}>y</${tag}>`);
			expect('error' in out, tag).toBe(true);
		}
	});

	it('strips bidi controls, so a span cannot reverse the author\'s words after it (the red team)', () => {
		const out = finish('<span>\u202Etotal\u2066\u200F</span>') as { html: string };
		expect(out.html).toBe('<span>total</span>');
	});

	it('keeps paint, drops anything that lifts the span out of its line', () => {
		const out = finish('<span style="color:red;position:fixed;inset:0;z-index:9;display:block;width:100vw;padding:0 0.3em;display:inline-flex">x</span>') as { html: string };
		expect(out.html).toBe('<span style="color:red;padding:0 0.3em;display:inline-flex">x</span>');
		const gone = finish('<span style="position:fixed">x</span>') as { html: string };
		expect(gone.html).toBe('<span>x</span>');
		// An address in a style never survives: the slide sanitizer drops the whole attribute first.
		expect((finish('<span style="color:red;background:url(x)">x</span>') as { html: string }).html).toBe('<span>x</span>');
	});
});
