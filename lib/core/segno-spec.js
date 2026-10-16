/**
 * SEGNO SLOT SPECS — a slot schema written as JSON data, turned into a Segno slot.
 *
 * Segno (`@laticent/segno`, engineering/decisions/2026-09-28-segno-unified-inline-notation.md)
 * declares a slot with function calls: `record({ params: { color: indexed('c', { max: 12 }) } })`.
 * A component manifest is JSON, so it cannot hold those calls. It holds this DATA form instead,
 * and `compileSlot` makes the calls. The build compiles every manifest's specs once
 * (tools/build-stage-catalog.js), so a spec Segno refuses — an ambiguous bare word, a bad tag —
 * fails the build rather than a render.
 *
 *   { "label": "a pill", "tag": "~",
 *     "positional": [{ "name": "value", "type": "text" }],
 *     "params": {
 *       "shape": { "type": "oneOf", "values": ["pill", "tag"], "aliases": { "tag": ["label"] } },
 *       "color": { "type": "indexed", "prefix": "c", "max": 12, "label": "a color" },
 *       "after": { "type": "text", "named": true },
 *       "milestone": { "type": "flag", "word": "milestone" },
 *       "span":  { "type": "range", "of": "time" } },
 *     "shortcuts": { "[x]": "{done}" },
 *     "sigils": { "@": "who" } }
 *
 * A type is a string (`"text"`, `"number"`, `"time"`, `"id"`) or an object whose `type` names
 * one of: text, number, time, id, oneOf, flag, indexed, range, list, record. `"named": true` on
 * any of them wraps it in Segno's `named()` — it must then be written `name=value`.
 *
 * Pure and dependency-light (only Segno), so it bundles into the browser runtime: both render
 * paths and the linter read the same compiled slots (HARD RULE #1, #7).
 */

const S = require('@laticent/segno/read');
const { specCompiler } = require('./segno-spec-core.js');

// The compiler itself is require-free in segno-spec-core.js, so the browser can take it with Segno's ESM reader.
module.exports = specCompiler(S);
