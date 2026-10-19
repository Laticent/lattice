/**
 * The cold-start writer test, part 2: run the writers.
 *
 *   node run-writers.mjs <out dir> [model ...]        default models: opus sonnet haiku
 *
 * Each writer is a fresh `claude -p` call with no tools, no skills, no settings sources and no
 * project instructions, started in a directory that holds nothing: it can read no rule sheet because
 * it can read nothing. Its only input is the prompt from briefs.mjs. The raw reply is saved untouched
 * (`<model>.raw.md`) with the call's own account of what ran (`<model>.meta.json`: the model id that
 * served it, token counts, cost), so the result can be re-graded without re-running a model.
 *
 * These calls spend real money (a few cents each). Run it on purpose.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { briefs, prompt } from './briefs.mjs';

const [out, ...models] = process.argv.slice(2);
if (!out) throw new Error('usage: node run-writers.mjs <out dir> [model ...]');
mkdirSync(out, { recursive: true });
const list = briefs();
const text = prompt(list);
writeFileSync(path.join(out, 'prompt.txt'), `${text}\n`);

for (const model of models.length ? models : ['opus', 'sonnet', 'haiku']) {
  const env = { ...process.env };
  // Project instructions from added directories would hand the writer a rule sheet.
  delete env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD;
  const r = spawnSync('claude', [
    '-p', text,
    '--model', model,
    '--tools', '',
    '--setting-sources', '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--output-format', 'json',
  ], { cwd: out, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 600000 });
  if (r.status !== 0) {
    console.error(`${model}: exit ${r.status}\n${r.stderr}`);
    continue;
  }
  const reply = JSON.parse(r.stdout);
  writeFileSync(path.join(out, `${model}.raw.md`), `${reply.result}\n`);
  const { result: _result, ...meta } = reply;
  writeFileSync(path.join(out, `${model}.meta.json`), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`${model}: ${Object.keys(reply.modelUsage || {}).join(', ')} · ${reply.usage?.output_tokens ?? '?'} output tokens · $${(reply.total_cost_usd ?? 0).toFixed(4)}`);
}
