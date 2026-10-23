/**
 * INLINE EDITORS — the kernels a point-and-click editor needs, in one door for the browser bundle.
 *
 * The Studio's Compose editor (docs/src/components/studio/PillEditor.tsx, SparkPanel.tsx, AvatarPanel.tsx,
 * IconPanel.tsx) draws each pill, spark, avatar and icon and opens an editor on it. Everything it knows about one comes from here,
 * which is the engine's own kernel, not a copy (HARD RULES #1, #7; Segno decision 20): the reader
 * that decides whether a span is a pill, the writer that changes one word of it, the vocabulary,
 * and the function that draws the same DOM the slide gets.
 *
 * Packaged by tools/build-authoring-core.js into docs/src/playground/authoring-core.generated.js.
 * Design: engineering/decisions/2026-10-13-compose-inline-notation-editors.md.
 */

const pills = require('../plugins/pills/pills.inline.js');
const { pillIsCrowded } = require('./lint-core.js');
const sparks = require('../plugins/sparks/sparks.inline.js');
const avatars = require('../plugins/avatars/avatars.inline.js');
const icons = require('../plugins/icons/icons.inline.js');
const { compileSlot } = require('../core/segno-spec.js');
// The writers live HERE, not in the plugins' own kernels: the engine bundle carries those, and the editor's writer (lib/core/segno-edit.js)
// is the Studio's alone. Putting it in avatars.inline.js put 0.5 KB too many into the engine's route budget.
const { editRecord } = require('../core/segno-edit.js');

let avatarSlot = null;
let iconSlot = null;
const avatarSlotOf = () => (avatarSlot ??= compileSlot(avatars.SPEC, 'avatars.avatar'));
const iconSlotOf = () => (iconSlot ??= compileSlot(icons.SPEC, 'icons.icon'));

/** The parameters the author wrote on a span (not the ones a default or the name picked), or null when it is not read by `kind`. */
function writtenOf(kind, slot, text) {
  if (!kind.read(text)) return null;
  const r = slot().read(text);
  return r.ok ? r.value : null;
}

// An installed plugin's inline kind declares its fields as a slot spec (data, `contributes.inline.<kind>.slot`). The host
// compiles it here, once per spec object, so a kind it cannot run still reads and writes like a shipped one.
const slotCache = new WeakMap();
function slotFor(spec, name) {
  if (!spec || typeof spec !== 'object') return null;
  if (!slotCache.has(spec)) {
    let slot = null;
    try {
      slot = compileSlot(spec, name);
    } catch {
      slot = null;
    }
    slotCache.set(spec, slot);
  }
  return slotCache.get(spec);
}
const { isLiteralFromSource, INLINE_CODE_LITERAL } = require('../core/resolve-inline-code.js');
const codeRecord = require('../plugins/code/shared/record.js');
const { ownsRecordSpan } = require('../core/chart-rows.js');

module.exports = {
  pill: {
    /** The span's fields, or null when it is not a pill the engine draws. */
    read: pills.resolve,
    /** The span with one word changed, or null (never a guess). See `editPill`. */
    edit: pills.editPill,
    /** The same DOM the slide gets. */
    element: pills.pillElement,
    SHAPES: pills.SHAPES,
    COLORS: pills.COLORS,
    SIZES: pills.SIZES,
    /** Is this a circle or diamond whose label is too long for it? The linter's `pill-shape-crowded`. */
    crowded: pillIsCrowded,
  },
  spark: {
    /** The span's fields and its data, or null when it is not a spark the engine draws. */
    read: sparks.read,
    /** The span with the changed words replaced, or null (never a guess). See `editSpark`. */
    edit: sparks.editSpark,
    /** The same DOM the slide gets. */
    element: sparks.sparkElement,
    TYPES: sparks.TYPES,
    SERIES_TYPES: sparks.SERIES_TYPES,
    SIZES: sparks.SIZES,
    COLORS: sparks.COLORS,
    MARKERS: sparks.MARKERS,
    MAX_POINTS: sparks.MAX_POINTS,
  },
  avatar: {
    /** The span's resolved fields (every trait, written or picked by the name) and `written`: only what the author wrote. Null when it is not an avatar. */
    read: (text) => {
      const f = avatars.read(text);
      return f ? { ...f, written: writtenOf(avatars, avatarSlotOf, text) } : null;
    },
    /** The span with the changed words replaced, or null (never a guess). The writer is `editRecord` (lib/core/segno-edit.js) over the avatar slot. */
    edit: (text, changes) => (avatars.read(text) ? editRecord(text, avatarSlotOf(), avatars.SPEC, changes) : null),
    /** The same DOM the slide gets, or null until the plugin's drawings are loaded. */
    element: avatars.avatarElement,
    /** The slot's schema: each trait's words, the tile colors, sizes, shapes and frames. The panel is drawn from it. */
    SPEC: avatars.SPEC,
    TRAIT_ORDER: avatars.TRAIT_ORDER,
  },
  icon: {
    /** The span's fields and `written` (only what the author wrote), or null when it is not an icon. */
    read: (text) => {
      const f = icons.read(text);
      return f ? { ...f, written: writtenOf(icons, iconSlotOf, text) } : null;
    },
    /** The span with the changed words replaced, or null (never a guess). The writer is `editRecord` over the icon slot. */
    edit: (text, changes) => (icons.read(text) ? editRecord(text, iconSlotOf(), icons.SPEC, changes) : null),
    /** The same DOM the slide gets, or null until the plugin's drawings are loaded. */
    element: icons.iconElement,
    SPEC: icons.SPEC,
    /** The canonical name of a name or alias, or null. */
    canonical: icons.canonical,
  },
  /**
   * A fence's `@code{…}` record (the code plugin's reader, lib/plugins/code/shared/record.js), for the
   * Compose code-block options (docs/src/components/studio/code-record-editor.tsx). Its writer,
   * record-edit.js, is the panel's own load (esm/code-record.js), so this bundle does not carry it.
   */
  code: {
    /** A record's fields, with what it could not read. Never throws. */
    read: (text) => codeRecord.readBody(codeRecord.recordBody(text) ?? '{}'),
    /** The deck's `code:` default, from the front matter body. */
    deckDefaults: codeRecord.deckDefaults,
    INDENTS: codeRecord.INDENTS,
  },
  /**
   * A record read and written through a slot spec the caller holds: an installed plugin's inline kind. `text` is the
   * record, `{…}`, without the `@kind` lead. Both return null for a spec that does not compile or a record that does not read.
   */
  record: {
    /** The words the author wrote, by parameter, as plain values. */
    read: (spec, name, text) => {
      const slot = slotFor(spec, name);
      const r = slot ? slot.read(text) : null;
      if (!r?.ok) return null;
      return Object.fromEntries(Object.entries(r.value).map(([k, v]) => [k, v && typeof v === 'object' && 'value' in v ? v.value : v]));
    },
    /** The record with the changed words replaced, added or removed, or null (never a guess). See `editRecord`. */
    edit: (spec, name, text, changes) => {
      const slot = slotFor(spec, name);
      return slot ? editRecord(text, slot, spec, changes) : null;
    },
  },
  /** Does this deck's front matter turn the inline grammar off (`inline-code: literal`)? */
  isLiteralFromSource,
  /** The class a slide carries when it does (`<!-- _class: inline-code-literal -->`). */
  INLINE_CODE_LITERAL,
  /** Is this span a chart row's data record, which the chart reads and the pill pass leaves alone? */
  ownsChartRecord: ownsRecordSpan,
};
