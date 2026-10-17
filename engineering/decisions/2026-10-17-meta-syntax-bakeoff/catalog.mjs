/**
 * Splits a class string into typed fields, and rebuilds it. The bake-off needs both: the
 * canonical record is typed, and the control (comments) must carry typed fields in a `_class`.
 * Sources: dist/docs/components.json (layouts, variants, universals, modifiers) and the register
 * tables in lib/base/base.registers.docs.md (`finish: ledger` <-> `finish-ledger`).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const cat = require(path.join(ROOT, 'dist/docs/components.json'));
const V = cat.vocabularies;
const COMPONENTS = new Map(cat.components.map((c) => [c.name, c]));

const words = (s) => String(s).split(/\s+/).filter(Boolean);
const UNIVERSAL = new Set();
for (const ws of Object.values(V.universalGroups)) for (const w of ws) for (const t of words(w)) UNIVERSAL.add(t);
for (const w of V.universalVariants) for (const t of words(w)) UNIVERSAL.add(t);
for (const w of V.semiUniversalVariants) UNIVERSAL.add(w);
const MODIFIER = new Set();
for (const g of V.modifierGroups) for (const t of g.tokens) for (const x of words(t)) MODIFIER.add(x);
const MODIFIER_PATTERN = /^(tint-|mark-|at-|scale-|ratio-\d|c\d+$|backdrop-|checks-|tone-|insight-)/;

// Register tables: `| `dot` | `eyebrow-dot` | ... |` under a header `| `eyebrow:` value | ...`.
const TOKEN_TO_REGISTER = new Map(); // token -> [register, value]
const REGISTER_TO_TOKENS = new Map(); // `${register}:${value}` -> tokens[]
{
  const lines = readFileSync(path.join(ROOT, 'lib/base/base.registers.docs.md'), 'utf8').split('\n');
  let reg = null;
  for (const line of lines) {
    const h = line.match(/^\|\s*`([a-z][a-z-]*):`\s+value\s*\|/);
    if (h) { reg = h[1] === 'preset' ? null : h[1]; continue; }
    if (!line.startsWith('|')) { reg = null; continue; }
    if (!reg || /^\|\s*-+/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    const value = (cells[1] || '').replace(/`/g, '');
    const tokens = [...(cells[2] || '').matchAll(/`([^`]+)`/g)].flatMap((m) => words(m[1]));
    if (!value || !tokens.length) continue;
    REGISTER_TO_TOKENS.set(`${reg}:${value}`, tokens);
    for (const t of tokens) if (t !== 'finish' && !TOKEN_TO_REGISTER.has(t)) TOKEN_TO_REGISTER.set(t, [reg, value]);
  }
}

/** class words -> typed fields. Words the catalog cannot place land in `unplaced`. */
export function typeClass(classString) {
  const ws = words(classString);
  const out = {};
  const push = (k, w) => { out[k] = out[k] ? `${out[k]} ${w}` : w; };
  const layout = ws.find((w) => COMPONENTS.has(w));
  if (layout) out.layout = layout;
  const comp = layout && COMPONENTS.get(layout);
  const variants = new Set([...(comp?.variants || []), ...(comp?.effectiveVariants || [])]);
  for (const w of ws) {
    if (w === layout || w === 'finish') continue;
    if (UNIVERSAL.has(w)) push('universal', w);
    else if (TOKEN_TO_REGISTER.has(w)) { const [r, v] = TOKEN_TO_REGISTER.get(w); out[r] = v; }
    else if (variants.has(w)) push('variant', w);
    else if (MODIFIER.has(w) || MODIFIER_PATTERN.test(w)) push('modifiers', w);
    else push('unplaced', w);
  }
  return out;
}

const CLASS_AXES = new Set(['layout', 'variant', 'universal', 'modifiers', 'unplaced']);
export const isClassField = (k) => CLASS_AXES.has(k) || [...REGISTER_TO_TOKENS.keys()].some((x) => x.startsWith(`${k}:`));

/** typed fields -> class words (the control's `_class` value). */
export function classWords(fields) {
  const out = [];
  if (fields.layout) out.push(fields.layout);
  for (const k of ['variant', 'universal', 'modifiers', 'unplaced']) if (fields[k]) out.push(...words(fields[k]));
  for (const [k, v] of Object.entries(fields)) {
    const t = REGISTER_TO_TOKENS.get(`${k}:${v}`);
    if (t) out.push(...t);
  }
  return out.join(' ');
}
export const stats = { components: COMPONENTS.size, registerTokens: TOKEN_TO_REGISTER.size };

/** Canonical field names are kebab-case for every candidate (Segno folds names to lowercase). */
export const kebab = (k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
export const camel = (k) => k.replace(/-([a-z])/g, (_, m) => m.toUpperCase());
