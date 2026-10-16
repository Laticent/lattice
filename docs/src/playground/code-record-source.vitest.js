// vitest's stand-in for code-record-source.js (docs/vitest.config.ts): the code record's writer from the
// source, which the browser loads as esm/code-record.js.

import recordEdit from '../../../lib/plugins/code/shared/record-edit.js';

export async function loadCodeRecordWriter() {
	return recordEdit;
}
