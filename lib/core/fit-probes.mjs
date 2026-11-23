// lib/core/fit-probes.mjs — the fit probes a live measuring frame runs, as ONE same-origin file.
//
// WHY A FILE. The Studio and the Playground measure a non-16:9 deck in a hidden, same-origin
// `srcdoc` frame (docs/src/lib/measured-split.ts), and a srcdoc frame inherits its page's
// Content-Security-Policy. That policy allows a script only from our origin or by the hash of its
// exact text, and no eval (docs/scripts/csp.mjs). The measure used to reach the frame as source text
// run with `contentWindow.eval`, and `fitVerdict` built its two probes with `Function(…)`: under
// the policy both throw, every measurement fell back to the structural split, and the CSP build
// check dropped the policy from every page that can load the measuring chunk. So the probes now
// live in one generated file, `lattice-fit-probes.js`, staged beside `lattice-frame-agents.js`
// (docs/scripts/sync-playground-assets.mjs). The measuring frame names it with a `src` tag, the
// file sets `window[FIT_PROBES_GLOBAL]` in the frame's own realm, and the host calls those
// functions directly: no string is evaluated anywhere. The CLI keeps its own path (lattice.js
// `page.evaluate`), which no page policy governs.
//
// PURE, FS-FREE AND IMPORT-FREE: the docs build calls `fitProbesSource` in Node with the three CJS
// modules, and measured-split.ts imports only the names and the URL helper, so the probe sources stay out of
// the browser bundle.

/** The probes file's name, beside `lattice-frame-agents.js` in the versioned asset directory. */
export const FIT_PROBES_FILE = 'lattice-fit-probes.js';

/**
 * The probes file's URL for a frame that loads the runtime from `runtimeUrl`: the same directory,
 * as `frameAgentsUrl` finds the agents file (lib/core/frame-agents.mjs).
 * @param {string} runtimeUrl
 * @returns {string}
 */
export function fitProbesUrl(runtimeUrl) {
	const path = String(runtimeUrl || '').split(/[?#]/)[0];
	return path.slice(0, path.lastIndexOf('/') + 1) + FIT_PROBES_FILE;
}

/** The global the probes file sets in the frame it runs in. */
export const FIT_PROBES_GLOBAL = '__latticeFitProbes';

/**
 * The slides a preview frame holds, top level only (a split's continuation sections nest in no
 * other section). The measure reads slides through this function, so the CLI reads its own
 * (`DECK_SLIDES_SRC`) and a preview reads this one.
 * @param {Document} doc
 */
export function previewSlides(doc) {
	return [...doc.querySelectorAll('section[data-lattice-slide]')].filter((s) => !s.parentElement?.closest('section'));
}

/**
 * The text of `lattice-fit-probes.js`, from `lib/core/fit-measure.js`, `lib/core/overflow-probe.js`
 * and `lib/core/table-reflow-fit.js` (passed in, so this module imports nothing).
 * @param {{ fitMeasure: Record<string, string>, overflowProbe: Record<string, string>, tableReflowFit: Record<string, string> }} mods
 * @returns {string}
 */
export function fitProbesSource({ fitMeasure, overflowProbe, tableReflowFit }) {
	const parts = {
		verdict: fitMeasure.FIT_VERDICT_SRC,
		measure: fitMeasure.MEASURE_FIT_SRC,
		overflow: fitMeasure.OVERFLOW_BY_SLIDE_SRC,
		foldable: fitMeasure.FOLDABLE_SRC,
		probe: overflowProbe.PROBE_SRC,
		cc: overflowProbe.CONTENT_CLIPPED_SRC,
		slides: previewSlides.toString(),
		forceReflow: tableReflowFit.FORCE_OVERFLOWING_REFLOW_SRC,
	};
	for (const [k, v] of Object.entries(parts)) if (typeof v !== 'string' || !v) throw new Error(`fit-probes: no source for ${k}`);
	return (
		'/* Lattice fit probes (lib/core/fit-probes.mjs). Generated; do not edit. */\n' +
		'(function(){var P={\n' +
		Object.entries(parts)
			.map(([k, v]) => JSON.stringify(k) + ':(' + v + ')')
			.join(',\n') +
		'\n};Object.defineProperty(window,' +
		JSON.stringify(FIT_PROBES_GLOBAL) +
		',{value:Object.freeze(P),configurable:false,enumerable:false,writable:false});})();\n'
	);
}
