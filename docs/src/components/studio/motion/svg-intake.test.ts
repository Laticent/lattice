// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ART_MAX_BYTES, artNamespace, cutOfTree, ensureViewBox, estimateBox, expandUses, harvestHints, intake, MAX_ROWS, namePart, namespaceIds, placeWord, setPartTitle, splitBand } from './svg-intake';

const parse = (m: string) => new DOMParser().parseFromString(m, 'text/html').querySelector('svg') as SVGSVGElement;
const ok = (r: ReturnType<typeof intake>) => {
	if (!r.ok) throw new Error(`intake refused: ${r.failure} — ${r.message}`);
	return r;
};

const svgOf = (inner: string, attrs = 'viewBox="0 0 100 100"') => `<svg ${attrs} xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const paths = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => `<path id="${prefix}${i}" d="M${i} ${i} H${i + 5}" stroke="var(--accent)"/>`).join('');

describe('the three cases the brief asks about', () => {
	it('3 parts — the root children ARE the cut, and nothing clever happens', () => {
		const r = ok(intake(svgOf(paths(3))));
		expect(r.parts).toHaveLength(3);
		expect(r.parts.every((p) => !p.band)).toBe(true);
		expect(r.receipt.bands).toBe(0);
	});

	it('400 flat parts — binned into contiguous bands, never dropped', () => {
		const r = ok(intake(svgOf(paths(400))));
		expect(r.parts).toHaveLength(Math.ceil(400 / MAX_ROWS));
		expect(r.parts.every((p) => p.band)).toBe(true);
		expect(parse(r.art).querySelectorAll('path')).toHaveLength(400);
		expect(r.receipt.notes.join(' ')).toMatch(/400 shapes, grouped into 17 bands/);
	});

	it('a band is a real wrapper <g> with an id, because the root cannot be addressed', () => {
		const r = ok(intake(svgOf(paths(50))));
		const art = parse(r.art);
		for (const p of r.parts) expect(art.querySelector(`[id="${p.pathRef}"]`), `${p.pathRef} must resolve`).not.toBeNull();
		expect(art.getAttribute('id')).toBeNull();
	});

	it('0 parts, and each cause gets its OWN message because each has a different fix', () => {
		const notSvg = intake('just some text');
		expect(!notSvg.ok && notSvg.failure).toBe('not-svg');
		const noBox = intake('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><path d="M z"/></svg>');
		expect(!noBox.ok && noBox.failure).toBe('no-coordinate-box');
		const empty = intake(svgOf('<defs><path id="a" d="M0 0 H1"/></defs>'));
		expect(!empty.ok && empty.failure).toBe('nothing-survived');
	});

	it('one part is a normal surface, not an error', () => {
		expect(ok(intake(svgOf(paths(1)))).parts).toHaveLength(1);
	});
});

describe('what the sanitizer destroys, and what intake does about it', () => {
	it('expands <use> BEFORE the sanitizer deletes it — a sprite export is not blank', () => {
		const r = ok(intake(svgOf('<defs><path id="tick" d="M0 0 H10" stroke="var(--accent)"/></defs><use href="#tick"/><use href="#tick" x="20"/>')));
		expect(r.receipt.rewritten.usesExpanded).toBe(2);
		const art = parse(r.art);
		expect(art.querySelectorAll('use')).toHaveLength(0);
		expect(r.parts.length).toBeGreaterThanOrEqual(2);
		expect(art.innerHTML).toContain('translate(20 0)');
	});

	it('a <symbol> + <use> icon sheet survives too', () => {
		const r = ok(intake(svgOf('<symbol id="s"><path d="M0 0 H10" stroke="var(--accent)"/></symbol><use href="#s"/>')));
		expect(r.receipt.rewritten.usesExpanded).toBe(1);
		expect(parse(r.art).querySelectorAll('path').length).toBeGreaterThanOrEqual(1);
	});

	it('an unresolvable <use> is counted, not silently dropped', () => {
		const r = ok(intake(svgOf('<use href="#gone"/><path id="a" d="M0 0 H5" stroke="var(--accent)"/>')));
		expect(r.receipt.removed.unresolvedUses).toBe(1);
	});

	it('a <use> cycle stops instead of expanding forever', () => {
		const r = intake(svgOf('<symbol id="s"><use href="#s"/><path d="M0 0 H1"/></symbol><use href="#s"/>'));
		expect(typeof r.ok).toBe('boolean');
	});

	it('reports a removed <style> block — the classes survive with nothing defining them', () => {
		const r = ok(intake(svgOf('<style>.a{fill:red}</style><path id="q" class="a" d="M0 0 H10" stroke="var(--accent)"/>')));
		expect(r.receipt.removed.stylesheets).toBe(1);
		expect(r.art).not.toContain('<style');
		expect(r.art).toContain('class="a"');
	});

	it('strips <image> at intake — it SURVIVES DOMPurify and would be an off-origin fetch in the deck', () => {
		const r = ok(intake(svgOf('<image href="https://tracker.example/x.png" width="10" height="10"/><path id="a" d="M0 0 H5" stroke="var(--accent)"/>')));
		expect(r.receipt.removed.images).toBe(1);
		expect(r.art).not.toContain('tracker.example');
	});

	it('strips animateTransform / animateMotion, which also survive DOMPurify', () => {
		const r = ok(intake(svgOf('<path id="a" d="M0 0 H5" stroke="var(--accent)"><animateTransform attributeName="transform" type="rotate"/></path>')));
		expect(r.receipt.removed.smil).toBe(1);
		expect(r.art.toLowerCase()).not.toContain('animatetransform');
	});

	it('drops a BOM, which survives the sanitizer as a text node', () => {
		expect(ok(intake(`﻿${svgOf(paths(2))}`)).art).not.toContain('﻿');
	});

	it('counts unsafe nodes rather than swallowing them', () => {
		const r = ok(intake(svgOf('<script>alert(1)</script><path id="a" d="M0 0 H5" stroke="var(--accent)"/>')));
		expect(r.receipt.removed.unsafe).toBeGreaterThanOrEqual(1);
		expect(r.art).not.toContain('<script');
	});
});

describe('id namespacing — two assets on one deck must not corrupt each other', () => {
	it('prefixes every id, <defs> included, and rewrites every url(#…) reference', () => {
		const r = ok(intake(svgOf('<defs><linearGradient id="grad"><stop offset="0"/></linearGradient></defs><rect id="box" width="10" height="10" fill="url(#grad)"/><path id="a" d="M0 0 H5" stroke="var(--accent)"/>')));
		const art = parse(r.art);
		expect(art.querySelector('[id="grad"]')).toBeNull();
		const grad = art.querySelector('lineargradient, linearGradient');
		expect(grad?.getAttribute('id')).toMatch(/^m[a-z0-9]+-grad$/);
		expect(art.querySelector('rect')?.getAttribute('fill')).toBe(`url(#${grad?.getAttribute('id')})`);
	});

	it('two intakes of DIFFERENT drawings get different namespaces', () => {
		const a = ok(intake(svgOf('<path id="x" d="M0 0 H5" stroke="var(--accent)"/>')));
		const b = ok(intake(svgOf('<path id="x" d="M0 0 H9" stroke="var(--accent)"/>')));
		expect(a.parts[0].pathRef).not.toBe(b.parts[0].pathRef);
	});

	it('the same bytes give the same ids — a re-paste reconciles instead of resetting', () => {
		const src = svgOf(paths(4));
		expect(ok(intake(src)).parts.map((p) => p.pathRef)).toEqual(ok(intake(src)).parts.map((p) => p.pathRef));
	});

	it('de-duplicates a repeated author id — the painter is first-wins and parseScene rejects a duplicate pathRef', () => {
		const svg = parse(svgOf('<path id="dup" d="M0 0 H1"/><path id="dup" d="M2 2 H3"/>'));
		expect(namespaceIds(svg, 'ns').duplicates).toBe(1);
		const ids = Array.from(svg.querySelectorAll('[id]')).map((e) => e.getAttribute('id'));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('an id containing a regex replacement token does not corrupt its reference', () => {
		const svg = parse('<svg><defs><clipPath id="a$&b"><rect width="1" height="1"/></clipPath></defs><rect clip-path="url(#a$&b)" width="2" height="2"/></svg>');
		namespaceIds(svg, 'ns');
		const clip = svg.querySelector('clippath, clipPath')?.getAttribute('id');
		expect(svg.querySelector('rect[clip-path]')?.getAttribute('clip-path')).toBe(`url(#${clip})`);
	});

	it('every minted id starts with the namespace, so none can land in the DOMPurify clobbering set', () => {
		const r = ok(intake(svgOf('<path id="title" d="M0 0 H5" stroke="var(--accent)"/><path id="body" d="M1 1 H6" stroke="var(--accent)"/>')));
		for (const p of r.parts) expect(p.pathRef).toMatch(/^m[a-z0-9]+-/);
		const art = parse(r.art);
		for (const p of r.parts) expect(art.querySelector(`[id="${p.pathRef}"]`)).not.toBeNull();
	});
});

describe('the coordinate box', () => {
	it('keeps a usable viewBox untouched', () => {
		expect(ensureViewBox(parse('<svg viewBox="0 0 40 20"><path d="M0 0 H1"/></svg>'))).toEqual({ box: [0, 0, 40, 20], stamped: false });
	});

	it('stamps one from px width/height', () => {
		const svg = parse('<svg width="60" height="30"><path d="M0 0 H1"/></svg>');
		const { box, stamped } = ensureViewBox(svg);
		expect(stamped).toBe(true);
		expect(box).toEqual([0, 0, 60, 30]);
		expect(svg.getAttribute('viewBox')).toBe('0 0 60 30');
	});

	it('derives one from the drawing itself when width/height are percentages', () => {
		const svg = parse('<svg width="100%" height="100%"><rect x="10" y="10" width="80" height="40"/></svg>');
		const { box, stamped } = ensureViewBox(svg);
		expect(stamped).toBe(true);
		expect(box?.[2]).toBeGreaterThan(80);
		expect(svg.getAttribute('viewBox')).toBeTruthy();
	});
});

describe('naming', () => {
	const view: [number, number, number, number] = [0, 0, 90, 90];

	it('prefers a <title>, which is also what gives the shipped graphic its accessible name', () => {
		const el = parse('<svg><g id="g1"><title>Revenue ring</title><path d="M0 0 H1"/></g></svg>').querySelector('g') as Element;
		expect(namePart(el, view, new Map(), 'g1')).toBe('Revenue ring');
	});

	it('reads a harvested inkscape:label, which the sanitizer would have destroyed', () => {
		const el = parse('<svg><path id="p1" d="M0 0 H1"/></svg>').querySelector('path') as Element;
		expect(namePart(el, view, new Map([['p1', 'Outer ring']]), 'p1')).toBe('Outer ring');
	});

	it('takes a humane author id but rejects an exporter serial', () => {
		const humane = parse('<svg><path id="outer-ring" d="M0 0 H1"/></svg>').querySelector('path') as Element;
		expect(namePart(humane, view, new Map(), 'outer-ring')).toBe('Outer Ring');
		const serial = parse('<svg><path id="path2847" d="M0 0 H1"/></svg>').querySelector('path') as Element;
		expect(namePart(serial, view, new Map(), 'path2847')).toMatch(/^Shape/);
	});

	it('uses a text node its own words', () => {
		const el = parse('<svg><text id="t" x="1" y="2">Revenue</text></svg>').querySelector('text') as Element;
		expect(namePart(el, view, new Map(), 't')).toBe('Revenue');
	});

	it('falls back to shape plus place, so two nameless paths are still tellable apart', () => {
		const r = ok(intake(svgOf('<rect x="2" y="2" width="10" height="10" stroke="var(--accent)"/><rect x="80" y="80" width="10" height="10" stroke="var(--accent)"/>')));
		expect(r.parts[0].label).not.toBe(r.parts[1].label);
		expect(r.parts.map((p) => p.label).join('|')).toMatch(/upper left|lower right/);
	});

	it('places a box in the right third', () => {
		expect(placeWord([0, 0, 5, 5], view)).toBe('upper left');
		expect(placeWord([40, 40, 5, 5], view)).toBe('center');
		expect(placeWord([80, 80, 5, 5], view)).toBe('lower right');
	});

	it('makes every label distinct', () => {
		const r = ok(intake(svgOf('<path d="M1 1 H2" stroke="var(--accent)"/><path d="M1 1 H3" stroke="var(--accent)"/>')));
		expect(new Set(r.parts.map((p) => p.label)).size).toBe(r.parts.length);
	});

	it('strips markup out of a harvested label — a hint is data, never markup', () => {
		const svg = parse('<svg><path id="p" inkscape:label="<img src=x onerror=alert(1)>" d="M0 0 H1"/></svg>');
		expect(harvestHints(svg).get('p') ?? '').not.toMatch(/[<>]/);
	});
});

describe('what can move, and what only looks like it can', () => {
	it('a group is NOT drawable — createDrawable on a <g> makes it flash on, silently', () => {
		const r = ok(intake(svgOf('<g id="grp"><path d="M0 0 H5"/><path d="M1 1 H6"/></g><path id="solo" d="M2 2 H7" stroke="var(--accent)"/>')));
		expect(r.parts.find((p) => p.tag === 'g')?.drawable).toBe(false);
		expect(r.parts.find((p) => p.tag === 'path')?.drawable).toBe(true);
	});

	it('text is addressable but not drawable', () => {
		const r = ok(intake(svgOf('<text id="t" x="1" y="2" stroke="var(--accent)">Hi</text><path id="a" d="M0 0 H5"/>')));
		expect(r.parts.find((p) => p.tag === 'text')?.drawable).toBe(false);
	});

	it('a fill-only shape cannot be emphasized — highlight paints stroke-width and nothing else', () => {
		const r = ok(intake(svgOf('<rect id="f" width="10" height="10" fill="var(--accent)"/><path id="s" d="M0 0 H5" stroke="var(--accent)"/>')));
		expect(r.parts.find((p) => p.pathRef.endsWith('-f'))?.strokeable).toBe(false);
		expect(r.parts.find((p) => p.pathRef.endsWith('-s'))?.strokeable).toBe(true);
	});

	it('inherits a stroke from an ancestor', () => {
		const r = ok(intake(svgOf('<g id="wrap" stroke="var(--accent)"><path id="a" d="M0 0 H5"/><path id="b" d="M1 1 H6"/></g>')));
		expect(r.parts.every((p) => p.strokeable)).toBe(true);
	});
});

describe('the cut of the tree', () => {
	it('unwraps a lone wrapper group, however many deep', () => {
		expect(cutOfTree(parse(svgOf(`<g id="Layer_1"><g id="inner">${paths(3)}</g></g>`)))).toHaveLength(3);
	});

	it('does not unwrap a group that is one of several', () => {
		expect(cutOfTree(parse(svgOf('<g id="a"><path d="M0 0 H1"/><path d="M1 1 H2"/></g><g id="b"><path d="M2 2 H3"/></g>')))).toHaveLength(2);
	});

	it('ignores <defs> and friends when reading the cut', () => {
		expect(cutOfTree(parse(svgOf(`<defs><path id="d" d="M0 0 H1"/></defs><title>T</title>${paths(2)}`)))).toHaveLength(2);
	});
});

describe('the measured ceilings', () => {
	it('refuses a drawing over the ceiling, and says what to do', () => {
		const r = intake(svgOf(paths(4000, 'zzzzzzzzzzzzzzz')));
		expect(!r.ok && r.failure).toBe('too-big');
		expect(!r.ok && r.message).toMatch(/too big to travel inside a deck/);
	});

	it('warns, without refusing, between the warn line and the ceiling', () => {
		let n = 200;
		let r = ok(intake(svgOf(paths(n))));
		while (r.receipt.artBytes < 24 * 1024 && n < 3000) {
			n += 200;
			r = ok(intake(svgOf(paths(n))));
		}
		expect(r.receipt.artBytes).toBeLessThan(ART_MAX_BYTES);
		expect(r.receipt.notes.join(' ')).toMatch(/slow to edit/);
	});
});

describe('the receipt reports rather than hides', () => {
	it('counts the fixed colors that will not follow the deck theme', () => {
		expect(ok(intake(svgOf('<path id="a" d="M0 0 H5" stroke="#ff0000"/><rect id="b" width="4" height="4" fill="#00ff00"/>'))).receipt.kept.fixedColors).toBe(2);
	});

	it('does not count var(--token) paint as fixed — that IS palette-blind', () => {
		expect(ok(intake(svgOf('<path id="a" d="M0 0 H5" stroke="var(--accent)"/>'))).receipt.kept.fixedColors).toBe(0);
	});
});

describe('small pure helpers', () => {
	it('estimates a box from geometry attributes, without layout', () => {
		expect(estimateBox(parse('<svg><rect x="1" y="2" width="3" height="4"/></svg>').querySelector('rect') as Element)).toEqual([1, 2, 3, 4]);
		expect(estimateBox(parse('<svg><circle cx="10" cy="10" r="5"/></svg>').querySelector('circle') as Element)).toEqual([5, 5, 10, 10]);
	});

	it('derives a stable namespace from content — readable ids, NOT what keeps two copies apart', () => {
		// Content-derivation is for legibility. `reinstance` (instance.test.ts) is what stops one
		// drawing inserted twice from carrying the same ids into one document; a hash cannot, the two
		// copies being the same bytes.
		expect(artNamespace('abc')).toBe(artNamespace('abc'));
		expect(artNamespace('abc')).not.toBe(artNamespace('abd'));
		expect(artNamespace('abc')).toMatch(/^m[a-z0-9]+$/);
	});

	it('expandUses aborts rather than shipping a half-expanded drawing', () => {
		const inner = Array.from({ length: 60 }, (_, i) => `<path d="M${i} 0 H1"/>`).join('');
		const uses = Array.from({ length: 200 }, () => '<use href="#big"/>').join('');
		expect(expandUses(parse(svgOf(`<defs><g id="big">${inner}</g></defs>${uses}`))).aborted).toBe(true);
	});
});

describe('a band is not a wall — Split gets back down to one shape', () => {
	const banded = () => {
		const r = intake(svgOf(paths(50)));
		if (!r.ok) throw new Error(r.message);
		return r;
	};

	it('unwraps a band into its members, each independently addressable', () => {
		const r = banded();
		const band = r.parts.find((p) => p.band);
		if (!band) throw new Error('expected a band');
		const out = splitBand(r.art, band.pathRef);
		expect(out).not.toBeNull();
		expect(out?.members.length).toBeGreaterThan(1);
		const art = parse(out?.art ?? '');
		// The wrapper is gone and every member still resolves — the address is what makes it move.
		expect(art.querySelector(`[id="${band.pathRef}"]`)).toBeNull();
		for (const m of out?.members ?? []) expect(art.querySelector(`[id="${m.pathRef}"]`)).not.toBeNull();
	});

	it('loses no shape when it unwraps', () => {
		const r = banded();
		const band = r.parts.find((p) => p.band);
		const out = splitBand(r.art, band?.pathRef ?? '');
		expect(parse(out?.art ?? '').querySelectorAll('path')).toHaveLength(50);
	});

	it('refuses to dissolve a group the AUTHOR drew — that one may carry a transform its children need', () => {
		const r = intake(svgOf('<g id="mine" transform="translate(4,4)"><path d="M0 0 H5" stroke="var(--accent)"/><path d="M1 1 H6" stroke="var(--accent)"/></g><path id="solo" d="M2 2 H7" stroke="var(--accent)"/>'));
		if (!r.ok) throw new Error(r.message);
		const authored = r.parts.find((p) => p.tag === 'g');
		expect(splitBand(r.art, authored?.pathRef ?? '')).toBeNull();
	});
});

describe('a rename reaches the DRAWING, so it survives a save', () => {
	const one = () => {
		const r = intake(svgOf(paths(2)));
		if (!r.ok) throw new Error(r.message);
		return r;
	};

	it('writes the label as the part\'s <title>, which is rung one of the naming cascade', () => {
		const r = one();
		const ref = r.parts[0].pathRef;
		const art = setPartTitle(r.art, ref, 'Outer ring');
		expect(parse(art).querySelector(`[id="${ref}"] > title`)?.textContent).toBe('Outer ring');
		// And it round-trips: a fresh intake of that art reads the name back.
		const again = intake(art);
		expect(again.ok && again.parts.find((p) => p.label === 'Outer ring')).toBeTruthy();
	});

	it('replaces an existing title rather than leaving two, which makes the name ambiguous', () => {
		const r = one();
		const ref = r.parts[0].pathRef;
		const art = setPartTitle(setPartTitle(r.art, ref, 'First'), ref, 'Second');
		expect(parse(art).querySelectorAll(`[id="${ref}"] > title`)).toHaveLength(1);
		expect(parse(art).querySelector(`[id="${ref}"] > title`)?.textContent).toBe('Second');
	});

	it('a name that is only punctuation clears the title instead of writing an empty one', () => {
		const r = one();
		const ref = r.parts[0].pathRef;
		const art = setPartTitle(setPartTitle(r.art, ref, 'Real name'), ref, '***');
		expect(parse(art).querySelector(`[id="${ref}"] > title`)).toBeNull();
	});

	it('does not let a label smuggle markup into the drawing', () => {
		const r = one();
		const art = setPartTitle(r.art, r.parts[0].pathRef, '<img src=x onerror=alert(1)>');
		// The property that matters is that nothing becomes an ELEMENT or an ATTRIBUTE. The words
		// survive as inert text inside <title>, which is correct — a title is text, and a label reading
		// "img src x onerror alert 1" is a person's own doing, not an injection.
		expect(art).not.toMatch(/<img/i);
		expect(art).not.toMatch(/onerror=/i);
		const title = parse(art).querySelector('title');
		expect(title?.children).toHaveLength(0);
		expect(title?.textContent ?? '').not.toMatch(/[<>]/);
	});
});

describe('the red-team findings, each pinned so it cannot come back', () => {
	it('REOPEN does not re-namespace — running intake on its own output is idempotent', () => {
		// The Library's Edit button feeds STORED art back through intake. Prefixing a second time made
		// every saved pathRef match nothing: every part read "no longer in the drawing", the plan
		// emitted no elements, parseScene refused it, and the asset could not be saved out of again.
		const first = intake(svgOf(paths(3)));
		if (!first.ok) throw new Error(first.message);
		const second = intake(first.art);
		if (!second.ok) throw new Error(second.message);
		expect(second.parts.map((p) => p.pathRef)).toEqual(first.parts.map((p) => p.pathRef));
		expect(second.art).not.toMatch(/id="m[a-z0-9]+-m[a-z0-9]+-/);
		// And a third pass is still stable — reopen, edit, save, reopen.
		const third = intake(second.art);
		expect(third.ok && third.parts.map((p) => p.pathRef)).toEqual(first.parts.map((p) => p.pathRef));
	});

	it('a minted pathRef never collides with an id the drawing already had', () => {
		// A drawing carrying `id="p1"` plus an unnamed shape used to mint `<ns>-p1` for the unnamed
		// one too. Either parseScene refused the asset ("a bug on our side"), or — when the twin sat
		// in <defs> — it validated and bound the part to a GRADIENT, animating the wrong node.
		const r = intake(svgOf('<rect width="10" height="10" stroke="var(--accent)"/><rect id="p1" x="20" width="10" height="10" stroke="var(--accent)"/>'));
		if (!r.ok) throw new Error(r.message);
		const refs = r.parts.map((p) => p.pathRef);
		expect(new Set(refs).size).toBe(refs.length);
		const art = parse(r.art);
		for (const ref of refs) expect(art.querySelectorAll(`[id="${ref}"]`)).toHaveLength(1);
	});

	it('a defs id cannot shadow a part — the part must bind to the shape, not the gradient', () => {
		const r = intake(svgOf('<defs><linearGradient id="p1"><stop offset="0"/></linearGradient></defs><rect width="30" height="30" fill="url(#p1)" stroke="var(--accent)"/><rect id="hat" x="40" width="30" height="30" stroke="var(--accent)"/>'));
		if (!r.ok) throw new Error(r.message);
		const art = parse(r.art);
		for (const p of r.parts) {
			const node = art.querySelector(`[id="${p.pathRef}"]`);
			expect(node?.tagName.toLowerCase(), `${p.pathRef} must not bind to a defs node`).not.toMatch(/gradient|clippath|mask|filter/i);
		}
	});

	it('closes every off-origin fetch, not just the one wearing an <image> tag', () => {
		// Measured in real Chromium against a beacon: fill, mask, feImage and a style
		// background-image ALL fetched. The harm is the one the <image> strip names — a call to
		// someone else's server from the Studio origin, and from every exported copy of the deck.
		const r = intake(svgOf('<defs><filter id="f"><feImage href="https://evil.example/a"/></filter></defs><rect id="a" width="9" height="9" fill="url(https://evil.example/b#g)" stroke="var(--accent)"/><rect id="b" x="20" width="9" height="9" mask="url(https://evil.example/c#m)" stroke="var(--accent)"/><rect id="c" x="40" width="9" height="9" style="background-image:url(https://evil.example/d)" stroke="var(--accent)"/>'));
		if (!r.ok) throw new Error(r.message);
		expect(r.art).not.toContain('evil.example');
		expect(r.art.toLowerCase()).not.toContain('feimage');
		expect(r.receipt.removed.offOrigin).toBeGreaterThan(0);
	});

	it('keeps an INTERNAL url(#…) reference, which is the whole point of namespacing them', () => {
		const r = intake(svgOf('<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect id="a" width="9" height="9" fill="url(#g)" stroke="var(--accent)"/>'));
		if (!r.ok) throw new Error(r.message);
		expect(r.art).toMatch(/fill="url\(#m[a-z0-9]+-g\)"/);
		expect(r.receipt.removed.offOrigin).toBe(0);
	});

	it('refuses an oversized paste on the RAW bytes, before spending a parse on it', () => {
		// A 2 MB paste took 78 seconds in real Chromium to reach the sanitized-bytes ceiling and be
		// refused for its size anyway — freezing the tab, and the user's unsaved deck, throughout.
		const huge = svgOf(paths(20000, 'padpadpadpadpadpad'));
		const started = Date.now();
		const r = intake(huge);
		expect(!r.ok && r.failure).toBe('too-big');
		expect(Date.now() - started, 'a refusal this size must not cost a parse').toBeLessThan(2000);
	});

	it('a band reports the shapes the AUTHOR drew, not the titles we added', () => {
		const r = intake(svgOf(paths(50)));
		if (!r.ok) throw new Error(r.message);
		const band = r.parts.find((p) => p.band);
		if (!band) throw new Error('expected a band');
		const before = band.childCount;
		const renamed = setPartTitle(r.art, band.pathRef, 'A group');
		const after = intake(renamed);
		expect(after.ok && after.parts.find((p) => p.pathRef === band.pathRef)?.childCount).toBe(before);
	});
});

describe('the checker findings, pinned', () => {
	it('a band id cannot be shadowed by one the drawing already had', () => {
		// `svg-paint`'s node map is first-wins, so an author's own `id="band-1"` would take the
		// choreography meant for the 15 shapes our band wraps.
		const shapes = Array.from({ length: 30 }, (_, i) => `<rect id="r${i}" x="${i}" width="2" height="2" stroke="var(--accent)"/>`).join('');
		const r = intake(svgOf(`${shapes}<g id="band-1"><rect x="90" width="2" height="2" stroke="var(--accent)"/></g>`));
		if (!r.ok) throw new Error(r.message);
		const art = parse(r.art);
		const ids = Array.from(art.querySelectorAll('[id]')).map((e) => e.getAttribute('id'));
		expect(new Set(ids).size, 'no duplicate id may reach the stored art').toBe(ids.length);
		for (const p of r.parts) expect(art.querySelectorAll(`[id="${p.pathRef}"]`)).toHaveLength(1);
	});

	it('never makes more rows than the cap, at any size intake accepts', () => {
		// `ceil(n / 24)` bands only stays under 24 while n <= 576; 600 shapes made 25 rows. Sizes are
		// kept under the byte ceiling on purpose — past it the drawing is refused for its SIZE first,
		// which is the other guard doing its job, not this one.
		const tight = (n: number) => svgOf(`<g stroke="var(--accent)">${Array.from({ length: n }, (_, i) => `<path id="q${i}" d="M${i} 0h2"/>`).join('')}</g>`);
		for (const n of [576, 600, 1400]) {
			const r = intake(tight(n));
			if (!r.ok) throw new Error(`${n}: ${r.message}`);
			expect(r.parts.length, `${n} shapes`).toBeLessThanOrEqual(MAX_ROWS);
			expect(r.parts.length, `${n} shapes must still band, not list`).toBeLessThan(n);
		}
	});

	it('calls declarative animation what it is, not "a script or event handler"', () => {
		// The receipt is the one screen this module exists to make honest.
		const r = intake(svgOf('<path id="a" d="M0 0 H5" stroke="var(--accent)"><animate attributeName="opacity" to="0"/><set attributeName="fill" to="red"/></path>'));
		if (!r.ok) throw new Error(r.message);
		expect(r.receipt.removed.smil).toBeGreaterThanOrEqual(2);
		expect(r.receipt.removed.unsafe).toBe(0);
	});

	it('still counts a real script as unsafe', () => {
		const r = intake(svgOf('<script>alert(1)</script><path id="a" d="M0 0 H5" stroke="var(--accent)"/>'));
		if (!r.ok) throw new Error(r.message);
		expect(r.receipt.removed.unsafe).toBeGreaterThanOrEqual(1);
	});
});
