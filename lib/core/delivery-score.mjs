/**
 * lib/core/delivery-score.mjs
 *
 * A SCORE: what one delivery does with one bound slide, one line per bound sentence. It is the
 * executed script: sentence → act → the unit it names → what the delivery's style asks (the focus,
 * the ink, the cursor). No DOM: the unit is its template filled, so a score can be computed in node,
 * committed as a golden file, and diffed.
 *
 * WHY IT EXISTS. Three rounds of Guide fixes each broke a delivery or a chart the fix was not about,
 * and nothing caught it before a person played the deck. The goldens
 * (test/unit/core/delivery-scores.test.js) make every such change a visible diff: a change to one
 * delivery's style file diffs only that delivery's column, and a change to one component's scene
 * diffs only that component's file.
 * engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md §8.
 */
import { DELIVERY_STYLES } from './resolve-delivery.mjs';
import { fillSelector, keyIndex } from './scene-resolve.mjs';

/**
 * @param {{ text: string, refs: Array<{start:number,end:number,act?:string,unit?:string,id?:object}> }} script
 *   `narrateChartScript`'s output for one slide
 * @param {{ units: object, key: string }} scene the component's gesture, merged (`gestureOf`)
 * @param {string} delivery a registered delivery name
 * @returns {Array<{ said: string, act: string, unit: string|null, select: string|null, key: boolean,
 *   focus: string, ink: string|null, cursor: string }>}
 */
export function score(script, scene, delivery) {
  const style = DELIVERY_STYLES[delivery];
  if (!style || !script) return [];
  const key = keyIndex(script.refs, scene.key);
  return script.refs.map((ref, i) => {
    const spec = ref.unit ? scene.units[ref.unit] : null;
    const select = spec ? fillSelector(spec.select, ref.id) : null;
    const expr = style.express(ref.act ?? 'aside', {
      named: !!select,
      key: i === key,
      afterKey: key >= 0 && i > key,
      labelled: !!spec?.labels,
    });
    return {
      said: script.text.slice(ref.start, ref.end),
      act: ref.act ?? 'aside',
      unit: ref.unit ?? null,
      select,
      key: i === key,
      focus: expr.focus,
      ink: expr.ink ? `${expr.ink.kind} ${expr.ink.on} ${expr.ink.strength}` : null,
      cursor: expr.cursor,
    };
  });
}
