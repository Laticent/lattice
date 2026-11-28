/**
 * tools/lib/record-registers.js
 *
 * The host's own front-matter registers (`finish:`, `headline-align:`, `heading-rule:`, …) as SLIDE-RECORD fields:
 * `<!-- {finish=ledger, headline-align=left} -->` writes the class words one slide would carry in `_class:`
 * (`finish finish-ledger headline-align-left`). Design: engineering/decisions/2026-10-17-meta-record.md §4.2, step 3.
 *
 * The words come from each register's own resolver (`finishClasses`, `headlineAlignClass`, …), so a record
 * and front matter can never disagree about what a value means. The one thing a resolver cannot say is
 * the word for the DEFAULT on one slide: front matter writes no token for a default, but a slide inside
 * a deck that sets another value needs a token to ask for the default back. Those restore words are
 * already documented per register (lib/base/base.registers.docs.md, "per slide `heading-rule-auto`") and are
 * listed in `RESTORE` below; test/unit/tools/record-registers.test.js holds each one to its register's
 * token set, so a renamed token fails a test rather than a slide.
 *
 * tools/build-plugin-registry.js freezes `recordRegisters()` into lib/plugins/meta.generated.mjs, so the
 * door (lib/core/meta-door.mjs) reads a data table and never loads these resolvers.
 */

const finish = require('../../lib/core/resolve-finish');
const headline = require('../../lib/core/resolve-headline-align');
const rule = require('../../lib/core/resolve-heading-rule');
const eyebrow = require('../../lib/core/resolve-eyebrow');
const spectrum = require('../../lib/core/resolve-spectrum');
const lift = require('../../lib/core/resolve-card-lift');
const stamp = require('../../lib/core/resolve-stamp-shape');
const tone = require('../../lib/core/resolve-tone-style');
const corners = require('../../lib/core/resolve-slide-corners');
const cover = require('../../lib/core/resolve-cover-layout');

/** key → [value names, value → front-matter class words, the register's token set (null: no list)]. */
const SOURCES = [
  ['finish', finish.FINISH_NAMES, finish.finishClasses, null],
  ['headline-align', headline.HEADLINE_ALIGN_NAMES, headline.headlineAlignClass, headline.HEADLINE_ALIGN_TOKENS],
  ['heading-rule', rule.HEADING_RULE_NAMES, rule.headingRuleClass, rule.HEADING_RULE_TOKENS],
  ['eyebrow', eyebrow.EYEBROW_NAMES, eyebrow.eyebrowClass, eyebrow.EYEBROW_TOKENS],
  // The three spectrum keys are axis registers: every word, a default included, names its own class.
  ...[spectrum.SPECTRUM_REGISTER, spectrum.CARD_SPECTRUM_REGISTER, spectrum.TRIM_SPECTRUM_REGISTER]
    .map((r) => [r.key, r.NAMES, (v) => r.classes(v).join(' '), r.TOKENS]),
  ['card-lift', lift.CARD_LIFT_NAMES, lift.cardLiftClass, lift.CARD_LIFT_TOKENS],
  ['stamp-shape', stamp.STAMP_SHAPE_NAMES, stamp.stampShapeClass, stamp.STAMP_SHAPE_TOKENS],
  ['tone', tone.TONE_STYLE_NAMES, tone.toneStyleClass, tone.TONE_STYLE_TOKENS],
  ['slide-corners', corners.SLIDE_CORNERS_NAMES, corners.slideCornersClass, corners.SLIDE_CORNERS_TOKENS],
  ['cover-layout', cover.COVER_NAMES, (v) => cover.coverClasses(v).join(' '), cover.COVER_TOKENS],
];

/** The one-slide word for each register's default (front matter writes none for it). */
const RESTORE = Object.freeze({
  'finish:none': 'no-finish',
  'headline-align:auto': 'headline-align-auto',
  'heading-rule:auto': 'heading-rule-auto',
  'eyebrow:plain': 'eyebrow-plain',
  'card-lift:off': 'card-lift-off',
  'slide-corners:square': 'slide-corners-square',
  'cover-layout:inverse': 'cover-inverse',
  'cover-layout:plain': 'cover-plain',
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
