/**
 * lib/core/register-factory.js — one resolver for every AXIS register: a front-matter key whose
 * value is one word per axis, each word stamped on every slide as `<key>-<word>` (HARD RULE #1).
 *
 *   spark: bare etching   → `spark-bare spark-etching`
 *   icon: bare rounded    → `icon-bare icon-rounded`
 *
 * Three tiers, most specific wins: the item's own word (`~{…, bare}`) → the slide's class
 * (`_class: spark-bare`) → the register → the default (each axis's first word). A slide's word
 * on one axis evicts the deck's word on THAT axis only.
 *
 * `spark:` is built here (lib/core/resolve-spark.js) and so is every register a plugin declares as
 * data (`contributes.registers`, lib/plugins/registers.generated.js) — which is why the icons
 * plugin can have an `icon:` register without host code of its own
 * (engineering/decisions/2026-09-29-inline-icons.md § 6). Pure and dependency-free but for the
 * front-matter reader, so it bundles into the browser runtime.
 */

const { topLevelFrontMatterValue } = require('./front-matter-key');

/**
 * @param {string} key  the front-matter key, which is also the class prefix (`spark`)
 * @param {ReadonlyArray<{axis: string, names: ReadonlyArray<string>}>} axes  each axis's words,
 *   its default first
 */
function makeRegister(key, axes) {
  const prefix = `${key}-`;
  const AXES = Object.freeze(axes.map((a) => Object.freeze({
    axis: a.axis,
    names: Object.freeze([...a.names]),
    tokens: Object.freeze(a.names.map((n) => prefix + n)),
    set: new Set(a.names.map((n) => prefix + n)),
  })));
  const NAMES = Object.freeze(AXES.flatMap((a) => a.names));
  const TOKENS = Object.freeze(AXES.flatMap((a) => a.tokens));

  /** The axis a class token belongs to (`spark-bare` → 'frame'), or ''. */
  function tokenAxis(t) {
    const s = String(t || '');
    const hit = AXES.find((a) => a.set.has(s));
    return hit ? hit.axis : '';
  }

  /**
   * A deck value's words, sorted by axis. Unknown words and a second word on an axis already
   * filled come back in `unknown` / `duplicate` for the linter; the classes carry only the first
   * recognized word per axis.
   */
  function parse(value) {
    const out = {};
    for (const a of AXES) out[a.axis] = '';
    out.unknown = [];
    out.duplicate = [];
    if (typeof value !== 'string') return out;
    // Brackets too, so a YAML flow list (`spark: [bare, etching]`) reads as the two words.
    for (const word of value.trim().toLowerCase().split(/[\s,[\]]+/).filter(Boolean)) {
      const hit = AXES.find((a) => a.names.includes(word));
      if (!hit) out.unknown.push(word);
      else if (out[hit.axis]) out.duplicate.push(word);
      else out[hit.axis] = word;
    }
    return out;
  }

  /** A deck value → its class tokens (0 to one per axis), in axis order. */
  function classes(value) {
    const p = parse(value);
    return AXES.map((a) => p[a.axis] && prefix + p[a.axis]).filter(Boolean);
  }

  /** The raw value from a front-matter BODY (no fences), or null. Top-level only. */
  function read(fm) {
    const v = topLevelFrontMatterValue(fm, key);
    return v ? v : null;
  }

  return Object.freeze({
    key, prefix, AXES, NAMES, TOKENS,
    tokenAxis,
    isToken: (t) => tokenAxis(t) !== '',
    parse,
    classes,
    read,
    classesFromFrontMatter: (fm) => classes(read(fm) || ''),
  });
}

module.exports = { makeRegister };
