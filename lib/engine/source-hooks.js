/**
 * lib/engine/source-hooks.js
 *
 * The engine's half of the SOURCE HOOK contribution (`contributes.source`, lib/plugins/plugin.schema.json): the `ctx`
 * a hook is handed, and the loop that runs every hook at an engine door. A hook takes from the host what it may not
 * import (a plugin reaches nothing outside its folder, tools/structure.js): the shared slide-metadata reader and the
 * fence scan (HARD RULE #1).
 */

const { SOURCE_HOOKS } = require('../plugins/source.generated.js');
const metaDoor = require('../core/meta-door.mjs');
const { fenceRanges } = require('../core/fence-ranges.mjs');
const { boundaryParser: md, FRONT_MATTER } = require('../core/boundary-parser.mjs');

/**
 * The `[start, end)` ranges of `src` the ENGINE's parser reads as code (fences and indented code blocks), wherever a
 * record could be hidden by the difference.
 */
function codeRanges(src) {
  const loose = fenceRanges(src);
  if (!loose.length) return [];
  // The line scan's fences over-reach (any indent; an unclosed fence runs to the end). They decide nothing unless a
  // record or an internal spelling sits inside one, so only then is the engine's block parse paid (about 2 ms on a
  // 1,400-line deck): every other deck keeps the cheap answer, which agrees with the parse everywhere it matters.
  let k = 0;
  const inLoose = (at) => {
    while (k < loose.length && loose[k][1] <= at) k++;
    return k < loose.length && at >= loose[k][0];
  };
  const interesting = /<!--\s*(?:\{|@meta\{|lat-)/gi;
  let hit = false;
  for (let m = interesting.exec(src); m && !hit; m = interesting.exec(src)) hit = inLoose(m.index);
  if (!hit) return loose;
  const fm = (src.match(FRONT_MATTER) || [''])[0];
  const body = src.slice(fm.length);
  const starts = [0];
  for (let i = body.indexOf('\n'); i !== -1; i = body.indexOf('\n', i + 1)) starts.push(i + 1);
  const tokens = [];
  md.block.parse(body, md, {}, tokens);
  return tokens
    .filter((t) => (t.type === 'fence' || t.type === 'code_block') && t.map)
    .map((t) => [fm.length + starts[t.map[0]], fm.length + (t.map[1] < starts.length ? starts[t.map[1]] : body.length)])
    .sort((a, b) => a[0] - b[0]);
}

/** What every source hook is handed. Frozen: a hook reads it and never writes it. */
const SOURCE_CTX = Object.freeze({
  /** The ranges of a deck the engine's parser reads as code: nothing inside them is read. */
  codeRanges,
  /** The shared slide-metadata record reader and writer (lib/core/meta-door.mjs). */
  record: Object.freeze({
    readRecord: metaDoor.readRecord,
    isRecordOpener: metaDoor.isRecordOpener,
    writeInternal: metaDoor.writeInternal,
    MAY_NEED_DOOR: metaDoor.MAY_NEED_DOOR,
    commentSites: metaDoor.commentSites,
    ownLineSite: metaDoor.ownLineSite,
  }),
});

/**
 * THE SOURCE HOOKS (`contributes.source`, lib/plugins/source.generated.js): each embedded plugin's pure transform of
 * the deck's Markdown, run on LF source at every public door, BEFORE plugin admission, the background-image lift, the
 * pane gate and the parse. Today the one hook is `meta`'s door, which compiles slide-metadata records to the engine's
 * internal comment in place (lib/core/meta-door.mjs; engineering/decisions/2026-10-17-meta-record.md §5.1). A hook
 * keeps every line where it is, so no source position moves. `sink` gathers what each hook reports, as plugin
 * diagnostics; a door that reports nothing (geometry, the pane probe) passes none.
 */
function runSourceHooks(markdown, sink) {
  if (typeof markdown !== 'string') return markdown;
  let out = markdown;
  for (const hook of SOURCE_HOOKS) {
    const r = hook.compileSource(out, SOURCE_CTX);
    out = r.source;
    if (sink) {
      for (const d of r.diagnostics) {
        const id = d.code === 'meta-forged' ? `${hook.name}/forged` : `${hook.name}/record`;
        sink.push({ key: `${id}|${d.line}|${d.code}`, id, plugin: hook.name, message: `line ${d.line}: ${d.message} (${d.code}).` });
      }
    }
  }
  return out;
}

module.exports = { runSourceHooks, SOURCE_CTX };
