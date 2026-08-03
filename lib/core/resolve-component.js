/**
 * resolve-component — the DEFAULT COMPONENT rule.
 *
 * A slide names its layout with `<!-- _class: kpi -->`. A slide that names none
 * used to render with no component class at all, so none of the component CSS
 * applied and the slide came out unstyled — raw markdown defaults on a Lattice
 * canvas (#1292). There is no such thing as a slide without a layout: the
 * catch-all IS a layout, and it is `content` ("heading plus paragraphs or a
 * short list" — lib/components/statement/content/content.docs.md).
 *
 * So: a section whose resolved class list contains NO component name gets
 * `content` appended. The rule is deliberately about the RESOLVED list, not
 * about the presence of a `_class:` comment, because the deck-wide `class:`
 * register can name the component for every slide (`class: content`) — and a
 * deck that did that must not end up with the token twice, nor a slide that
 * wrote `_class: dark` (a modifier, no component) end up unstyled.
 *
 * WHY THE STAGE CATALOG IS THE NAME SOURCE — the component manifests live behind
 * `fs` (lib/components/index.js `loadAll`), which the browser engine bundle
 * cannot call. `stage-catalog.generated.js` is the same manifest set, already
 * generated for exactly this reason (the masthead kernel needs the names in the
 * browser), already bundled into lattice-runtime.js, and already staleness-gated
 * by tools/build-stage-catalog.js. Its KEYS are the component-name vocabulary,
 * verified 1:1 against `loadAll()` by resolve-component.test.js — so this rule
 * cannot silently drift as components are added or renamed.
 */

const STAGE_CATALOG = require('../forms/cell/masthead/stage-catalog.generated.js');

/** Every component name the engine ships, from the generated stage catalog. */
const COMPONENT_NAMES = Object.freeze(Object.keys(STAGE_CATALOG).sort());
const COMPONENT_SET = new Set(COMPONENT_NAMES);

/** The catch-all layout a slide falls back to when it names no component. */
const DEFAULT_COMPONENT = 'content';

/** Is `token` a component name (as opposed to a modifier, variant, or register token)? */
function isComponentToken(token) {
  return COMPONENT_SET.has(token);
}

/** Does this resolved class list already name a component? */
function hasComponent(tokens) {
  for (const t of tokens) if (COMPONENT_SET.has(t)) return true;
  return false;
}

/**
 * The class list a section should carry, with the default component applied.
 * Returns the SAME array instance when nothing changes, so callers can cheaply
 * skip a write. Never reorders or removes: `content` is appended, so an author's
 * own tokens keep their authored order and CSS source order is undisturbed.
 */
function withDefaultComponent(tokens) {
  return hasComponent(tokens) ? tokens : [...tokens, DEFAULT_COMPONENT];
}

module.exports = {
  COMPONENT_NAMES,
  DEFAULT_COMPONENT,
  isComponentToken,
  hasComponent,
  withDefaultComponent,
};
