/**
 * lib/authoring/slot-contract.js — the `slot-contract` lint rule's engine.
 *
 * A component manifest's `slots` say what an author writes for that layout. Each slot carries a
 * structured `match` (lib/components/manifest.schema.json `$defs.slotMatch`) that describes the
 * author's MARKDOWN — the markdown-it block tree before any transform — never the rendered DOM.
 * This module reads a slide into a small `shape` (its top-level headings, lists by depth and
 * marker, blockquotes, tables, fences, paragraphs) and checks the component's slots against it.
 *
 * What it reports, all as `slot-contract` errors (decision 5 of
 * engineering/decisions/2026-11-19-deterministic-authoring-audit.md):
 *   - a required heading written at the wrong level (`#` where the layout reads `##`);
 *   - a required slot that is missing (the heading, the list, the blockquote, the table, …);
 *   - a list written with the wrong marker, on a slot whose layout reads only one marker
 *     (`agenda` with `-`, `journey` with `1.`). A slot whose layout reads both says `any`.
 *
 * The contract is compiled from the manifests into `slot-contract.generated.js` by
 * tools/build-stage-catalog.js, so this file stays pure and fs-free (HARD RULE #7): the CLI,
 * `validate()` and the browser all run the same code.
 */


const { PLUGIN_BLOCK_RULES } = require('../plugins/blocks.generated.mjs');

/** Block token type → the plugin that owns it (math's `$$` block), from the generated plugin table. */
const PLUGIN_OF_BLOCK = new Map(Object.entries(PLUGIN_BLOCK_RULES).flatMap(([plugin, types]) => types.map((t) => [t, plugin])));

/** The marker words an author recognizes, for a message. */
const MARKER_WORDS = { bullet: '`-`', ordered: '`1.`' };

/**
 * Read a slide's Markdown into the shape the matchers test. `md` is a markdown-it instance whose
 * block rules match the engine's (lib/core/boundary-parser.mjs `boundaryParser`).
 * @param {string} text  the slide's Markdown, directive comments included
 * @param {{ parse: Function }} md
 */
function slideShape(text, md) {
  const shape = {
    headings: [],
    lists: [],
    blockquotes: [],
    tables: 0,
    fences: [],
    pluginBlocks: new Set(),
    paragraphs: [],
    images: 0,
    html: [],
  };
  let listDepth = 0;
  let quoteDepth = 0;
  const tokens = md.parse(String(text || ''), {});
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'bullet_list_open':
      case 'ordered_list_open':
        listDepth++;
        shape.lists.push({ depth: listDepth, marker: t.type === 'bullet_list_open' ? 'bullet' : 'ordered', quoted: quoteDepth > 0, line: t.map ? t.map[0] : 0 });
        break;
      case 'bullet_list_close':
      case 'ordered_list_close':
        listDepth--;
        break;
      case 'blockquote_open':
        shape.blockquotes.push({ depth: listDepth });
        quoteDepth++;
        break;
      case 'blockquote_close':
        quoteDepth--;
        break;
      case 'heading_open':
        if (t.level === 0) shape.headings.push({ level: Number(t.tag.slice(1)), line: t.map ? t.map[0] : 0 });
        break;
      case 'table_open':
        shape.tables++;
        break;
      case 'fence':
      case 'code_block':
        shape.fences.push({ lang: String(t.info || '').trim().split(/\s+/)[0].toLowerCase(), depth: listDepth });
        break;
      case 'html_block': {
        const body = String(t.content || '').trim();
        if (body.startsWith('<!--')) break;
        shape.html.push(body);
        // Raw HTML the engine passes through renders as the element it names, so a `<h2>`, an
        // `<img>` or a `<blockquote>` block fills the slot a Markdown one would.
        const h = /^<h([1-6])\b/i.exec(body);
        if (h && listDepth === 0) shape.headings.push({ level: Number(h[1]), line: t.map ? t.map[0] : 0 });
        if (/<img\b/i.test(body)) shape.images++;
        if (/^<blockquote\b/i.test(body)) shape.blockquotes.push({ depth: listDepth });
        break;
      }
      case 'inline': {
        const kids = t.children || [];
        for (const c of kids) {
          if (c.type === 'image') shape.images++;
          else if (c.type === 'html_inline' && /^<img\b/i.test(c.content)) shape.images++;
        }
        const prev = tokens[i - 1];
        if (prev && prev.type === 'paragraph_open' && prev.level === 0 && listDepth === 0 && quoteDepth === 0) {
          const solid = kids.filter((c) => !(c.type === 'softbreak' || c.type === 'hardbreak' || (c.type === 'text' && !c.content.trim())));
          let kind = 'plain';
          if (solid.length && solid.every((c) => c.type === 'code_inline')) kind = 'code';
          else if (solid.length && solid.every((c) => c.type === 'image')) kind = 'image';
          else if (solid.some((c) => c.type === 'html_inline' && !/^<\/?(br|em|strong|b|i|span|sup|sub|small|mark|code|a)\b/i.test(c.content))) {
            kind = 'html';
            shape.html.push(t.content);
          }
          shape.paragraphs.push({ kind, text: t.content, math: /\$/.test(t.content) });
        }
        break;
      }
      default:
        if (PLUGIN_OF_BLOCK.has(t.type)) shape.pluginBlocks.add(PLUGIN_OF_BLOCK.get(t.type));
        break;
    }
  }
  return shape;
}

const asList = (v) => (Array.isArray(v) ? v : [v]);

/**
 * Does `shape` hold what `match` describes? `facts` carries what the slide's Markdown tree alone
 * cannot say (`panes`: the slide splits into panes). A `match` array is any-of.
 */
function matches(match, shape, facts = {}) {
  if (Array.isArray(match)) return match.some((m) => matches(m, shape, facts));
  switch (match.kind) {
    case 'heading':
      return shape.headings.some((h) => asList(match.level).includes(h.level));
    case 'list': {
      const depth = match.depth || 1;
      return shape.lists.some((l) => l.depth === depth && !l.quoted && (!match.marker || match.marker === 'any' || l.marker === match.marker));
    }
    case 'blockquote':
      return shape.blockquotes.some((b) => (match.inList ? b.depth > 0 : b.depth === 0));
    case 'table':
      return shape.tables > 0;
    case 'fence': {
      // A fence counts at any depth: the engine lifts a ```mermaid block indented under a bullet.
      const fences = shape.fences.filter((f) => !match.lang || asList(match.lang).includes(f.lang));
      return fences.length >= (match.nth || 1);
    }
    case 'math':
      return shape.pluginBlocks.has('math') || shape.paragraphs.some((p) => p.math);
    case 'paragraph':
      return shape.paragraphs.some((p) => p.kind === 'plain');
    case 'code-line':
      return shape.paragraphs.some((p) => p.kind === 'code' && (!match.prefix || p.text.replace(/^`+\s*/, '').startsWith(match.prefix)));
    case 'image':
      return shape.images > 0;
    case 'html':
      return shape.html.some((h) => !match.tag || new RegExp(`<${match.tag}\\b`, 'i').test(h));
    case 'pane':
      return !!facts.panes;
    default:
      return true;
  }
}

/** What to write, in an author's words, for a missing slot. */
function describeMatch(match) {
  if (Array.isArray(match)) return match.map(describeMatch).join(' or ');
  switch (match.kind) {
    case 'heading': return asList(match.level).map((l) => `a \`${'#'.repeat(l)} \` heading`).join(' or ');
    case 'list': {
      const marker = match.marker && match.marker !== 'any' ? `${MARKER_WORDS[match.marker]} ` : '';
      const depth = match.depth || 1;
      return depth === 1 ? `a ${marker}list` : `a ${marker}list nested ${depth - 1} level${depth > 2 ? 's' : ''} under an item`;
    }
    case 'blockquote': return match.inList ? 'a `>` blockquote inside an item' : 'a `>` blockquote';
    case 'table': return 'a table';
    // Never a bare run of backticks: in a Markdown table cell it opens a code span that swallows
    // the rest of the row (the docs site's Markdown twins then show raw markup).
    case 'fence': {
      const nth = match.nth > 1 ? `the ${match.nth === 2 ? 'second' : `${match.nth}th`} ` : 'a ';
      return `${nth}fenced code block${match.lang ? ` tagged \`${asList(match.lang)[0]}\`` : ''}`;
    }
    case 'math': return 'a `$$` equation';
    case 'paragraph': return 'a paragraph';
    case 'code-line': return match.prefix ? `a \`${match.prefix}…\` line` : 'a line of `inline code`';
    case 'image': return 'an image (`![alt](src)`)';
    case 'html': return match.tag ? `an inline \`<${match.tag}>\`` : 'an HTML block';
    case 'pane': return 'two panes';
    default: return 'its content';
  }
}

/**
 * The slots in force for a component on a slide: the base slots, overlaid in class order by each
 * variant's `variantSlots` entry. A `null` override removes the slot under that variant.
 * @param {{ slots: object, variantSlots?: object }} contract
 * @param {string[]} tokens  the slide's class tokens
 */
function effectiveSlots(contract, tokens) {
  const out = { ...contract.slots };
  for (const t of tokens) {
    const over = contract.variantSlots?.[t];
    if (!over) continue;
    for (const [name, slot] of Object.entries(over)) {
      if (slot === null) delete out[name];
      else out[name] = { ...(out[name] || {}), ...slot };
    }
  }
  return out;
}

/**
 * The `slot-contract` problems on one slide, as `{ slot, kind, message, fix }` records (the
 * caller adds slide, line and severity). `kind` is `heading-level`, `missing` or `marker`.
 * @param {string} component
 * @param {{ slots: object, variantSlots?: object }} contract
 * @param {string[]} tokens
 * @param {ReturnType<typeof slideShape>} shape
 * @param {{ panes?: boolean }} [facts]
 */
function slotProblems(component, contract, tokens, shape, facts = {}) {
  const out = [];
  const slots = effectiveSlots(contract, tokens);
  for (const [name, slot] of Object.entries(slots)) {
    const match = slot.match;
    if (!match) continue;
    const present = matches(match, shape, facts);
    // A list slot that names ONE marker: lists at its depth written with the other marker are
    // the wrong form even when the slot is optional, because the layout does not read them.
    const one = !Array.isArray(match) && match.kind === 'list' && (match.marker === 'bullet' || match.marker === 'ordered') ? match : null;
    if (one && !present) {
      const depth = one.depth || 1;
      const wrong = shape.lists.find((l) => l.depth === depth && !l.quoted && l.marker !== one.marker);
      if (wrong) {
        const other = one.marker === 'bullet' ? 'ordered' : 'bullet';
        out.push({
          slot: name,
          kind: 'marker',
          message: `'${component}' reads its ${name} from a ${MARKER_WORDS[one.marker]} list${depth > 1 ? ` nested ${depth - 1} level${depth > 2 ? 's' : ''} deep` : ''}; this slide writes ${MARKER_WORDS[other]}, so the layout does not draw it.`,
          fix: one.marker === 'ordered' ? `Number the ${depth > 1 ? 'nested ' : ''}items: \`1.\`, \`2.\`, \`3.\`.` : `Start each ${depth > 1 ? 'nested ' : ''}item with \`-\`.`,
        });
        continue;
      }
    }
    if (present || !slot.required) continue;
    if (!Array.isArray(match) && match.kind === 'heading') {
      const levels = asList(match.level);
      // Only a heading at the top two levels can be a misplaced slide heading; a `###` is a pane
      // head or a sub-label, and naming it as the wrong level would mislead.
      const other = shape.headings.find((h) => !levels.includes(h.level) && h.level <= 2);
      if (other) {
        const want = '#'.repeat(levels[levels.length - 1]);
        out.push({
          slot: name,
          kind: 'heading-level',
          message: `'${component}' reads its ${name} from a \`${want} \` heading; this slide writes \`${'#'.repeat(other.level)} \`, so no ${name} is built.`,
          fix: `Write the heading as \`${want} ${'…'}\`.`,
        });
        continue;
      }
    }
    out.push({
      slot: name,
      kind: 'missing',
      message: `'${component}' needs its ${name}, written as ${describeMatch(match)}; this slide has none, so that part of the layout is empty.`,
      fix: `Add ${describeMatch(match)}.`,
    });
  }
  return out;
}

module.exports = { slideShape, matches, describeMatch, effectiveSlots, slotProblems };
