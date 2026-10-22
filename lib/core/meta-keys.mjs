/**
 * lib/core/meta-keys.mjs
 *
 * THE COMMENT-DIRECTIVE VOCABULARY, in one place. Which keys an author may set in a slide comment
 * (`<!-- _class: cards -->`), which may be written bare, which are deck-only, which the engine
 * writes on the slide, and which the editor offers: every one of those questions used to have a
 * hand-kept answer in five modules (lib/engine/directives.js, lib/authoring/notes-core.js,
 * docs/src/components/studio/slide-directives.ts, docs/src/playground/grammar-vocab.js and
 * lib/packages/slide-facts.mjs), pinned to each other by tests that read the others' copies.
 *
 * The answer is now DATA. The `meta` plugin's manifest (lib/plugins/meta/meta.manifest.json)
 * declares each field with its type and flags; `tools/build-plugin-registry.js` freezes that into
 * lib/plugins/meta.generated.mjs; this module derives the sets every reader needs from it. Adding a
 * key is one manifest edit and `npm run build`. A sixth hand-kept copy fails
 * test/unit/core/meta-keys.test.js.
 *
 * The GRAMMAR (how a comment is parsed) is lib/core/comment-directive.mjs, and the line scan that
 * finds the comments is lib/core/meta-record.mjs. This file is the vocabulary only.
 *
 * Pure and dependency-free past the generated data. ESM, so the docs editor imports it as source;
 * CJS callers `require()` it (Node 22.12 and later load ES modules).
 */

import { META_COMMENTS, META_FIELDS, META_MARKERS, META_REGISTERS } from '../plugins/meta.generated.mjs';

const keysWhere = (pred) => Object.keys(META_FIELDS).filter((k) => pred(META_FIELDS[k]));

/** Every key that is a directive at all, in manifest order. */
export const KNOWN_KEYS = /* @__PURE__ */ new Set(Object.keys(META_FIELDS));
/** Keys that may be written bare, with no `: value` (`<!-- _build -->`). */
export const FLAG_KEYS = /* @__PURE__ */ new Set(keysWhere((f) => f.bare === true));
/** Keys written once at the top of the deck, never per slide (`theme`, `size`, `lang`, `marp`). */
export const GLOBAL_ONLY_KEYS = /* @__PURE__ */ new Set(keysWhere((f) => f.scope === 'deck'));
/** Keys a slide comment sets for THAT slide only, in either spelling: `header`, `footer`. Front matter is the one way
 *  to set them for every slide. The owner's ruling (2026-10-20): Lattice is not Marp, so a plain `<!-- header: H -->`
 *  does not carry onto later slides (engineering/decisions/2026-10-16-preview-as-library-audit.md §11r). Page numbers
 *  are not a slide directive at all: the engine ignores a `paginate` comment, and the `no-pagination` /
 *  `with-pagination` classes and the component manifest decide (lib/core/pagination.js). */
export const SLIDE_ONLY_KEYS = /* @__PURE__ */ new Set(keysWhere((f) => f.scope === 'slide'));
/** Keys the engine writes on each `<section>` as `data-<kebab>`. */
export const APPLIED_KEYS = /* @__PURE__ */ new Set(keysWhere((f) => f.applied === true));
/** Applied keys that get the `data-*` attribute and not the `--*` custom property. */
export const NO_CUSTOM_PROP_KEYS = /* @__PURE__ */ new Set(keysWhere((f) => f.applied === true && f.customProp === false));
/** Marp's local directives, which a bare (non-underscore) comment may also set. */
export const LOCAL_KEYS = /* @__PURE__ */ new Set(keysWhere((f) => f.local === true));
/** Keys the editor offers by name when an author types `<!-- _` (spot form, so `_class`). */
export const COMPLETE_KEYS = /* @__PURE__ */ Object.freeze(keysWhere((f) => f.complete === true));
/** Bare marker comments (`<!-- stress-slide -->`): tooling reads them; they are never speaker notes. */
export const MARKER_NAMES = /* @__PURE__ */ new Set(META_MARKERS);

const commentKeysOf = (kind) => /* @__PURE__ */ new Set(Object.keys(META_COMMENTS).filter((k) => META_COMMENTS[k].kind === kind));
/** Comment keys the pane carve splits a slide at (`pane`, `panes`): structure, not directives and not notes. */
export const STRUCTURE_KEYS = /* @__PURE__ */ commentKeysOf('structure');
/** Note-like comment keys with their own sink (`say`, `describe`): never a speaker note, never a directive. */
export const CHANNEL_KEYS = /* @__PURE__ */ commentKeysOf('channel');
/** Every plugin's front-matter registers (key, owning plugin, axes), for completion and lint. */
export const REGISTERS = META_REGISTERS;

/** The slice of the vocabulary `readDirectiveComment` binds: the whole set, and the bare-able keys. */
export const DIRECTIVE_VOCAB = /* @__PURE__ */ Object.freeze({ known: KNOWN_KEYS, flags: FLAG_KEYS });

/** The `class` slice of the vocabulary, for a reader that asks one key (parsing is the same under any slice). */
export const CLASS_VOCAB = /* @__PURE__ */ Object.freeze({ known: /* @__PURE__ */ new Set(['class']), flags: /* @__PURE__ */ new Set() });

/** A field's declaration (`{ type, scope?, bare?, … }`), or null for a key that is not one. */
export function fieldOf(key) {
  return Object.hasOwn(META_FIELDS, key) ? META_FIELDS[key] : null;
}

/** The words an `enum` field accepts, or [] for any other field. */
export function enumValues(key) {
  return fieldOf(key)?.values ?? [];
}

/**
 * THE `paginate:` value rule, the one every reader shares (the engine, the Studio switch, the deck-config panel,
 * Export to Marp). Off is `false`, `no`, `off` or `0`, and Marp's `skip` / `hold`, which Lattice does not implement;
 * quotes and a trailing YAML `# comment` are ignored, as the engine's front-matter reader ignores them. Anything else, including an absent or empty value, is on: page numbers are the default.
 */
export function paginateOn(value) {
  const v = String(value ?? '').replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  return !/^(false|no|off|0|skip|hold)$/i.test(v);
}

/** `backgroundColor` → `background-color`, the way the engine spells `data-*` and `--*`. */
export const kebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export { META_FIELDS };
