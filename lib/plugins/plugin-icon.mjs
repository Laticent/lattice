// A plugin's mark, drawn from its manifest's `icon` (plugin.schema.json): a viewBox and a list of
// paths, each tagged with the ink it takes. The mark is DATA, not markup, and this is the one
// place that turns it into SVG — so a plugin from any channel, a zip one included, can only ever
// hand us path numbers: no element, attribute, color, script or style of its own reaches the page.
//
// Colors come from the page, never from the plugin. Each path carries a class for its ink and
// the host's stylesheet maps it to theme tokens (docs: styles/catalog.css `.plugin-icon`):
//   line   → stroked in the heading ink
//   accent → stroked in the palette's accent
//   fill   → filled with the palette's accent
// So a mark follows the theme picker and light/dark on every palette, whatever the device's own
// color scheme says (the bug an <img> mark had: it read prefers-color-scheme, not the site).
//
// The schema already refuses anything but path commands and numbers; this re-checks rather than
// trusts it, because a manifest can reach here without the schema run (a zip read in a browser).
// Pure: no DOM, no fs. Returns '' for a missing or malformed icon, and the caller shows a fallback.

const INKS = { line: 'plugin-icon-line', accent: 'plugin-icon-accent', fill: 'plugin-icon-fill' };
const VIEWBOX = /^0 0 [1-9][0-9]{0,3} [1-9][0-9]{0,3}$/;
const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.-]+$/;
const MAX_PATHS = 24;
const MAX_D = 2000;

/** True when `icon` is a well-formed manifest icon. */
export function isPluginIcon(icon) {
	if (!icon || typeof icon !== 'object' || Array.isArray(icon) || !only(icon, ICON_KEYS)) return false;
	if (typeof icon.viewBox !== 'string' || !VIEWBOX.test(icon.viewBox)) return false;
	if (!Array.isArray(icon.paths) || icon.paths.length < 1 || icon.paths.length > MAX_PATHS) return false;
	// A for loop rather than every(): every() skips the holes of a sparse array.
	for (let i = 0; i < icon.paths.length; i++) if (!isPath(icon.paths[i])) return false;
	return true;
}

// As strict as the schema, which also refuses unknown keys (additionalProperties: false).
const ICON_KEYS = ['viewBox', 'paths'];
const PATH_KEYS = ['ink', 'd', 'width'];
const only = (o, keys) => Object.keys(o).every((k) => keys.includes(k));

function isPath(p) {
	return (
		!!p &&
			typeof p === 'object' &&
			only(p, PATH_KEYS) &&
			typeof p.ink === 'string' &&
			Object.hasOwn(INKS, p.ink) &&
			typeof p.d === 'string' &&
			p.d.length >= 2 &&
			p.d.length <= MAX_D &&
			PATH.test(p.d) &&
			(p.width === undefined || (typeof p.width === 'number' && p.width >= 0.5 && p.width <= 16))
	);
}

/**
 * The icon as an SVG string, decorative (aria-hidden): the plugin's name says what it is.
 * @param {object} icon     the manifest's `icon`
 * @param {object} [opts]   { size = 26, className = '' }
 */
export function pluginIconSvg(icon, { size = 26, className = '' } = {}) {
	if (!isPluginIcon(icon)) return '';
	const px = Number.isFinite(size) && size > 0 ? Math.round(size) : 26;
	const cls = ['plugin-icon', ...String(className).split(/\s+/).filter((c) => /^[a-z][a-z0-9-]*$/.test(c))].join(' ');
	const paths = icon.paths
		.map((p) => {
			const stroke = p.ink === 'fill' ? '' : ` stroke-width="${p.width ?? 6}" stroke-linecap="round" stroke-linejoin="round"`;
			return `<path class="${INKS[p.ink]}" d="${p.d}"${stroke}/>`;
		})
		.join('');
	return `<svg class="${cls}" viewBox="${icon.viewBox}" width="${px}" height="${px}" aria-hidden="true" focusable="false">${paths}</svg>`;
}
