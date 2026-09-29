/**
 * lib/core/gesture.js
 *
 * A component's effective gesture contract: its archetype's defaults with its own overrides laid
 * over them. Every manifest declares a `gesture` naming one of ten archetypes (the structure it
 * renders), and most declare nothing else; a component whose render differs names only the units
 * that differ. engineering/decisions/2026-09-27-guide-storyboards.md §5, §7.
 *
 *   gestureOf({ gesture: { archetype: 'part', units: { stage: {...} }, key: 'last' } })
 *     -> { archetype: 'part', units: { mark, figure, stage }, key: 'last' }
 *
 * The component's units come FIRST in the merged map, so a chart's own named units (`stage`,
 * `point`) lead its archetype's generic ones. A unit of the same name replaces the archetype's.
 *
 * The merge itself is `mergeGesture` in `lib/core/scene-resolve.mjs`, which the Guide calls too:
 * the build, the gates, the Studio and the player can never disagree (HARD RULE #1).
 */

const ARCHETYPES = require('./gesture-archetypes.json');
const { mergeGesture } = require('./scene-resolve.mjs');

const ARCHETYPE_NAMES = Object.freeze(Object.keys(ARCHETYPES).filter((k) => !k.startsWith('$')));

/**
 * @param {{ gesture?: { archetype: string, units?: object, key?: string } }} manifest
 * @returns {{ archetype: string, units: object, key: string } | null} null when the manifest
 *   declares no gesture or names an archetype that does not exist
 */
function gestureOf(manifest) {
  return mergeGesture(manifest?.gesture, ARCHETYPES);
}

module.exports = { ARCHETYPES, ARCHETYPE_NAMES, gestureOf };
