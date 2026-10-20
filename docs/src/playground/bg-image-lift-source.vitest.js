// vitest's stand-in for bg-image-lift-source.js (docs/vitest.config.ts): the Marp export's `![bg]` lift from
// the source, which the browser loads as esm/bg-image-lift.js. Required, not imported: bg-image-lift.js is
// CommonJS with its own requires, which docs/src may not import (vite-cjs-lib-dev.test.ts).

import { createRequire } from 'node:module';

const lift = createRequire(import.meta.url)('../../../lib/core/bg-image-lift.js');

export async function loadBgImageLift() {
	return lift;
}
