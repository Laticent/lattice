/** The D1 bench plugin's manifest, kept as code: a manifest file on disk would need a schema family. Shared by
 *  plugin-wait-bench.mjs (Playwright) and the iOS Simulator runner. */
const NAME = 'bench-bars';

export const BENCH_MANIFEST = {
	name: NAME,
	type: 'plugin',
	format: 1,
	api: 1,
	title: 'Bench bars',
	description: 'A `bench-bars` fence: a bar chart from `Label: value` lines, colored by its own stylesheet. The D1 benchmark plugin.',
	contributes: { fences: { [NAME]: { body: 'text', placeholder: { placement: 'stage' } } }, styles: true },
};
