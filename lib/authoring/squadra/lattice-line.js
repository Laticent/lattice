// The `lattice-line` fix engine (decision 2026-10-26-squadra-lint-library, design.md §7.2): lint-core's
// own line fixers, behind Squadra's FixEngine interface, for the migration only.
//
// The payload is a lint-core finding as it is: `line`, `slide`, `chunkLine`, `replace`,
// `replaceLine`, `indent` and the rule id `fixReplacement` switches on. The engine runs lint-core's
// `applyFix` on it, so every unmigrated rule keeps exactly its own edit, and lowers the result to
// the one smallest edit that turns the text into it: the longest common head and tail are kept. That
// edit is what the driver plans, checks for overlap and fences, and verifies. When the last rule
// moves out of lint-core, this file goes with the bridge (design §15.3).
//
// Pure and fs-free like lint-core, because the Studio bundles it.

/**
 * The single edit that turns `a` into `b`: everything between their common head and tail. The head
 * stops at `anchor` (the start of the line the fix names), because a head that matched past it would
 * slide the edit onto the NEXT line when the two lines share a prefix (deleting one of two identical
 * lines): the edit would then sit on the wrong line, and could land inside a code fence the fixed
 * line is not in.
 */
function trimEdit(a, b, anchor = Number.POSITIVE_INFINITY) {
  const max = Math.min(a.length, b.length);
  let p = 0;
  while (p < max && p < anchor && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  let q = 0;
  while (q < max - p && a.charCodeAt(a.length - 1 - q) === b.charCodeAt(b.length - 1 - q)) q++;
  return { from: p, to: a.length - q, text: b.slice(p, b.length - q) };
}

/** `deps` are lint-core's `applyFix`, `fixLineIndex`, `fmChunks` and slide-split's
 *  `separatorLines`, passed in so this file does not require lint-core (which requires the bridge). */
function latticeLineEngine(deps) {
  return {
    id: 'lattice-line',
    toEdits(source, fix) {
      const text = source.text;
      const next = deps.applyFix(text, fix.payload);
      if (next == null || next === text) return { skip: 'stale', detail: 'the line this fix names is gone, or no longer in the shape it rewrites' };
      const lines = text.split('\n');
      const i = deps.fixLineIndex(lines, deps.separatorLines(lines), deps.fmChunks(text), fix.payload);
      let anchor = 0;
      for (let k = 0; k < i; k++) anchor += lines[k].length + 1;
      return [trimEdit(text, next, i < 0 ? undefined : anchor)];
    },
  };
}

module.exports = { latticeLineEngine, trimEdit };
