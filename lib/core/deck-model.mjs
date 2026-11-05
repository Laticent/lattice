/**
 * lib/core/deck-model.mjs
 *
 * THE DECK MODEL, CONFIGURED AS THE ENGINE PARSES. `@laticent/segno-markdown` is the parser (S0 and S1 of the
 * Segno deck pipeline, engineering/decisions/2026-10-22-segno-deck-pipeline.md); this module is the one place
 * it is told what Lattice's markdown-it is told in `buildMd` (lib/engine/index.js), so its block structure is
 * the engine's:
 *
 *   - `commonmark` + `html: true` + the `table` rule: the package's defaults, which are exactly these.
 *   - every plugin BLOCK rule (math's `$$`, the code plugin's `@code{…}` record), from the same generated
 *     installer the boundary parser runs (lib/plugins/blocks.generated.mjs), each with the characters its
 *     manifest says it starts on (`BLOCK_TRIGGERS`) and run through the plugin state facade unchanged;
 *   - the plugins a host switched off (`setBoundaryPluginsOff` in boundary-parser.mjs), read from there, so a
 *     CLI run under `--disable-plugin math` splits a `$$` block here where the engine splits it;
 *   - a link reference destination holding an entity is judged by markdown-it's own
 *     `validateLink(normalizeLink(unescapeAll(dest)))`, because deciding whether `[a]: javascript&colon;x`
 *     is a definition (no token) or a paragraph (which a `---` below turns into a heading) needs the HTML
 *     entity table. Only that path touches markdown-it; it goes when P7 removes markdown-it.
 *
 * WHY A MODEL AND NOT A PARSE. Every caller that used to run `boundaryParser.block.parse` to find slide
 * boundaries reads them here instead, from one tape that also holds the directive, fence and leaf ranges,
 * and that `updateDeckModel` keeps current per keystroke by re-reading only the edited slide. The structure
 * is held to markdown-it's token for token on the corpus and a rule-surface fuzz
 * (test/unit/core/deck-model.test.js), which is the fidelity bar the owner set (D3).
 *
 * Pure (no fs), so it bundles into the browser Studio with its callers.
 */

import { BlockParser, deckModel as buildModel, diffSpan, updateDeckModel as updateModel } from '@laticent/segno-markdown';
import { BLOCK_TRIGGERS, FORWARD_SCAN_LINES, installPluginBlocks } from '../plugins/blocks.generated.mjs';
import { boundaryRulesGeneration, boundaryParser as md } from './boundary-parser.mjs';

/** Every plugin block rule, as the generated installer would put it on markdown-it. */
function pluginRules() {
  const rules = [];
  // A stand-in for markdown-it's ruler, with both anchors and markdown-it's `{ alt }` option, so a manifest
  // anchored `after` a rule, or terminating a chain, installs here as it does on the boundary parser.
  const add = (where) => (anchor, name, rule, opts) =>
    rules.push({ name, rule, [where]: anchor, alt: opts?.alt, triggers: BLOCK_TRIGGERS[name], scansAhead: name in FORWARD_SCAN_LINES });
  installPluginBlocks({ block: { ruler: { before: add('before'), after: add('after') } } });
  return rules;
}
const ALL_RULES = pluginRules();

const linkOk = (dest) => md.validateLink(md.normalizeLink(md.utils.unescapeAll(dest)));

let parser = null;
let parserGeneration = -1;
/** The parser for the plugin rules the host admits now; rebuilt when `setBoundaryPluginsOff` runs. */
export function deckParser() {
  const gen = boundaryRulesGeneration();
  if (!parser || parserGeneration !== gen) {
    // The rules the boundary parser runs now, as `setBoundaryPluginsOff` left them: each installed plugin rule
    // is a facade wrapper whose `.rule` is the plugin's own function, which the deck model's copies share.
    const enabled = new Set(md.block.ruler.getRules('').map((fn) => fn.rule).filter(Boolean));
    parser = new BlockParser({ rules: ALL_RULES.filter((r) => enabled.has(r.rule.rule)), linkOk });
    parserGeneration = gen;
  }
  return parser;
}

/** The model of a whole deck source, front matter split as the engine splits it. */
export function deckModel(source) {
  return buildModel(String(source ?? ''), { parser: deckParser() });
}

/**
 * The model of a deck BODY a caller has already stripped of front matter and normalized: no front-matter
 * split and no ingest at all, so the line numbers index `body.split('\n')` exactly as `md.block.parse(body)`'s
 * maps did, and a BOM left after the front matter stays text, as markdown-it reads it.
 */
export function bodyModel(body) {
  return buildModel(String(body ?? ''), { parser: deckParser(), frontMatter: null, raw: true });
}

/**
 * The model of `next` from `prev`, re-reading only the slide an edit touched. A model built under other
 * plugin rules is not this parser's answer, so it is rebuilt.
 */
export function updateDeckModel(prev, next, span) {
  if (!prev || prev.options.parser !== deckParser()) return prev?.options.frontMatter === null ? bodyModel(next) : deckModel(next);
  return updateModel(prev, String(next ?? ''), span);
}

/**
 * THE BOUNDARY MEMO'S DERIVER (Segno, engineering/decisions/2026-10-22-segno-deck-pipeline.md §The Studio's readers
 * derive, not parse): the model of `text` from the nearest of a memo's `entries`, or null when none is near enough to
 * keep. The nearest is the entry whose edit span to `text` (`diffSpan`) is smallest, and `updateDeckModel` re-reads one
 * slide of it and splices, which is exact (every incremental model equals a full parse of its text). A span covering
 * more than half the text keeps nothing, and the caller parses from nothing.
 *
 * A host opts in with `setBoundaryDeriver(deriveFromNearest)` (lib/core/slide-boundaries.mjs). The Studio app does,
 * beside the preview's reader (docs/src/playground/single-slide-render.ts), and already carries `updateDeckModel` for
 * the outline. The lint core never calls this, so its bundle tree-shakes it away (docs/route-budget.json `lintCoreGz`).
 * @param {Map<string, {model: object}>} entries
 * @param {string} text
 */
export function deriveFromNearest(entries, text) {
  let best = null;
  let bestSpan = null;
  let bestCost = Infinity;
  for (const [key, entry] of entries) {
    const span = diffSpan(key, text);
    const cost = Math.max(span.toA, span.toB) - span.from;
    if (cost < bestCost) {
      best = entry;
      bestSpan = span;
      bestCost = cost;
    }
  }
  if (!best || bestCost * 2 > text.length) return null;
  return updateDeckModel(best.model, text, bestSpan);
}
