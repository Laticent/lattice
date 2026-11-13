// vitest's stand-in for lint-core-source.js (aliased in docs/vitest.config.ts): authoring-core
// .generated.js (built on install, not committed), which tools/build-authoring-core.js builds from
// the same entry the browser loads as esm/lint.js. Node has no engine directory to load from.
export async function loadLintCore() {
	return import('./authoring-core.generated.js');
}

/** No worker under vitest: the Studio's lint client finds no address and lints on the calling thread. */
export function lintCoreUrl() {
	return null;
}
