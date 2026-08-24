// The AUDIENCE chrome's stylesheet — one source of truth for two host documents
// (HARD RULE #1).
//
// Under the Stage/console split (2026-08-24-stage-console-split.md) the caption
// crawl and the progress rail are AUDIENCE furniture: they belong on whatever
// surface the room is looking at. That is normally the Stage window, whose
// document is assembled as a string by `buildStageDoc` and therefore has no
// Tailwind — but when no Stage is open the console IS the only surface, so the
// same two components render into the Studio's own DOM instead.
//
// Two hosts, one look. So `PresentCaption` and `PresentRail` dropped Tailwind
// utilities for the scoped class names below, and this sheet is injected into
// BOTH documents: the Stage doc bakes it at build time
// (`buildStageDoc({ standalone: true })`), the console renders it in a `<style>`
// beside the dock. A utility-class version plus a hand-written twin is exactly
// the two-copies-of-one-rule drift this repo keeps paying for, so there is only
// ever this file.
//
// COLOR COMES THROUGH THE SITE'S OWN FOUR TOKENS — `--accent`, `--bg`,
// `--text-heading`, `--text-muted` — unchanged from what the Tailwind classes
// resolved to. In the console they are simply in the cascade. A popup cannot
// inherit its opener's cascade, so the controller WRITES the four resolved
// values into the document when it is BUILT (`stageChromeDecls`). That
// is also why `present-rail-tiers.ts` needs no change: its `color-mix(… var(--accent)
// …, var(--bg))` ladder — whose ink levels are measured, not chosen — resolves
// identically in both documents.

/** The masked focus band: only ~3 lines of the crawl are legible at a time. */
const CC_MASK = 'linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)';

export const STAGE_CHROME_CSS = `
.latt-chrome{display:flex;flex-direction:column;align-items:stretch;gap:.5rem;width:100%;}
/* Visually hidden, still announced — the Stage document has no Tailwind \`sr-only\`. */
.latt-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
/* ── the caption crawl ───────────────────────────────────────────────────── */
.latt-cc-band{display:flex;width:100%;justify-content:center;overflow:hidden;max-height:0;opacity:0;transition:max-height .3s,opacity .3s;}
.latt-cc-band[data-shown="1"]{max-height:80px;opacity:1;}
.latt-cc{display:block;height:76px;width:100%;max-width:720px;overflow:hidden;padding:0 1rem;}
.latt-cc-win{position:relative;height:100%;-webkit-mask-image:${CC_MASK};mask-image:${CC_MASK};}
.latt-cc-track{position:absolute;left:0;right:0;will-change:transform;transition:transform .5s cubic-bezier(.22,.61,.36,1);}
.latt-cc-line{padding:.125rem .5rem;text-align:center;font-size:16px;font-weight:600;line-height:1.375;transition:color .3s;color:var(--text-heading);}
.latt-cc-line[data-state="read"]{color:color-mix(in srgb,var(--text-muted) 45%,transparent);}
.latt-cc-line[data-state="up"]{color:color-mix(in srgb,var(--text-muted) 55%,transparent);}
.latt-cc-w{transition:color .15s;}
.latt-cc-line[data-state="now"] .latt-cc-w[data-spoken="0"]{color:var(--text-muted);}
.latt-cc-line[data-state="now"] .latt-cc-w[data-spoken="1"]{color:var(--accent);}
@media (min-width:640px){.latt-cc-line{font-size:18px;}}
/* ── the progress rail ───────────────────────────────────────────────────── */
.latt-rail{display:flex;min-width:0;flex-direction:column;align-items:stretch;gap:.375rem;width:100%;}
.latt-rail-title{height:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;line-height:1;letter-spacing:.16em;color:var(--text-muted);}
.latt-rail-title>span{display:inline-block;animation:latt-fade-rise .4s ease;}
.latt-rail-track{display:flex;min-width:0;align-items:flex-end;gap:.375rem;overflow:hidden;}
.latt-rail-sec{display:flex;min-width:0;flex-direction:column;}
.latt-rail-segs{display:flex;min-width:0;gap:2px;}
.latt-rail-seg{position:relative;height:8px;min-width:0;flex:1 1 0%;outline:none;border:0;padding:0;background:none;cursor:pointer;font:inherit;color:inherit;}
.latt-rail-seg:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.latt-rail-fill{position:absolute;bottom:0;left:0;height:8px;border-radius:999px;}
.latt-rail-fill[data-tier="track"]{left:0;right:0;}
.latt-rail-fill[data-tier="prefetch"]{transition:width .3s;}
.latt-rail-fill[data-tier="progress"]{transition:width .15s;}
.latt-rail-head{position:absolute;bottom:0;height:8px;width:2px;border-radius:999px;transition:left .15s;}
.latt-rail-hit{position:absolute;left:-2px;right:-2px;top:-10px;bottom:-10px;}
@keyframes latt-fade-rise{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);}}
@media (prefers-reduced-motion:reduce){
.latt-cc-band,.latt-cc-track,.latt-cc-line,.latt-cc-w,.latt-rail-fill,.latt-rail-head{transition:none!important;}
.latt-rail-title>span{animation:none!important;}
}
`;

/**
 * The chrome band's palette, as VALUES — the math with no DOM in it.
 *
 * Split out from the painter below because the painter was one step too late. It
 * runs in an effect after the Stage says `ready`, and the audience chrome renders
 * in that same commit — so for one frame (and for however long a React commit
 * takes under load) `--text-heading` was unset and
 * `color-mix(in srgb, var(--text-muted) 45%, transparent)` resolved to an INVALID
 * color, which falls back to `canvastext`: black on a near-black letterbox,
 * measured at 1.12:1. Baking these into the document at build time closes the
 * window entirely — the Stage is a string-built document and should not need a
 * second party to become legible.
 *
 * @param letterbox  the surround, as [r,g,b]
 * @param accent     the app's accent as [r,g,b], or null for the fallback gold
 */
export function stageChromeTokens(letterbox, accent) {
	// VALIDATE, don't just null-check. `NaN` survives `||`, and a NaN accent poisoned every
	// comparison downstream: `contrast()` returned NaN, `NaN < 4.5` is false so neither the
	// lightening loop nor the floor below ever ran, and `css()` clamped the result to black —
	// on a near-black letterbox. A color we cannot read is the default's job, not a value to
	// carry forward.
	const bg = finite3(letterbox) ? letterbox : [21, 17, 13];
	const seed = finite3(accent) ? accent : [200, 160, 64];
	// Lighten the accent until it is legible ON THE LETTERBOX. Bounded by the COUNTER, not
	// by reaching white: twelve 8% steps toward white covers 1 - 0.92^12 ≈ 63% of the way,
	// not 100%, so the "12 steps is white" argument this comment used to make was simply
	// wrong. It terminates because `i < 12` says so; the fallback below is what guarantees a
	// legible result when twelve steps are not enough (a mid-tone accent on a mid-tone
	// letterbox, which `stageChromeTokens` accepts because it is exported and takes both).
	let ink = seed;
	for (let i = 0; i < 12 && contrast(ink, bg) < 4.5; i++) ink = mix(WHITE, ink, 0.08);
	// The floor. If lightening ran out of steps, take whichever pole actually clears —
	// legible-and-off-brand beats on-brand-and-unreadable on the surface a room is reading.
	if (contrast(ink, bg) < 4.5) ink = contrast(WHITE, bg) >= contrast(BLACK, bg) ? WHITE : BLACK;
	return {
		'--bg': css(bg),
		'--accent': css(ink),
		'--on-accent': css(bg),
		'--text-heading': css(mix(WHITE, bg, 0.9)),
		'--text-muted': css(mix(WHITE, bg, 0.65)),
	};
}

/** The same tokens as a CSS declaration body, for baking into a built document. */
export function stageChromeDecls(letterbox, accent) {
	const t = stageChromeTokens(letterbox, accent);
	return Object.keys(t)
		.map((k) => `${k}:${t[k]};`)
		.join('');
}

/** Resolve a token STRING off a live root, for the two callers that have one. */
export function resolveTokenColor(from, name) {
	const view = from?.ownerDocument?.defaultView;
	if (!view) return null;
	return resolveColor(view.getComputedStyle(from).getPropertyValue(name), from.ownerDocument);
}

/** Three real numbers — the only shape the ramp arithmetic is defined for. */
const finite3 = (c) => Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every((n) => Number.isFinite(Number(n)));


const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Resolve a color STRING (token text, hex, color-mix, light-dark) to [r,g,b]. */
function resolveColor(value, doc) {
	const raw = String(value || '').trim();
	if (!raw) return null;
	if (HEX.test(raw)) {
		const h = raw.slice(1);
		const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
		return [Number.parseInt(full.slice(0, 2), 16), Number.parseInt(full.slice(2, 4), 16), Number.parseInt(full.slice(4, 6), 16)];
	}
	try {
		const probe = doc.createElement('span');
		probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0';
		probe.style.color = raw;
		doc.body.appendChild(probe);
		const out = doc.defaultView.getComputedStyle(probe).color;
		probe.remove();
		// A COMPUTED COLOR HAS MORE THAN ONE SERIALIZATION, and reading only the first is how
		// this silently turned a brand accent gray. Chromium reports a plain color as
		// `rgb(122, 90, 16)` — 0–255 — and the result of a `color-mix()` as
		// `color(srgb 0.68 0.61 0.44)`, where the channels are 0–1. Taking "the first three
		// numbers" read the second form as near-black, and the lightening loop then walked it
		// to mid-gray. `color-mix()` is the exact case this probe path exists for.
		if (/^color\(\s*srgb/i.test(out)) {
			const m = out.match(/-?[\d.]+/g);
			return m && m.length >= 3 ? [Number(m[0]) * 255, Number(m[1]) * 255, Number(m[2]) * 255] : null;
		}
		// Anything that is not `rgb()`/`rgba()` is a color space whose three numbers are NOT
		// sRGB channels — `oklch(0.7 0.13 70)` read as sRGB hands a hue ANGLE to the blue
		// channel. There is no honest reading, so say so and let the caller fall back to its
		// own default rather than bake a wrong color into the room's document.
		if (!/^rgba?\(/i.test(out)) return null;
		const m = out.match(/-?[\d.]+/g);
		return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : null;
	} catch {
		return null;
	}
}
const toLin = (c) => {
	const x = c / 255;
	return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
function contrast(a, b) {
	const la = lum(a);
	const lb = lum(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** `over` composited on `under` at `alpha` — the on-dark ink ramp, resolved to a solid. */
const mix = (over, under, alpha) => over.map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha)));
/** CLAMPED, and that is a containment boundary rather than tidiness. This string is
 *  interpolated into the Stage document's `<style>` — the one channel HARD RULE #22's
 *  stylesheet arm is about — and it was the CALLER's discipline, not this function, keeping
 *  it numeric. `Number(c) || 0` also swallows NaN, which otherwise emitted an invalid
 *  declaration that failed silently at `var()` substitution. */
const chan = (c) => Math.max(0, Math.min(255, Math.round(Number(c) || 0)));
const css = ([r, g, b]) => `rgb(${chan(r)}, ${chan(g)}, ${chan(b)})`;
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
