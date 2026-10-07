// The icon PICKER in the Studio editor: each icon name the autocomplete offers (`^{da`, or
// `icon=da` in a pill or a chart record) shows its drawing beside it. The names come from the lint
// core's vocabulary, which carries no drawing; the drawings are the icons plugin's DATA script, and
// it loads only when this menu first opens with an icon in it (engineering/decisions/
// 2026-09-29-inline-icons.md § 10, phase 3). Until it lands each row shows a blank square of the
// same size, so the menu does not reflow when the drawings arrive.
//
// Built as DOM from the plugin's own data — six shape elements and their attributes, the
// structure lib/plugins/icons/icons.inline.js `svgElement` builds — never as markup, so nothing
// here parses a string (HARD RULE #22 has no sink to count).

import type { Completion } from '@codemirror/autocomplete';
import { ensurePluginData } from '@/lib/ensure-plugin-data';

type Shape = [string, Record<string, string | number>];
const SVG_NS = 'http://www.w3.org/2000/svg';

function drawings(): Record<string, Shape[]> | null {
	const data = (window as unknown as { __latticePluginData?: Record<string, { icons?: Record<string, Shape[]> }> }).__latticePluginData;
	return data?.icons?.icons ?? null;
}

/** Draw icon `name` into `host` from the loaded data; false when the data is not here yet. The grid
 *  (IconGrid.tsx) draws with it too. */
export function paintIcon(host: HTMLElement, name: string): boolean {
	const shapes = drawings()?.[name];
	if (!shapes) return false;
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	for (const [tag, attrs] of shapes) {
		const el = document.createElementNS(SVG_NS, tag);
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
		svg.appendChild(el);
	}
	host.replaceChildren(svg);
	return true;
}

let loading: Promise<void> | null = null;

/** The `addToOptions` entry: a drawing before each icon name, and nothing on any other option. */
export const iconPreviewOption = {
	position: 20,
	render(completion: Completion): Node | null {
		if (completion.detail !== 'icon') return null;
		const host = document.createElement('span');
		host.className = 'cm-completionIconPreview';
		if (!paintIcon(host, completion.label)) {
			// First open: fetch the drawings once, then fill every row still showing. The loader never
			// rejects (no engine script yet, a failed fetch), so a load that brought nothing is
			// forgotten and the next open tries again rather than leaving blank rows for the session.
			loading ??= ensurePluginData('`^{icon}`').finally(() => {
				if (!drawings()) loading = null;
			});
			void loading.then(() => paintIcon(host, completion.label));
		}
		return host;
	},
};

/** Its look, for the editor theme: a square a little taller than the row's text (at 1.25em the
 *  drawings measured about 10px and read as blots), in the row's ink. */
export const iconPreviewTheme = {
	'.cm-completionIconPreview': {
		display: 'inline-block',
		width: '1.6em',
		height: '1.6em',
		paddingRight: '0.5em',
		verticalAlign: '-0.45em',
	},
	'.cm-completionIconPreview svg': {
		width: '100%',
		height: '100%',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: '2',
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
	},
};
