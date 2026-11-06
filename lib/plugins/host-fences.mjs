/**
 * lib/plugins/host-fences.mjs — `ctx.fences()` for a bake: every fence of a plugin's in the deck SOURCE, as the ENGINE
 * parses it (engineering/decisions/2026-11-06-plugin-patterns.md §4, D2 slice 3; owner: "the plugin should be handed the
 * content of the fence"). A plugin never scans Markdown: the host parses with the engine's own block grammar
 * (lib/core/boundary-parser.mjs: CommonMark with HTML, tables, strikethrough and every admitted plugin's block rules, so a
 * fence inside a `$$` block, an HTML block or another fence is not a fence here, exactly as the engine renders it) and
 * hands the plugin each fence's place and body.
 *
 * WHAT IT REPLACED: Mermaid's bake found its fences with two readers of its own, a line walker over the raw Markdown
 * (mermaid-fences.js) and a second markdown-it pass for fences in a quote or a list (nested-fences.js, which imitated the
 * math block by counting `$$` lines). The walker drew a fence the engine reads as part of an HTML block (`<div>` …
 * ```` ```mermaid ```` … `</div>`), so the export showed a diagram the preview did not; and it refused any fence whose
 * body held a thematic break, because a walker that misjudged a fence's end could splice across a slide break. A token
 * cannot misjudge its end: the engine never splits a slide inside a fence.
 *
 * THE SHAPE each fence comes in, offsets into the source the bake was handed:
 *   start   the opening line's first character (its container prefix or indent included)
 *   end     the closing line's last character
 *   body    the fence's content as the engine reads it (markdown-it's `token.content`: the container's prefix and the
 *           opener's indent removed, ending in a newline)
 *   marker  the opening run (```` ``` ````, `~~~~`)
 *   prefix  what precedes the marker on the opening line when the fence sits in a container (`- `, `> `, `  `); '' for a
 *           fence at the top level
 *   level   the token's nesting level (0 at the top level)
 * Only CLOSED fences: an unclosed fence runs to the end of its container, and splicing over it would take what follows.
 */
import { boundaryParser, FRONT_MATTER } from '../core/boundary-parser.mjs';

/** The fence names a plugin answers to (its manifest's `fences` and their aliases), from the host's grammar entry. */
function fenceNames(grammar) {
  const out = [];
  for (const [name, spec] of Object.entries(grammar?.fences || {})) {
    out.push(name);
    for (const alias of spec?.aliases || []) out.push(alias);
  }
  return out;
}

/** Does an info string name one of `names`? Its first word, as the engine's fence table reads it (`mermaid{…}` too). */
function infoNames(info, names) {
  const first = String(info).trim().split(/\s/)[0] || '';
  return names.some((n) => first === n || (first.startsWith(n) && !/[\w-]/.test(first[n.length])));
}

/**
 * Every closed fence of `grammar`'s plugin in `source`, in document order.
 * @param {string} source  the deck source, front matter included (offsets index it)
 * @param {{ fences?: Record<string, { aliases?: string[] }> }} grammar  the plugin's host grammar entry
 * @returns {Array<{ start: number, end: number, body: string, marker: string, prefix: string, level: number }>}
 */
export function pluginFences(source, grammar) {
  const src = String(source ?? '');
  const names = fenceNames(grammar);
  if (!names.length || !names.some((n) => src.includes(n))) return [];
  // The engine parses the BODY: the front matter is the deck's settings, never Markdown.
  const fm = FRONT_MATTER.exec(src);
  const bodyAt = fm && fm.index === 0 ? fm[0].length : 0;
  const body = src.slice(bodyAt);
  const lines = body.split('\n');
  const lineStart = new Array(lines.length);
  for (let i = 0, at = bodyAt; i < lines.length; i++) {
    lineStart[i] = at;
    at += lines[i].length + 1;
  }
  const out = [];
  for (const t of boundaryParser.parse(body, {})) {
    if (t.type !== 'fence' || !t.map || !infoNames(t.info, names)) continue;
    const [first, end] = t.map;
    const open = lines[first] ?? '';
    const run = /(`{3,}|~{3,})/.exec(open);
    if (!run) continue;
    // Closed: the token's last line is a closing run of the same character, at least as long, alone after its prefix.
    const last = end - 1;
    const closer = (lines[last] ?? '').replace(/^[\s>]*/, '');
    const closes = last > first && new RegExp(`^${run[1][0] === '`' ? '`' : '~'}{${run[1].length},}[ \\t]*$`).test(closer);
    if (!closes) continue;
    out.push({
      start: lineStart[first],
      end: lineStart[last] + (lines[last] ?? '').length,
      body: t.content,
      marker: run[1],
      prefix: t.level > 0 ? open.slice(0, run.index) : '',
      level: t.level,
    });
  }
  return out;
}
