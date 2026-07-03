// The Drawing Board — the Lattice primer for Converse (the cloud tier).
//
// A generic chat model knows that `decision` exists ("the verdict slide") but not
// HOW to author one — so it infers the structure and guesses wrong (real bug, seen
// on-device). This turns the catalog the Drawing Board already ships into a full
// authoring dossier: for every layout, its name + when-to-use + variants + slot
// contracts + the exact authoring SKELETON. The model copies the skeleton instead
// of guessing. Plus the cross-cutting authoring rules / base modifiers.
//
// Pure + bounded (~30 KB against the live 48-layout catalog). Injected ONLY into
// the rich (OpenRouter/cloud) prompt — the small local model would drown in it, so its
// prompt stays lean (see buildChatMessages).

const BUCKET_ORDER = [
  'anchor', 'statement', 'inventory', 'comparison', 'progression',
  'evidence', 'imagery', 'chart', 'diagram', 'math', 'code', 'legal',
];

// The footguns that bite authors (and a model writing on their behalf) the most.
// Sourced from lib/base/base.docs.md + the card-style contract in lint-core.js.
export const AUTHORING_RULES = [
  'Author every slide as plain Markdown. Choose a layout with `<!-- _class: NAME -->` at the top of the slide; separate slides with a line containing only `---`.',
  'Use each layout’s skeleton below VERBATIM as the structure — match its heading levels and bullet nesting exactly. Do not invent a structure.',
  'A variant can change a layout’s authoring STRUCTURE, not just its look. When a variant below shows its OWN skeleton, match THAT skeleton for that variant — not the base one (e.g. `list-tabular` rows are `1. Name` + a nested description, but `list-tabular metric` is `1. Name \\`value\\`` with no description row).',
  'Card-style layouts (cards-grid, cards-stack, compare-prose, matrix-2x2, verdict-grid, decision, citation-card) take NESTED bullets — a top-level bullet is the card title, a nested bullet is its body. NEVER write inline `- **Title.** body` on these; the body would inherit the title’s bold.',
  'Title slides: `<!-- _class: title silent -->`, then a backtick-wrapped `eyebrow`, then an `# H1`, then a single plain subtitle paragraph — nothing more.',
  'Compose tokens on the class, space-separated: a layout’s own VARIANTS (listed with each layout, e.g. `list-steps timeline`) plus the cross-cutting BASE MODIFIERS — `dark`, `numbered`, `mirror`, `silent`, the `tint-*` / `mark-*` / `with-*` families, and the `tone-pass` / `tone-fail` / `tone-warn` / `tone-skip` state markers. Colours come from theme tokens — never author raw hex.',
  'Rich blocks are supported: ```chart (native charts), ```mermaid (25 diagram types), and $$…$$ (KaTeX math).',
  'Keep it tight — slides are glance media, not documents. Respect each layout’s `Budget:` line (max elements + words per element). Universal limits on ANY slide regardless of layout: eyebrow ≤ 5 words, slide title ≤ 10, subtitle ≤ 12, a `> ` key-insight ≤ 18 (one memorable sentence), a status pill 1–2 words. When an element needs more, cut it or move the detail to speaker notes — never let a card become a paragraph.',
];

// A generic "Slide heading."-style slot description adds nothing the skeleton
// doesn't already show — skip it so only the real authoring contracts survive.
const isGenericSlot = (d) => /^slide (heading|title)\.?$/i.test(String(d || '').trim());

// ── Grammar-changing variant detection ───────────────────────────────────────
// A variant can change the bullet GRAMMAR (ordered vs unordered, a nested
// description row, a trailing `value` pill), or it can be pure finish (a colour,
// a flip). `list-tabular` is the sharp case: the base is `1. Name` + a nested
// description, `metric` is `1. Name `value`` (no description), and `spec` keys
// the name in `code`. The base skeleton ALONE made the model author every
// variant in the base's shape (and "validate" a value-ledger as correct).
// So the dossier ships the skeleton of each variant whose authoring grammar
// DIFFERS from the base (and from an already-picked sibling); finish-only
// variants (`solid`, `outline`, `mirror`, `rule`, …) collapse onto a sibling
// and drop. Pure + build-time — called from the Drawing Board catalog map.
//
// A list line's grammar token = depth (0 top / 1 nested) | marker (ol/ul) |
// what leads the content (`b`old / `c`ode / plain `x`) | whether the line ENDS
// in a `value` pill (`c`). The tail check is trailing-only so an incidental code
// span mid-prose (a modifier name like `chosen`) isn't read as a value grammar.
function listLineToken(line) {
  const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
  if (!m) return null;
  const depth = m[1].length >= 2 ? 1 : 0;
  const marker = /^\d/.test(m[2]) ? 'ol' : 'ul';
  const rest = m[3];
  const lead = /^\*\*/.test(rest) ? 'b' : /^`/.test(rest) ? 'c' : 'x';
  const tail = /`[^`]+`\s*$/.test(rest) ? 'c' : '';
  return `${depth}|${marker}|${lead}|${tail}`;
}
function grammarKey(md) {
  const set = new Set();
  for (const line of String(md || '').split('\n')) {
    const t = listLineToken(line);
    if (t) set.add(t);
  }
  return [...set].sort().join(',');
}
export function pickGrammarVariants(manifest) {
  const vd = manifest?.variantDocs;
  if (!vd || typeof vd !== 'object') return [];
  const seen = new Set([grammarKey(manifest.skeleton)]);
  const picked = [];
  for (const [name, info] of Object.entries(vd)) {
    if (!info?.sample) continue;
    const key = grammarKey(info.sample);
    if (!key || seen.has(key)) continue; // same grammar as base/sibling → finish-only
    seen.add(key);
    picked.push({ name, caption: (info.caption || info.label || '').trim(), sample: String(info.sample).trim() });
  }
  return picked;
}

// One layout's dossier block: name + when, its variants, the non-generic slot
// contracts, and the authoring skeleton (four-backtick fenced so a skeleton that
// itself contains ```chart / ```mermaid doesn't break the fence).
function layoutBlock(c) {
  const lines = [`### ${c.name}${c.summary ? ` — ${c.summary}` : ''}`];
  if (c.variants?.length) {
    lines.push(`Variants: ${c.variants.join(', ')} (append to the class, e.g. \`${c.name} ${c.variants[0]}\`).`);
  }
  // Budget the author toward brevity UP FRONT — the element COUNT (capacity) and
  // the per-element WORD budget (density). This is the single most effective lever
  // against the model over-stuffing a layout, and the whole point of the budgets:
  // the model must SEE them while authoring, not just be reviewed after. See
  // engineering/decisions/2026-06-30-prose-density-budget.md (red-team fix).
  const budget = [];
  if (c.capacity) budget.push(`≤ ${c.capacity.soft} ${c.capacity.axis || 'item'}${c.capacity.soft === 1 ? '' : 's'}`);
  if (c.density) budget.push(`≤ ~${c.density.soft} words each`);
  if (budget.length) {
    lines.push(`Budget: ${budget.join(', ')}${c.density?.note ? ` — ${c.density.note}` : ''}. Keep it tight; push detail to speaker notes.`);
  }
  for (const s of c.slots || []) {
    if (!s.description || isGenericSlot(s.description)) continue;
    lines.push(`- \`${s.name}\`${s.required ? '' : ' (optional)'}: ${s.description}`);
  }
  if (c.skeleton) lines.push(`\`\`\`\`\n${String(c.skeleton).trim()}\n\`\`\`\``);
  // Variants that change the authoring STRUCTURE (not just the finish) carry
  // their own skeleton — the base one above would mislead the model into
  // authoring them in the base's shape. Selected by pickGrammarVariants at
  // catalog-build time; finish-only variants are dropped, so this stays lean.
  for (const v of c.variantSkeletons || []) {
    if (!v?.sample) continue;
    lines.push(`\`${c.name} ${v.name}\` is authored differently${v.caption ? ` — ${v.caption}` : ''}:`);
    lines.push(`\`\`\`\`\n${String(v.sample).trim()}\n\`\`\`\``);
  }
  return lines.join('\n');
}

export function buildLatticePrimer(catalog) {
  const items = (catalog || []).filter((c) => c?.name);
  const byBucket = {};
  for (const c of items) (byBucket[c.bucket || 'other'] ||= []).push(c);
  const buckets = [...new Set([...BUCKET_ORDER, ...Object.keys(byBucket)])].filter((b) => byBucket[b]);

  const sections = buckets.map((b) => {
    const blocks = byBucket[b]
      .slice()
      .sort((x, y) => x.name.localeCompare(y.name))
      .map(layoutBlock);
    return `## ${b}\n\n${blocks.join('\n\n')}`;
  });

  return (
    'You know Lattice, the Markdown slide engine this deck is written in. Below is EVERY ' +
    'layout — its name, when to use it, its variants, slot contracts, and a skeleton showing ' +
    'exactly how to author it. Use the exact layout name in `_class`, and match the skeleton’s ' +
    'structure verbatim; never guess.\n\n' +
    sections.join('\n\n') +
    '\n\nAuthoring rules:\n' +
    AUTHORING_RULES.map((r) => `- ${r}`).join('\n')
  );
}
