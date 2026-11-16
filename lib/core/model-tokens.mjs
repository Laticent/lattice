/**
 * lib/core/model-tokens.mjs
 *
 * THE TOKEN ADAPTER (Segno deck pipeline P4, engineering/decisions/2026-10-22-segno-deck-pipeline.md §P4 landed):
 * markdown-it's token stream, built from the deck model (`@laticent/segno-markdown`) instead of markdown-it's own
 * block and inline parsers. Its output is what `md.parse` leaves after its `block` and `inline` core rules, token for
 * token and field for field (type, tag, nesting, level, map, content, markup, info, attrs, children, block, hidden,
 * meta), so the rest of a markdown-it pipeline (Lattice's core rules, the renderer) runs on it unchanged. That is
 * how P7 can render from the model while markdown-it's renderer is still the one that writes HTML.
 *
 * NO RENDER PATH READS THIS YET. The engine renders through markdown-it's own parse; switching it is P7, which holds
 * the switch to the adversarial trio. test/unit/core/model-tokens.test.js holds the adapter to markdown-it on the
 * corpus: the same tokens, and the same HTML from the engine end to end with only the parse swapped.
 *
 * THE CONFIGURATION IS READ OFF THE TARGET markdown-it. `parsersFor(md)` builds the block and inline parsers from the
 * rules `md` has enabled: the plugin block rules it installed (a plugin a deck did not load is not there), the plugin
 * inline rules with their manifest triggers, and markdown-it's options. A configuration the model cannot match (an
 * option or rule it has no port of, such as `linkify` or `typographer`) throws rather than drift.
 *
 * WHAT STILL COMES FROM markdown-it. The model decides structure; the strings markdown-it derives from a range are
 * derived here with markdown-it's own functions, so they match by construction: `normalizeLink`, `validateLink`,
 * `normalizeLinkText`, `unescapeAll`, and a named entity's decoding, which a commonmark parse of the reference
 * answers. P7 replaces these with the model's own when markdown-it goes.
 */

import { BlockParser, COL_SHIFT, detailedModel, F_CLOSED, F_EMPTY, F_HIDDEN, F_LINK_TEXT, I_AUX, I_FLAGS, I_FROM, I_KIND, I_LEVEL, I_NEST, I_TO, IKIND, InlineParser, ISTRIDE, inlineSlide, isEscapable, KIND, L_CHILD, L_DEST0, L_DEST1, L_REF, L_TITLE0, L_TITLE1, L_TYPE, LINK_AUTO, LINK_EMAIL, LINK_REF, LSTRIDE, referencesOf, SPECIAL_ENTITY, STRIDE, slideDetail, T_AUX, T_FLAGS, T_KIND, T_L0, T_L1, T_LEVEL, T_NEST } from '@laticent/segno-markdown';
import MarkdownIt from 'markdown-it';
import { BLOCK_TRIGGERS, FORWARD_SCAN_LINES, installPluginBlocks } from '../plugins/blocks.generated.mjs';
import { PLUGIN_GRAMMAR } from '../plugins/grammar.generated.mjs';

/**
 * markdown-it's own rule chains as Lattice configures them: the adapter ports exactly these. `rawtext_block` is the
 * engine's `</style >` close (lib/core/rawtext-close.mjs), which the block pass folds into its `html_block`.
 */
const CORE_BLOCK = ['table', 'code', 'fence', 'blockquote', 'hr', 'list', 'reference', 'rawtext_block', 'html_block', 'heading', 'lheading', 'paragraph'];
const CORE_INLINE = ['text', 'newline', 'escape', 'backticks', 'strikethrough', 'emphasis', 'link', 'image', 'autolink', 'html_inline', 'entity'];
const CORE_INLINE2 = ['balance_pairs', 'strikethrough', 'emphasis', 'fragments_join'];

/** Every plugin block rule, as the generated installer would put it on markdown-it (lib/core/deck-model.mjs). */
function pluginBlockRules() {
  const rules = [];
  const add = (where) => (anchor, name, rule, opts) =>
    rules.push({ name, rule, [where]: anchor, alt: opts?.alt, triggers: BLOCK_TRIGGERS[name], scansAhead: name in FORWARD_SCAN_LINES });
  installPluginBlocks({ block: { ruler: { before: add('before'), after: add('after') } } });
  return rules;
}
const ALL_BLOCK_RULES = pluginBlockRules();

/** Every plugin inline rule the grammar declares, by the function markdown-it holds for it. */
const PLUGIN_INLINE = new Map();
for (const p of PLUGIN_GRAMMAR)
  for (const [name, rule] of Object.entries(p.syntax)) if (rule.kind === 'inline') PLUGIN_INLINE.set(rule.run, { name, rule });

/** A named entity's decoding, as markdown-it's entity rule gives it, or null when `&name;` is not one. */
let probe = null;
const entityMemo = new Map();
function decodeNamed(match) {
  let hit = entityMemo.get(match);
  if (hit !== undefined) return hit;
  probe ??= new MarkdownIt('commonmark');
  // The inline parser alone: a full parse would join the entity into a text token (`text_join`).
  const kids = [];
  probe.inline.parse(match, probe, {}, kids);
  const t = kids[0];
  hit = kids.length === 1 && t.type === 'text_special' && t.info === 'entity' && t.markup === match ? t.content : null;
  entityMemo.set(match, hit);
  return hit;
}

const parsers = new WeakMap();

/**
 * The block and inline parsers that read Markdown as `md` is configured to, kept per instance and rebuilt when its
 * enabled rules change.
 * @param {import('markdown-it').default} md
 */
export function parsersFor(md) {
  const enabledBlock = md.block.ruler.__rules__.filter((r) => r.enabled);
  const enabledInline = md.inline.ruler.__rules__.filter((r) => r.enabled);
  const enabledInline2 = md.inline.ruler2.__rules__.filter((r) => r.enabled);
  const key = [enabledBlock, enabledInline, enabledInline2].map((l) => l.map((r) => r.name).join(',')).join('|');
  const hit = parsers.get(md);
  if (hit && hit.key === key) return hit;
  const o = md.options;
  if (o.linkify || o.typographer || o.maxNesting !== 20 || o.html !== true) throw new Error('model-tokens: markdown-it options the model has no port of');
  // The ported chains, less the two rules a configuration may leave off: the GFM table and strikethrough rules
  // (the plain commonmark preset, which the spec metric runs) and the engine's rawtext close.
  const coreBlock = enabledBlock.filter((r) => !r.fn.rule).map((r) => r.name);
  const table = coreBlock.includes('table');
  const ported = CORE_BLOCK.filter((n) => (n !== 'table' || table) && (n !== 'rawtext_block' || coreBlock.includes(n)));
  if (coreBlock.join() !== ported.join()) throw new Error(`model-tokens: block rules ${coreBlock.join()} are not the ported set`);
  // Without the engine's tolerant close, `</style >` does not end a raw-text HTML block, and the port has only the
  // tolerant form.
  if (!coreBlock.includes('rawtext_block') && coreBlock.includes('html_block')) throw new Error('model-tokens: html_block without the engine\'s rawtext close is not ported');
  const blockFns = new Set(enabledBlock.map((r) => r.fn.rule).filter(Boolean));
  const linkOk = (dest) => md.validateLink(md.normalizeLink(md.utils.unescapeAll(dest)));
  const block = new BlockParser({ rules: ALL_BLOCK_RULES.filter((r) => blockFns.has(r.rule.rule)), linkOk, table });
  const coreInline = enabledInline.filter((r) => !PLUGIN_INLINE.has(r.fn)).map((r) => r.name);
  const strikethrough = coreInline.includes('strikethrough');
  const keep = (n) => n !== 'strikethrough' || strikethrough;
  if (coreInline.join() !== CORE_INLINE.filter(keep).join()) throw new Error(`model-tokens: inline rules ${coreInline.join()} are not the ported set`);
  if (enabledInline2.map((r) => r.name).join() !== CORE_INLINE2.filter(keep).join()) throw new Error('model-tokens: inline post-processing is not the ported set');
  // Each plugin rule anchored after the rule markdown-it's chain has before it, which reproduces the order whatever
  // the manifest's own anchor said.
  const rules = [];
  enabledInline.forEach((r, i) => {
    const p = PLUGIN_INLINE.get(r.fn);
    if (!p) return;
    rules.push({ name: p.name, rule: r.fn, after: enabledInline[i - 1].name, triggers: p.rule.triggers?.join('') });
  });
  const inline = new InlineParser({ namedEntity: (m) => decodeNamed(m) !== null, linkOk, rules, strikethrough });
  const out = { key, block, inline };
  parsers.set(md, out);
  return out;
}

const HEADING_MARKUP = '########';
const ALIGN = ['', 'left', 'right', 'center'];

/** A fragment of body lines as markdown-it's `getLines` takes them, from a recorded side `meta` or as they stand. */
function linesText(m, meta, from, to, keepLastLF) {
  const body = m.body;
  let out = '';
  for (let line = from, k = 0; line < to; line++, k += 2) {
    const start = m.lineStart(line);
    const end = m.lineEnd(line);
    const last = line + 1 < to || keepLastLF ? Math.min(end + 1, body.length) : end;
    if (meta) out += ' '.repeat(meta[k + 1]) + body.slice(Math.min(start + meta[k], last), last);
    else out += body.slice(start, last);
  }
  return out;
}

/**
 * markdown-it's tokens for `src`, which must be what markdown-it's `normalize` core rule leaves (no `\r`, NULs
 * replaced), read from the deck model. Sets `env.references` as markdown-it's block parse would.
 * @param {import('markdown-it').default} md
 * @param {string} src
 * @param {object} env
 */
export function modelTokens(md, src, env) {
  const { block, inline } = parsersFor(md);
  const model = detailedModel(src, { parser: block, inline, frontMatter: null, raw: true });
  const Token = md.core.State.prototype.Token;
  const refs = referencesOf(model);
  const unescapeAll = md.utils.unescapeAll;
  // A caller can hand markdown-it an `env.references` already filled in: its entries win over the document's
  // definitions and resolve labels the document never defines. Then every leaf reads that merged table (below)
  // instead of the model's own, as markdown-it would.
  const prefilled = env.references !== undefined && Object.keys(env.references).length > 0;
  if (refs.table) {
    env.references ??= {};
    for (const [key, i] of refs.table) {
      if (env.references[key] !== undefined) continue;
      const r = refs.list[i];
      env.references[key] = { title: r.title === null ? '' : unescapeAll(r.title), href: md.normalizeLink(unescapeAll(r.dest)) };
    }
  }
  const body = model.body;
  const out = [];
  const opens = []; // open tokens by level, for the closing token's markup
  let leaves = [];
  let nextLeaf = 0;
  // Slide by slide, each read from its DETAIL parse (the same tokens, with the columns and line starts recorded).
  for (let seg = 0; seg < model.segs.length; seg++) {
    const sd = slideDetail(model, seg);
    const dl = model.segLine[seg] - sd.line0;
    // The slide's leaves, parsed in one pass, consumed in tape order by its `inline` tokens.
    leaves = inlineSlide(model, seg);
    nextLeaf = 0;
    for (let j = 0; j < model.segs[seg].length; j++) {
      const tok = blockToken(sd.parse, sd.t0 + j, dl);
      if (tok.nesting > 0) opens[tok.level] = tok;
      out.push(tok);
    }
  }
  return out;

  function blockToken(d, j, dl) {
    const t = d.tape;
    const at = j * STRIDE;
    const kind = t[at + T_KIND];
    const type = d.kinds[kind];
    const nesting = t[at + T_NEST];
    const level = t[at + T_LEVEL];
    const flags = t[at + T_FLAGS];
    const aux = t[at + T_AUX];
    const l0 = t[at + T_L0] >= 0 ? t[at + T_L0] + dl : -1;
    const l1 = t[at + T_L1] + dl;
    const side = d.side.get(j);
    const tok = new Token(type, '', nesting);
    tok.level = level;
    tok.block = true;
    if (l0 >= 0) tok.map = [l0, l1];
    if (flags & F_HIDDEN) tok.hidden = true;
    const lineAt = (line) => model.lineStart(line) + (flags >> COL_SHIFT);
    const open = nesting < 0 ? opens[level] : null;
    switch (kind) {
      case KIND.paragraph_open:
      case KIND.paragraph_close:
        tok.tag = 'p';
        break;
      case KIND.heading_open: {
        const setext = aux >= 8;
        const lvl = setext ? aux - 8 : aux;
        tok.tag = `h${lvl}`;
        tok.markup = setext ? (lvl === 1 ? '=' : '-') : HEADING_MARKUP.slice(0, lvl);
        break;
      }
      case KIND.heading_close:
        tok.tag = open.tag;
        tok.markup = open.markup;
        break;
      case KIND.bullet_list_open:
      case KIND.ordered_list_open: {
        // The list's marker is its first item's, which follows it on the tape.
        const item = at + STRIDE;
        const pos = model.lineStart(t[item + T_L0] + dl) + (t[item + T_FLAGS] >> COL_SHIFT);
        if (kind === KIND.bullet_list_open) {
          tok.tag = 'ul';
          tok.markup = body[pos];
        } else {
          tok.tag = 'ol';
          let p = pos;
          while (body.charCodeAt(p) >= 0x30 && body.charCodeAt(p) <= 0x39) p++;
          tok.markup = body[p];
          if (aux !== 1) tok.attrs = [['start', aux]];
        }
        break;
      }
      case KIND.bullet_list_close:
      case KIND.ordered_list_close:
        tok.tag = open.tag;
        tok.markup = open.markup;
        break;
      case KIND.list_item_open: {
        tok.tag = 'li';
        const list = opens[level - 1];
        tok.markup = list.markup;
        if (list.type === 'ordered_list_open') {
          const pos = lineAt(l0);
          let p = pos;
          while (body.charCodeAt(p) >= 0x30 && body.charCodeAt(p) <= 0x39) p++;
          tok.info = body.slice(pos, p);
        }
        break;
      }
      case KIND.list_item_close:
        tok.tag = 'li';
        tok.markup = open.markup;
        break;
      case KIND.blockquote_open:
      case KIND.blockquote_close:
        tok.tag = 'blockquote';
        tok.markup = '>';
        break;
      case KIND.hr: {
        tok.tag = 'hr';
        const marker = body[lineAt(l0)];
        let cnt = 0;
        for (let p = lineAt(l0), end = model.lineEnd(l0); p < end; p++) if (body[p] === marker) cnt++;
        tok.markup = marker.repeat(cnt);
        break;
      }
      case KIND.fence: {
        tok.tag = 'code';
        const pos = lineAt(l0);
        tok.markup = body.slice(pos, pos + aux);
        tok.info = body.slice(pos + aux, model.lineEnd(l0));
        const end = flags & F_CLOSED ? l1 - 1 : l1;
        tok.content = linesText(model, side?.meta, l0 + 1, end, true);
        break;
      }
      case KIND.code_block:
        tok.tag = 'code';
        tok.content = `${linesText(model, side.meta, l0, l1, false)}\n`;
        break;
      case KIND.html_block:
        tok.content = linesText(model, side?.meta, l0, l1, true);
        break;
      case KIND.table_open:
      case KIND.table_close:
        tok.tag = 'table';
        break;
      case KIND.thead_open:
      case KIND.thead_close:
        tok.tag = 'thead';
        break;
      case KIND.tbody_open:
      case KIND.tbody_close:
        tok.tag = 'tbody';
        break;
      case KIND.tr_open:
      case KIND.tr_close:
        tok.tag = 'tr';
        break;
      case KIND.th_open:
      case KIND.td_open:
        tok.tag = kind === KIND.th_open ? 'th' : 'td';
        if (aux) tok.attrs = [['style', `text-align:${ALIGN[aux]}`]];
        break;
      case KIND.th_close:
      case KIND.td_close:
        tok.tag = kind === KIND.th_close ? 'th' : 'td';
        break;
      case KIND.inline: {
        const { tape, leaf } = leaves[nextLeaf++];
        tok.content = leaf.text;
        tok.children = prefilled ? inlineChildren(md, leaf.text, env) : inlineTokens(md, Token, tape, refs);
        break;
      }
      default:
        // A plugin's block token: what its rule wrote.
        if (side) {
          if (side.tag) tok.tag = side.tag;
          if (side.content !== undefined) tok.content = side.content;
          if (side.markup !== undefined) tok.markup = side.markup;
          if (side.info !== undefined) tok.info = side.info;
          if (side.meta !== undefined) tok.meta = side.meta;
        }
    }
    return tok;
  }
}

/**
 * markdown-it's `.replace(/^ (.+) $/, '$1')` on a code span's text (its newlines already spaces), as a scan: one space
 * off each end when both ends are spaces and what lies between is one or more characters with no line terminator
 * (`.` matches none of `\r`, U+2028, U+2029).
 */
function codeSpanText(s) {
  const n = s.length;
  if (n < 3 || s.charCodeAt(0) !== 0x20 || s.charCodeAt(n - 1) !== 0x20) return s;
  for (let i = 1; i < n - 1; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x0d || c === 0x2028 || c === 0x2029 || c === 0x0a) return s;
  }
  return s.slice(1, n - 1);
}

/** markdown-it's inline tokens from an inline tape, `fragments_join` applied. */
function inlineTokens(md, Token, tape, refs) {
  const t = tape.tape;
  const src = tape.src;
  const out = [];
  const unescapeAll = md.utils.unescapeAll;
  const href = (rec) => {
    const d0 = tape.links[rec + L_DEST0];
    if (tape.links[rec + L_TYPE] === LINK_REF) {
      const r = refs.list[tape.links[rec + L_REF]];
      return refs.resolved ? r.href : md.normalizeLink(unescapeAll(r.dest));
    }
    return d0 < 0 ? '' : md.normalizeLink(unescapeAll(src.slice(d0, tape.links[rec + L_DEST1])));
  };
  const title = (rec) => {
    if (tape.links[rec + L_TYPE] === LINK_REF) {
      const r = refs.list[tape.links[rec + L_REF]];
      if (refs.resolved) return r.title;
      return r.title === null ? '' : unescapeAll(r.title);
    }
    const t0 = tape.links[rec + L_TITLE0];
    return t0 < 0 ? '' : unescapeAll(src.slice(t0, tape.links[rec + L_TITLE1]));
  };
  for (let i = 0; i < tape.length; i++) {
    const at = i * ISTRIDE;
    const kind = t[at + I_KIND];
    const from = t[at + I_FROM];
    const to = t[at + I_TO];
    const aux = t[at + I_AUX];
    const flags = t[at + I_FLAGS];
    const tok = new Token(tape.kinds[kind], '', t[at + I_NEST]);
    tok.level = t[at + I_LEVEL];
    switch (kind) {
      case IKIND.text:
        tok.content = flags & F_EMPTY ? '' : flags & F_LINK_TEXT ? md.normalizeLinkText(src.slice(from, to)) : src.slice(from, to);
        break;
      case IKIND.text_special: {
        const markup = src.slice(from, to);
        tok.markup = markup;
        if (aux === SPECIAL_ENTITY) {
          tok.info = 'entity';
          if (markup.charCodeAt(1) === 0x23) {
            const hex = markup[2] === 'x' || markup[2] === 'X';
            const code = hex ? parseInt(markup.slice(3, -1), 16) : parseInt(markup.slice(2, -1), 10);
            tok.content = md.utils.isValidEntityCode(code) ? md.utils.fromCodePoint(code) : md.utils.fromCodePoint(0xfffd);
          } else {
            tok.content = decodeNamed(markup);
          }
        } else {
          tok.info = 'escape';
          const escaped = markup.slice(1);
          tok.content = escaped === '' ? '\\' : isEscapable(escaped.charCodeAt(0)) ? escaped : markup;
          if (escaped === '') tok.markup = '\\';
        }
        break;
      }
      case IKIND.softbreak:
      case IKIND.hardbreak:
        tok.tag = 'br';
        break;
      case IKIND.code_inline:
        tok.tag = 'code';
        tok.markup = src.slice(from, from + aux);
        tok.content = codeSpanText(src.slice(from + aux, to - aux).replace(/\n/g, ' '));
        break;
      case IKIND.html_inline:
        tok.content = src.slice(from, to);
        break;
      case IKIND.em_open:
      case IKIND.em_close:
        tok.tag = 'em';
        tok.markup = String.fromCharCode(aux);
        break;
      case IKIND.strong_open:
      case IKIND.strong_close:
        tok.tag = 'strong';
        tok.markup = String.fromCharCode(aux, aux);
        break;
      case IKIND.s_open:
      case IKIND.s_close:
        tok.tag = 's';
        tok.markup = '~~';
        break;
      case IKIND.link_open: {
        tok.tag = 'a';
        const rec = aux * LSTRIDE;
        const type = tape.links[rec + L_TYPE];
        if (type === LINK_AUTO || type === LINK_EMAIL) {
          const url = src.slice(tape.links[rec + L_DEST0], tape.links[rec + L_DEST1]);
          tok.attrs = [['href', md.normalizeLink(type === LINK_EMAIL ? `mailto:${url}` : url)]];
          tok.markup = 'autolink';
          tok.info = 'auto';
        } else {
          tok.attrs = [['href', href(rec)]];
          const ti = title(rec);
          if (ti) tok.attrs.push(['title', ti]);
        }
        break;
      }
      case IKIND.link_close: {
        tok.tag = 'a';
        const type = tape.links[aux * LSTRIDE + L_TYPE];
        if (type === LINK_AUTO || type === LINK_EMAIL) {
          tok.markup = 'autolink';
          tok.info = 'auto';
        }
        break;
      }
      case IKIND.image: {
        tok.tag = 'img';
        const rec = aux * LSTRIDE;
        const child = tape.children[tape.links[rec + L_CHILD]];
        tok.attrs = [['src', href(rec)], ['alt', '']];
        tok.children = inlineTokens(md, Token, child, refs);
        tok.content = child.src;
        const ti = title(rec);
        if (ti) tok.attrs.push(['title', ti]);
        break;
      }
      default: {
        const side = tape.side.get(i);
        if (side) {
          tok.tag = side.tag;
          if (side.content !== undefined) tok.content = side.content;
          if (side.markup !== undefined) tok.markup = side.markup;
          if (side.info !== undefined) tok.info = side.info;
          if (side.meta !== undefined) tok.meta = side.meta;
        }
      }
    }
    // fragments_join: a text token after a text token joins it.
    const prev = out[out.length - 1];
    if (tok.type === 'text' && prev && prev.type === 'text') prev.content += tok.content;
    else out.push(tok);
  }
  return out;
}

const fromModel = new WeakMap();

/**
 * `md.parse(src, env)` with markdown-it's block and inline parsers replaced by the model: every other core rule (the
 * engine's `lattice_*` rules, `text_join`) runs as it would, in its place. markdown-it's `normalize` runs first, so the
 * model reads the text markdown-it's parsers would. In inline mode (`md.parseInline`) the whole source is one leaf.
 *
 * Each `inline` token the model built keeps its tape until the `inline` step; a core rule between the two that wrote
 * a new `inline` token, or changed one's content, gets a fresh inline parse of what it wrote.
 * @param {import('markdown-it').default} md
 * @param {string} src
 * @param {object} [env]
 * @param {boolean} [inlineMode]
 */
export function parseFromModel(md, src, env = {}, inlineMode = false) {
  if (typeof src !== 'string') throw new Error('Input data should be a String');
  const state = new md.core.State(src, md, env);
  state.inlineMode = inlineMode;
  for (const r of md.core.ruler.__rules__) {
    if (!r.enabled) continue;
    if (r.name === 'block') {
      if (state.inlineMode) {
        const tok = new state.Token('inline', '', 0);
        tok.content = state.src;
        tok.map = [0, 1];
        tok.children = [];
        state.tokens.push(tok);
      } else {
        state.tokens = modelTokens(md, state.src, state.env);
        for (const t of state.tokens) if (t.type === 'inline') fromModel.set(t, t.content);
      }
    } else if (r.name === 'inline') {
      for (const t of state.tokens) {
        if (t.type !== 'inline' || fromModel.get(t) === t.content) continue;
        t.children = inlineChildren(md, t.content, state.env);
      }
    } else {
      r.fn(state);
    }
  }
  return state.tokens;
}

/** markdown-it's inline tokens for a string, read by the model's inline parser against `env.references`. */
function inlineChildren(md, content, env) {
  const { inline } = parsersFor(md);
  const Token = md.core.State.prototype.Token;
  // The references markdown-it would read: `env.references`, keyed as it keys them. Their spelling is gone by now
  // (markdown-it keeps the normalized href and title), so the adapter's reference list is built from those.
  const keys = env.references ? Object.keys(env.references) : [];
  const list = keys.map((key) => ({ key, href: env.references[key].href, title: env.references[key].title }));
  const table = keys.length ? new Map(keys.map((k, i) => [k, i])) : null;
  return inlineTokens(md, Token, inline.parse(content, table), { list, resolved: true });
}
