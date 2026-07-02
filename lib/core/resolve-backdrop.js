/**
 * lib/core/resolve-backdrop.js
 *
 * The deck front-matter `backdrop:` map — the CONTROLS on the backdrop LAYER
 * (the `.backdrop` wrapper injected behind content; see base.finish.css and
 * engineering/decisions/2026-07-01-finish-restraint-controls.md). These restrain
 * an overpowering finish; they are levers on the layer, NOT new finishes:
 *
 *   backdrop:
 *     strength: 0.6         → --backdrop-strength (opacity on .backdrop; 0–1, default 1)
 *     clearance: on         → (slice 3) a bg-color zone that clears the content box
 *     spotlight: 84 30 40   → (slice 4) a bg-color reveal window (x% y% radius%)
 *
 * `backdrop:` is Lattice's FIRST nested front-matter key. The pipeline parses
 * flat front matter (lib/engine/directives.js), so rather than pull in a YAML
 * dependency we read ONE level of indented sub-keys under `backdrop:` directly.
 * `finish:` is unchanged (still the scalar preset selector) — this module never
 * touches it.
 *
 * Pure + dependency-free so it bundles into the browser runtime (esbuild) and is
 * unit-testable in isolation. Shared by lattice-emulator.js (via lib/engine),
 * lib/integrations/markdown-it/plugins.js, and lib/runtime/index.js so all three
 * render paths stamp identical `--backdrop-*` custom properties on the wrapper.
 */

/** Recognized axes under `backdrop:` (for the deck-lint vocabulary + docs). */
const BACKDROP_AXES = Object.freeze(['strength', 'clearance', 'spotlight']);

/** Strip a trailing ` # comment` from a BARE (unquoted) value; quoted values are
 *  left intact (a `#` inside quotes is data, not a comment). */
function stripComment(s) {
  const t = String(s == null ? '' : s);
  return /^\s*["']/.test(t) ? t : t.replace(/\s+#.*$/, '');
}

/** Strip matching surrounding quotes from a raw scalar (after comment removal). */
function stripQuotes(s) {
  const t = stripComment(String(s == null ? '' : s)).trim();
  const m = t.match(/^(["'])([\s\S]*)\1$/);
  return m ? m[2] : t;
}

/**
 * Extract the `backdrop:` map from a deck source's front matter as a flat object
 * of { axis: rawStringValue }. Returns {} when absent. Reads a single level of
 * indented `key: value` lines under a bare `backdrop:` line, stopping at the
 * first line indented no deeper than `backdrop:` itself (a sibling/dedent).
 */
function readFrontMatterBackdrop(md) {
  if (!md) return {};
  const block = String(md).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!block) return {};
  const lines = block[1].split(/\r?\n/);
  const out = {};
  let baseIndent = null; // set once we're inside the backdrop: block
  for (const line of lines) {
    if (baseIndent === null) {
      const head = line.match(/^(\s*)backdrop:\s*$/);
      if (head) baseIndent = head[1].length;
      continue;
    }
    if (!line.trim()) continue; // blank lines don't end the block
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= baseIndent) break; // dedent → out of the block
    const kv = line.match(/^\s+([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = stripQuotes(kv[2]);
  }
  return out;
}

/** Parse the `strength` axis to a clamped 0–1 number, or null if absent/invalid. */
function backdropStrength(raw) {
  const map = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const v = map.strength;
  if (v == null || v === '') return null;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

/**
 * Build the inline `--backdrop-*` custom-property declarations for the `.backdrop`
 * element's `style` attribute, or '' when everything is at its default (so a
 * plain deck stamps nothing). STRENGTH is an inline value (slice 2); CLEARANCE is a
 * class (below), because its mask needs the RICH/OPAQUE dual-variant that lives in CSS.
 */
function backdropStyleDecls(mapOrMd) {
  const map = typeof mapOrMd === 'string' ? readFrontMatterBackdrop(mapOrMd) : (mapOrMd || {});
  const parts = [];
  const strength = backdropStrength(map);
  if (strength != null && strength !== 1) parts.push(`--backdrop-strength:${strength}`);
  return parts.join(';');
}

/** True when the `clearance` axis is opted ON (`on`/`true`/`yes`; default off). */
function backdropClearance(raw) {
  const map = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const v = map.clearance;
  return v != null && /^(on|true|yes)$/i.test(String(v).trim());
}

/**
 * Deck-wide backdrop CLASS tokens, appended to every section like the `finish:` /
 * `mode:` classes. `clearance: on` → `backdrop-clear` (the mask that recedes the
 * finish behind the content box lives in base.finish.css, with its RICH/OPAQUE
 * mirror driven by the existing opaque flip). [] when no class-based axis is set.
 */
function backdropClasses(mapOrMd) {
  const map = typeof mapOrMd === 'string' ? readFrontMatterBackdrop(mapOrMd) : (mapOrMd || {});
  const out = [];
  if (backdropClearance(map)) out.push('backdrop-clear');
  return out;
}

module.exports = {
  BACKDROP_AXES,
  readFrontMatterBackdrop,
  backdropStrength,
  backdropStyleDecls,
  backdropClearance,
  backdropClasses,
};
