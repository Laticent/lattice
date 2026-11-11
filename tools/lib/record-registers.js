/**
 * tools/lib/record-registers.js
 *
 * The host's own front-matter registers (`finish:`, `headline:`, `rule:`, …) as SLIDE-RECORD fields:
 * `<!-- {finish=ledger, headline=left} -->` writes the class words one slide would carry in `_class:`
 * (`finish finish-ledger head-left`). Design: engineering/decisions/2026-10-17-meta-record.md §4.2, step 3.
 *
 * The words come from each register's own resolver (`finishClasses`, `headlineClass`, …), so a record
 * and front matter can never disagree about what a value means. The one thing a resolver cannot say is
 * the word for the DEFAULT on one slide: front matter writes no token for a default, but a slide inside
 * a deck that sets another value needs a token to ask for the default back. Those restore words are
 * already documented per register (lib/base/base.registers.docs.md, "per slide `rule-auto`") and are
 * listed in `RESTORE` below; test/unit/tools/record-registers.test.js holds each one to its register's
 * token set, so a renamed token fails a test rather than a slide.
 *
 * tools/build-plugin-registry.js freezes `recordRegisters()` into lib/plugins/meta.generated.mjs, so the
 * door (lib/core/meta-door.mjs) reads a data table and never loads these resolvers.
 */

const finish = require('../../lib/core/resolve-finish');
const headline = require('../../lib/core/resolve-headline');
const rule = require('../../lib/core/resolve-rule');
const eyebrow = require('../../lib/core/resolve-eyebrow');
const spectrum = require('../../lib/core/resolve-spectrum');
const lift = require('../../lib/core/resolve-lift');
const stamp = require('../../lib/core/resolve-stamp');
const tone = require('../../lib/core/resolve-tone-style');
const corners = require('../../lib/core/resolve-corners');

/** key → [value names, value → front-matter class words, the register's token set (null: no list)]. */
const SOURCES = [
  ['finish', finish.FINISH_NAMES, finish.finishClasses, null],
  ['headline', headline.HEADLINE_NAMES, headline.headlineClass, headline.HEADLINE_TOKENS],
  ['rule', rule.RULE_NAMES, rule.ruleClass, rule.RULE_TOKENS],
  ['eyebrow', eyebrow.EYEBROW_NAMES, eyebrow.eyebrowClass, eyebrow.EYEBROW_TOKENS],
  ['spectrum', spectrum.SPECTRUM_NAMES, spectrum.spectrumClass, spectrum.SPECTRUM_TOKENS],
  ['spectrum-edge', spectrum.SPECTRUM_EDGE_NAMES, spectrum.spectrumEdgeClass, spectrum.SPECTRUM_EDGE_TOKENS],
  ['spectrum-card', spectrum.SPECTRUM_CARD_NAMES, spectrum.spectrumCardClass, spectrum.SPECTRUM_CARD_TOKENS],
  ['spectrum-card-edge', spectrum.SPECTRUM_CARD_EDGE_NAMES, spectrum.spectrumCardEdgeClass, spectrum.SPECTRUM_CARD_EDGE_TOKENS],
  ['spectrum-trim', spectrum.SPECTRUM_TRIM_NAMES, spectrum.spectrumTrimClass, spectrum.SPECTRUM_TRIM_TOKENS],
  ['lift', lift.LIFT_NAMES, lift.liftClass, lift.LIFT_TOKENS],
  ['stamp', stamp.STAMP_STYLE_NAMES, stamp.stampClass, stamp.STAMP_STYLE_TOKENS],
  ['tone', tone.TONE_STYLE_NAMES, tone.toneStyleClass, tone.TONE_STYLE_TOKENS],
  ['corners', corners.CORNERS_NAMES, corners.cornersClass, corners.CORNERS_TOKENS],
];

/** The one-slide word for each register's default (front matter writes none for it). */
const RESTORE = Object.freeze({
  'finish:none': 'no-finish',
  'headline:auto': 'head-auto',
  'rule:auto': 'rule-auto',
  'eyebrow:plain': 'eyebrow-plain',
  'spectrum:on': 'with-spectrum',
  'spectrum-edge:top': 'spectrum-edge-top',
  'spectrum-card:off': 'no-spectrum-card',
  'spectrum-card-edge:left': 'spectrum-card-edge-left',
  'spectrum-trim:off': 'no-spectrum-trim',
  'lift:off': 'flat',
  'corners:square': 'corners-square',
});

/**
 * Every host register a slide record may set, with each value's class words.
 * @returns {Array<{key: string, values: Record<string, string>, tokens: string[] | null}>}
 */
function recordRegisters() {
  return SOURCES.map(([key, names, classes, tokens]) => {
    const values = {};
    for (const name of names) {
      const words = String(classes(name) ?? '').trim() || RESTORE[`${key}:${name}`];
      if (!words) throw new Error(`record-registers: \`${key}=${name}\` writes no class word and has no restore word`);
      values[name] = words;
    }
    return { key, values, tokens: tokens ? [...tokens] : null };
  });
}

module.exports = { RESTORE, recordRegisters };
