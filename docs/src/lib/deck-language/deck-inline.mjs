/**
 * docs/src/lib/deck-language/deck-inline.mjs
 *
 * THE EDITORS' INLINE PARSER (Segno deck pipeline P4b): S2 configured as the engine's markdown-it, for a reader with no
 * markdown-it instance to read its configuration off (the token adapter, model-tokens.mjs, has one). Its own module, not
 * part of deck-model.mjs, because the deck model is on the Studio's and the home page's eager path (the outline reads
 * it) and the inline pass is about 9 KB gzipped that path does not need. Only the source editor's tree reads this, so it
 * sits beside it (the structure gate keeps a one-consumer file with its user).
 *
 * IT RETURNS OPTIONS, NOT A PARSER. The package resolves to one module (`dist/index.mjs`), and a bundler keeps a module
 * in one chunk, so any `InlineParser` imported from it lands in the eager chunk that holds the block pass: measured on
 * #3599, +10,189 B gzipped on the Studio's and the home page's eager JavaScript. The caller builds the parser with its
 * own copy of the class (the source editor imports the inline pass's source modules, which only its chunk carries).
 */

import { boundaryRulesGeneration, boundaryParser as md } from '../../../../lib/core/boundary-parser.mjs';
import { PLUGIN_GRAMMAR } from '../../../../lib/plugins/grammar.generated.mjs';

/** A destination holding an entity, judged as the block pass judges it (lib/core/deck-model.mjs), by markdown-it's own
 *  functions. Not imported from there: an export the eager outline does not read still costs its chunk bytes. */
const linkOk = (dest) => md.validateLink(md.normalizeLink(md.utils.unescapeAll(dest)));

/**
 * Whether `&name;` is a named entity to markdown-it's entity rule, which is stricter than `unescapeAll` (that one also
 * decodes a legacy prefix: `&notit;` is `¬it;` to it and text to the rule). Asked of the rule itself, as the token
 * adapter's `decodeNamed` does, and remembered.
 */
const entityMemo = new Map();
function namedEntity(match) {
  let hit = entityMemo.get(match);
  if (hit === undefined) {
    const kids = [];
    md.inline.parse(match, md, {}, kids);
    hit = kids.length === 1 && kids[0].type === 'text_special' && kids[0].info === 'entity' && kids[0].markup === match;
    entityMemo.set(match, hit);
  }
  return hit;
}

let inlineOptions = null;
let inlineGeneration = -1;
/**
 * The inline parser's options (S2, `new InlineParser(deckInlineOptions())`) for the plugin rules the host admits now, configured as the engine's markdown-it is: `html`,
 * the GFM `~~` rule, and every plugin inline rule (math's `$`) at its manifest's anchor and triggers. A named entity is
 * one when markdown-it's entity rule reads it as one (`namedEntity`), and a destination holding an entity is judged as the block pass
 * judges it (`linkOk`). The token adapter (model-tokens.mjs) reads its configuration off a markdown-it instance; this is
 * the one an editor reads a deck with, where there is no instance to read (the Studio's source editor,
 * docs/src/lib/deck-language/). Rebuilt when `setBoundaryPluginsOff` runs, as `deckParser` is.
 */
export function deckInlineOptions() {
  const gen = boundaryRulesGeneration();
  if (!inlineOptions || inlineGeneration !== gen) {
    const enabled = new Set(md.block.ruler.getRules('').map((fn) => fn.rule).filter(Boolean));
    // A plugin is on when its block rules are (math is the one plugin with an inline rule, and it has a block rule
    // too); a plugin with no block rule cannot be switched off here, so its inline rules stay.
    const off = new Set();
    for (const p of PLUGIN_GRAMMAR) {
      const blocks = Object.values(p.syntax).filter((r) => r.kind === 'block');
      if (blocks.length && !blocks.some((r) => enabled.has(r.run.rule))) off.add(p);
    }
    const rules = [];
    for (const p of PLUGIN_GRAMMAR) {
      if (off.has(p)) continue;
      for (const [name, rule] of Object.entries(p.syntax)) if (rule.kind === 'inline') rules.push({ name, rule: rule.run, ...rule.anchor, triggers: rule.triggers?.join('') });
    }
    inlineOptions = { html: true, strikethrough: true, rules, namedEntity, linkOk };
    inlineGeneration = gen;
  }
  return inlineOptions;
}
