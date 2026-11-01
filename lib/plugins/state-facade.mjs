/**
 * lib/plugins/state-facade.mjs — what a plugin's syntax rule sees instead of markdown-it's `state`.
 * Its own module, with no imports, so the boundary parser's straight-line installer (blocks.generated.mjs,
 * in the Studio's startup JavaScript) can wrap its rules without pulling in the plugin host.
 */

/**
 * THE STATE FACADE (2026-11-01-plugin-contract-hollywood.md §4). A plugin's syntax rule gets this, never
 * markdown-it's live `state`: the source and the position fields it scans with, `isEmpty`, a per-parse
 * `memo` object for its own bookkeeping, and `push` for the token types its manifest declares. No `.md`
 * (the engine's memoized parser), no `.env`, and `push` returns a handle on the token's content fields,
 * so a rule cannot retype a token to `html_inline` or reach markdown-it's renderer through it.
 */
const TOKEN_FIELDS = Object.freeze(['content', 'markup', 'info', 'map', 'block', 'meta', 'hidden']);

function tokenHandle(token) {
  const handle = {};
  for (const f of TOKEN_FIELDS) {
    Object.defineProperty(handle, f, { enumerable: true, get: () => token[f], set: (v) => { token[f] = v; } });
  }
  return Object.freeze(handle);
}

function makeFacade(state, plugin, declared) {
  const memo = {};
  return Object.freeze({
    get src() { return state.src; },
    get pos() { return state.pos; },
    set pos(v) { state.pos = v; },
    get posMax() { return state.posMax; },
    get line() { return state.line; },
    set line(v) { state.line = v; },
    get bMarks() { return state.bMarks; },
    get eMarks() { return state.eMarks; },
    get tShift() { return state.tShift; },
    get sCount() { return state.sCount; },
    get blkIndent() { return state.blkIndent; },
    isEmpty: (line) => state.isEmpty(line),
    memo,
    push(type, tag, nesting) {
      if (!declared.has(type)) throw new Error(`plugin "${plugin}" pushed undeclared token type "${type}"`);
      return tokenHandle(state.push(type, tag, nesting));
    },
  });
}

/** state → plugin → facade, so a rule asked at every position allocates once per parse. */
const facades = new WeakMap();

export function guardedRule(run, plugin, declared) {
  const guarded = (state, ...rest) => {
    let byPlugin = facades.get(state);
    if (!byPlugin) facades.set(state, (byPlugin = new Map()));
    let facade = byPlugin.get(plugin);
    if (!facade) byPlugin.set(plugin, (facade = makeFacade(state, plugin, declared)));
    return run(facade, ...rest);
  };
  // The plugin's own rule, so a check that the two installers wire the same rules can compare them.
  guarded.rule = run;
  return guarded;
}

