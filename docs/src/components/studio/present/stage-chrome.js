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
// values onto the Stage's root when the window opens (`paintStageTokens`). That
// is also why `present-rail-tiers.ts` needs no change: its `color-mix(… var(--accent)
// …, var(--bg))` ladder — whose ink levels are measured, not chosen — resolves
// identically in both documents.

/** The masked focus band: only ~3 lines of the crawl are legible at a time. */
const CC_MASK = 'linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)';

export const STAGE_CHROME_CSS = `
.latt-chrome{display:flex;flex-direction:column;align-items:center;gap:.5rem;width:100%;}
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
 * The four tokens the sheet above reads, resolved off `from` (the console's own
 * root) and written onto `root` (the Stage document's). A popup inherits none of
 * its opener's cascade, so without this the audience chrome would paint against
 * `initial` — the rail's whole measured ink ladder collapsing to transparent.
 *
 * Re-run on every palette change, not once at open: the Studio's palette picker
 * is live, and a Stage left on the previous palette is a mismatch the ROOM sees.
 */
export const STAGE_TOKENS = ['--accent', '--on-accent', '--bg', '--text-heading', '--text-muted'];
export function paintStageTokens(root, from) {
	if (!root || !from) return;
	const cs = from.ownerDocument.defaultView?.getComputedStyle(from);
	if (!cs) return;
	for (const name of STAGE_TOKENS) {
		const v = cs.getPropertyValue(name).trim();
		if (v) root.style.setProperty(name, v);
	}
}
