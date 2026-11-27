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
const { isLegacySetting } = require('../core/comment-directive.mjs');

/** The ranges of a deck the engine's parser reads as code (lib/core/code-ranges.mjs, shared with Export to Marp). */
const { codeRanges } = require('../core/code-ranges.mjs');

/** What every source hook is handed. Frozen: a hook reads it and never writes it. */
const SOURCE_CTX = Object.freeze({
  /** The ranges of a deck the engine's parser reads as code: nothing inside them is read. */
  codeRanges,
  /** The shared slide-metadata record reader and writer (lib/core/meta-door.mjs). */
  record: Object.freeze({
    readRecord: metaDoor.readRecord,
    isRecordOpener: metaDoor.isRecordOpener,
    isBareRecordOpener: metaDoor.isBareRecordOpener,
    /** An old setting comment (`<!-- _class: x -->`, a pane marker, a bare marker): the door blanks it (slice E). */
    isLegacySetting,
    writeInternal: metaDoor.writeInternal,
    MAY_NEED_DOOR: metaDoor.MAY_NEED_DOOR,
    commentSites: metaDoor.commentSites,
    ownLineSite: metaDoor.ownLineSite,
    blockLead: metaDoor.blockLead,
    ownLineTail: metaDoor.ownLineTail,
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
        const id = d.code === 'meta-forged' ? `${hook.name}/forged` : d.code === 'meta-legacy' ? `${hook.name}/legacy` : `${hook.name}/record`;
        sink.push({ key: `${id}|${d.line}|${d.code}`, id, plugin: hook.name, message: `line ${d.line}: ${d.message} (${d.code}).` });
      }
    }
  }
  return out;
}

module.exports = { runSourceHooks, SOURCE_CTX };
