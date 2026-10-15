/**
 * lib/plugins/code-format/shared/worker.mjs — the bake's formatter process. Reads `{ jobs }` as JSON on
 * stdin, formats each block, and writes `{ results: [[id, result], …] }` as JSON on stdout. A process
 * because a bake is synchronous (lib/plugins/host-bake.js) and every formatter is asynchronous, the
 * shape Mermaid's bake takes for the same reason (`render.exec.bake: "subprocess"`).
 */

import { formatBlock } from './adapters.mjs';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  input += d;
});
process.stdin.on('end', async () => {
  const { jobs } = JSON.parse(input || '{"jobs":[]}');
  const results = [];
  for (const job of jobs) results.push([job.id, await formatBlock(job)]);
  process.stdout.write(JSON.stringify({ results }));
});
