import { beforeEach, describe, expect, it } from 'vitest';
import { compile } from '../compile';
import { parseScene } from '../schema';
import { MARKS_CAPS, marksRenderer } from './marks';
import { createSvgPainter } from './svg-paint';

// ── THE SHARED PAINTER ────────────────────────────────────────────────────────────────
//
// This file exists because deleting `vivus.test.ts` took 21 cases with it and left the
// painter — extracted from that backend and claimed "verbatim" — with NO test of its own.
// An audit then mutated four things and watched all 3,601 docs tests still pass:
//
//   · `isFadeElement` → `return false`   every `reveal` on an svg scene becomes a no-op
//   · `MARKS_CAPS.draw` → `true`         the refusal the whole marks/drawable split rests on
//   · `EMPHASIS_GAIN` → `0`              `highlight` does nothing
//   · `'script'` out of `STRIP_TAGS`     the HARD RULE #22 defense-in-depth strip
//
// Every case below kills at least one of those. The painter is the ONLY thing painting a
// chart on any surface — live, present, and now a forwarded file — so an untested claim of
// "verbatim" was the weakest link in the whole change.

const MARKUP =
	'<svg viewBox="0 0 100 50"><rect id="fade" x="0" y="0" width="10" height="10" stroke-width="4"/><rect id="mover" x="0" y="20" width="10" height="10"/><rect id="hot" x="0" y="40" width="10" height="10" stroke-width="4"/></svg>';

/** A scene exercising each channel the painter owns: opacity, transform, emphasis. */
const SCENE = {
	source: 'svg' as const,
	duration: 1000,
	hero: 1,
	asset: 'fig',
	elements: [
		{ id: 'fade', pathRef: 'fade', color: 'var(--accent)', motion: [{ verb: 'reveal' as const, at: 0, span: 1 }] },
		{ id: 'mover', pathRef: 'mover', color: 'var(--accent)', motion: [{ verb: 'slide' as const, at: 0, span: 1, from: [10, 0] as [number, number] }] },
		{ id: 'hot', pathRef: 'hot', color: 'var(--accent)', motion: [{ verb: 'highlight' as const, at: 0, span: 1 }] },
	],
};

function mount() {
	const parsed = parseScene(SCENE);
	if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
	const host = document.createElement('div');
	document.body.appendChild(host);
	const r = marksRenderer();
	r.mount(host, parsed.scene, { fig: MARKUP });
	return { host, renderer: r, timeline: compile(parsed.scene) };
}

const el = (host: Element, id: string) => host.querySelector(`#${id}`) as SVGElement;

describe('the shared painter paints every channel it owns', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('reveals a non-drawing element through OPACITY, 0 to 1', () => {
		const { host, renderer, timeline } = mount();
		renderer.draw(timeline.at(0));
		expect(el(host, 'fade').getAttribute('opacity')).toBe('0');
		renderer.draw(timeline.at(1000));
		expect(el(host, 'fade').getAttribute('opacity')).toBe('1');
		// Kills `isFadeElement → false`: without the fade classification nothing writes opacity.
	});

	it('slides an element home by writing a transform', () => {
		const { host, renderer, timeline } = mount();
		renderer.draw(timeline.at(0));
		expect(el(host, 'mover').getAttribute('transform')).toBe('translate(10 0)');
		renderer.draw(timeline.at(1000));
		expect(el(host, 'mover').getAttribute('transform')).toBe('translate(0 0)');
	});

	it('emphasizes via INLINE STYLE stroke-width, not the presentation attribute', () => {
		const { host, renderer, timeline } = mount();
		renderer.draw(timeline.at(1000));
		// 4 * (1 + 1 * 0.9) = 7.6. Kills `EMPHASIS_GAIN → 0`, which leaves it at 4.
		expect(el(host, 'hot').style.strokeWidth).toBe('7.6');
		// Inline style specifically: an untrusted asset can set stroke-width through a <style>
		// rule, which outranks a presentation attribute and would make emphasis a silent no-op.
		expect(el(host, 'hot').getAttribute('stroke-width')).toBe('4');
	});

	it('bakes every channel into the poster it serializes', () => {
		const { renderer, timeline } = mount();
		const still = renderer.poster?.(timeline.at(1000));
		expect(still?.svg).toContain('opacity="1"');
		expect(still?.svg).toContain('translate(0 0)');
		expect(still?.width).toBe(100);
		expect(still?.height).toBe(50);
	});
});

describe('the painter is a HARD RULE #22 sanitize boundary for untrusted asset markup', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	/** Mount raw markup through the painter and hand back what landed in the DOM. */
	function mountRaw(markup: string) {
		const host = document.createElement('div');
		document.body.appendChild(host);
		const painter = createSvgPainter();
		painter.mount(host, { source: 'svg', duration: 1, hero: 1, asset: 'a', elements: [] } as never, markup);
		return host;
	}

	it('strips side-effecting and off-origin elements', () => {
		const host = mountRaw(
			'<svg><script>window.__pwned = 1</script><style>@import url(http://x)</style><image href="http://x/a.png"/><use href="#y"/><foreignObject><div>x</div></foreignObject><animate/><rect id="ok"/></svg>',
		);
		for (const tag of ['script', 'style', 'image', 'use', 'foreignObject', 'animate']) {
			expect(host.querySelectorAll(tag).length, `${tag} survived the inert parse`).toBe(0);
		}
		// The legitimate node must survive, or the assertions above pass on an empty parse.
		expect(host.querySelector('#ok')).not.toBeNull();
	});

	it('removes event handlers and javascript: hrefs', () => {
		const host = mountRaw('<svg><rect id="a" onload="window.__pwned=1" onclick="x()"/><a id="b" href="javascript:alert(1)"><rect/></a></svg>');
		expect(host.querySelector('#a')?.getAttribute('onload')).toBeNull();
		expect(host.querySelector('#a')?.getAttribute('onclick')).toBeNull();
		expect(host.querySelector('#b')?.getAttribute('href')).toBeNull();
	});

	it('does not execute anything while parsing', () => {
		mountRaw('<svg><script>globalThis.__pwned = true</script><img src=x onerror="globalThis.__pwned = true"/></svg>');
		expect((globalThis as { __pwned?: boolean }).__pwned).toBeUndefined();
	});
});

describe('capability negotiation', () => {
	it('the marks backend does NOT advertise draw', () => {
		// Kills `MARKS_CAPS.draw → true`. The whole marks/drawable split rests on this: a
		// drawing scene must be refused rather than mounted as a motionless figure.
		expect(MARKS_CAPS.draw).toBe(false);
		expect(marksRenderer().caps.draw).toBe(false);
	});
});

describe('mount is idempotent', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('re-mounting leaves exactly one svg', () => {
		// The old backend's `mount()` opened with its own `teardown()` and a test pinned this;
		// both were lost in the extraction. The wrappers tear down first, so the shipped
		// Renderer is correct — this pins that it stays correct.
		const { host, renderer } = mount();
		const parsed = parseScene(SCENE);
		if (!parsed.ok) throw new Error('bad scene');
		renderer.mount(host, parsed.scene, { fig: MARKUP });
		expect(host.querySelectorAll('svg')).toHaveLength(1);
	});
});
