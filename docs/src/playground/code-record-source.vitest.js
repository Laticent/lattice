// vitest's stand-in for code-record-source.js (docs/vitest.config.ts): the code record's writer from the
// source, which the browser loads as esm/code-record.js. Required, not imported: record-edit.js is
// CommonJS with its own require, which docs/src may not import (vite-cjs-lib-dev.test.ts).

import { createRequire } from 'node:module';

const recordEdit = createRequire(import.meta.url)('../../../lib/plugins/code/shared/record-edit.js');

export async function loadCodeRecordWriter() {
	return recordEdit;
}
