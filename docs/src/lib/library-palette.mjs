// One source for every library's colors: `library-palettes.json`.
//
// Each library has ROLES (named [light, dark] pairs: primary, accent, ring, ...). Two surfaces
// are generated from them, so a color is written once:
//   - the inline <style> of its three brand SVGs (`docs/public/<lib>-{mark,mark-min,lockup}.svg`),
//     written by `tools/build-library-marks.js`. An <img>-loaded SVG cannot read a stylesheet, so
//     the colors must be baked in; generating them is how they stay in step.
//   - the theme tokens of its demo page (`docs/src/pages/libraries/<lib>/index.astro`), emitted by
//     `LibraryTheme.astro` from `pageThemeCss`.
// A value written `@role` resolves to that role's light or dark color. Everything else is literal.
import palettes from './library-palettes.json' with { type: 'json' };

export const libraries = Object.keys(palettes.libs);

const lib = (name) => {
	const p = palettes.libs[name];
	if (!p) throw new Error(`library-palette: no palette for "${name}"`);
	return p;
};

// '@primary' -> the role's color for scheme idx (0 light, 1 dark); anything else passes through.
const resolve = (roles, value, idx, where) => {
	if (typeof value !== 'string' || !value.startsWith('@')) return value;
	const role = roles[value.slice(1)];
	if (!role) throw new Error(`library-palette: ${where} uses unknown role ${value}`);
	return role[idx];
};

/** The text inside a brand SVG's <style>: light rules, then a dark `@media` swap. */
export function markStyle(name) {
	const { roles, mark } = lib(name);
	const light = [];
	const dark = [];
	for (const [cls, props] of mark) {
		const lp = props.map(([prop, v]) => `${prop}:${resolve(roles, v, 0, `${name} .${cls}`)}`);
		light.push(`.${cls}{${lp.join(';')}}`);
		const dp = props.filter(([, v]) => v.startsWith('@')).map(([prop, v]) => `${prop}:${resolve(roles, v, 1, `${name} .${cls}`)}`);
		if (dp.length) dark.push(`.${cls}{${dp.join(';')}}`);
	}
	return `${light.join('')}@media(prefers-color-scheme:dark){${dark.join('')}}`;
}

const decls = (tokens, indent) => Object.entries(tokens).map(([k, v]) => `${indent}${k}: ${v};`).join('\n');

/** The page's resolved tokens, `{light, dark}`; `dark` holds only what the dark scheme overrides. */
export function pageTokens(name) {
	const { roles, page } = lib(name);
	const light = {};
	for (const [k, v] of Object.entries({ ...palettes.shared.light, ...page.light })) light[k] = resolve(roles, v, 0, `${name} ${k}`);
	const dark = {};
	for (const [k, v] of Object.entries(page.dark)) dark[k] = resolve(roles, v, 1, `${name} ${k}`);
	return { light, dark };
}

/** The page's theme tokens: light `:root`, the OS-dark swap, and the explicit data-theme overrides. */
export function pageThemeCss(name) {
	const { light, dark } = pageTokens(name);
	// Under an explicit `data-theme="light"` the tokens the dark scheme overrides must be put back.
	const lightBack = Object.fromEntries(Object.keys(dark).map((k) => [k, light[k]]));
	return [
		`:root {\n${decls(light, '\t')}\n}`,
		`@media (prefers-color-scheme: dark) {\n\t:root:not([data-theme="light"]) {\n${decls(dark, '\t\t')}\n\t}\n}`,
		`:root[data-theme="light"] {\n${decls(lightBack, '\t')}\n}`,
		`:root[data-theme="dark"] {\n${decls(dark, '\t')}\n}`,
	].join('\n');
}
