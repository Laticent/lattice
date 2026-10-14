/**
 * The FENCE half of the code door's shared kernel (plugin-system §9 decisions 3 and 10, phase E).
 *
 * The door in code-door-core.mjs gives a code package a whole SLIDE. A zip plugin's code owns
 * something smaller: one FENCE, written ```` ```name ```` in a deck. A fence renderer is
 * `render({ body, id }) → html`, run in the same sandbox as a slide package and held to the same
 * walls (workerScript, consent pinned to the code's hash, the slide sanitizer on the way back).
 *
 * WHERE A FENCE IS FOUND. The engine needs no hook for it. A fence whose language no plugin
 * installed renders as the code block every fence does, `<pre><code class="language-name">`, so
 * the door reads those blocks out of the engine's finished HTML, the way `claimedSlides` reads
 * slides, and puts the plugin's result where the block was. `scanTags` (the repo's one tokenizer)
 * walks the HTML, so a block quoted inside a comment or `<style>` is not a fence, and the walk is
 * linear in the deck.
 *
 *   claimedFences   the fences a deck holds in the plugins' names, with their text and an id
 *   fenceInput      what a renderer is handed for one fence: `{ body, id }`, nothing else
 *   fenceKey        one fence's identity across the two renders (the plugin's code by its DIGEST,
 *                   never its text: a key per fence that held 300 KB of code was 7.6 GB for 8,000 fences)
 *   fenceMarkup     a plugin's sanitized output in its root element
 *   withFenceNote   the engine's code block, kept, with a visible note saying why the plugin did not draw it
 *
 * Pure string work, no DOM and no Node built-ins, like the rest of the kernel.
 */

import { splitSections } from '../core/split-sections.mjs';
import { scanTags } from '../core/top-level-h2.mjs';
import { deckPluginList } from '../plugins/deck-plugins.mjs';
import { claimedSlides, FENCE_NAME_RE, NOTE_CHARS, pluginInlineKinds, printableLine } from './code-door-core.mjs';

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The root element's attribute: the scope a plugin's CSS is rewritten under (plugin-system §9 decision 12). */
export const PLUGIN_ROOT_ATTR = 'data-lattice-plugin';

/** The longest fence body a renderer is handed. A fence is authored text; a megabyte of it is not. */
export const MAX_FENCE_CHARS = 200_000;

/**
 * The most fences ONE pass of the hook claims. A fence is cheap to write and a renderer is not
 * cheap to run, so a deck of 8,000 of them is a way to spend a user's machine, not a deck. The
 * ones past the cap stay code blocks, the same ones in both renders, and the door says so.
 */
export const MAX_FENCES_PER_PASS = 400;

/**
 * The most sanitized fence output ONE render keeps, in all, applied over the claims in order so every
 * pass of a render (the CLI's `--strip-notes` renders twice) gets the same answer. The CLI door counts
 * the sanitized length against this; the Studio counts the raw length against its own, lower cap
 * (door-run.ts `RENDER_OUTPUT_MAX`), because its sanitizer runs on the page's main thread.
 */
export const FENCE_OUTPUT_MAX = 8_000_000;

/** What the note says when a render's fences together return more than `max` characters. */
export const fenceOutputNote = (max = FENCE_OUTPUT_MAX) => `the render's plugins returned more than ${max.toLocaleString('en-US')} characters in all`;

/**
 * A `rebuilt(classes)` function (see `claimedFences`) from a list of `{ pass, classes }` alternatives:
 * the first pass whose classes the slide holds ALL of. lib/transformers/rebuilt-classes.js derives the
 * list from the registry; the Studio reads the same list from `fence-door.generated.json`.
 * @param {Array<{ pass: string, classes: string[] }>} alternatives
 */
export function rebuiltFromAlternatives(alternatives) {
  return (slideClasses) => {
    const have = new Set(slideClasses);
    return alternatives.find((a) => a.classes.every((c) => have.has(c)))?.pass ?? null;
  };
}

/**
 * ACTIVATION, the rule both doors share (plugin-system §9 decision 11): of the plugins a host holds, the ones the
 * deck's front-matter `plugins:` list names. The rest are only OFFERED: nothing of theirs runs.
 * @param {string} source  the deck's Markdown (a slice carries the deck's front matter)
 * @param {Iterable<string>} names  installed plugin names
 * @returns {Set<string>}
 */
export function activePluginNames(source, names) {
  const listed = new Set(deckPluginList(source));
  return new Set([...names].filter((n) => listed.has(n)));
}

/**
 * WHICH plugins a door runs, and the line for each it does not: the rules both doors share.
 * A fence name two plugins claim runs for neither (whichever came last used to win, silently); a
 * fence name must match the schema's (`FENCE_NAME_RE`), must not be one a shipped plugin owns (the
 * engine draws those first and nothing would say so) and not a highlight language (`isLanguage`, the
 * host's `hljs.getLanguage`; a plugin named `js` would take every JavaScript block); and a name that
 * is a hyphen-prefix of another's overlaps its id and class namespace (`pluginNameConflicts`).
 * @param {Array<{ name: string, fence: string, kinds?: string[] }>} plugins  `fence` empty for a plugin of inline kinds only
 * @param {{ shipped: Iterable<string>, isLanguage?: (name: string) => boolean, shippedKinds?: Iterable<string> }} host  `shippedKinds`: the inline kinds Lattice draws itself
 * @returns {{ run: Array<{ name: string, fence: string, kinds?: string[] }>, notes: string[], fences: Map<string, string>, kinds: Map<string, string> }}  the plugins that run, one warning each for the rest, and what runs by fence and by kind
 */
export function planFencePlugins(plugins, { shipped, isLanguage = () => false, shippedKinds = [] }) {
  const owned = new Set(shipped);
  const hostKinds = new Set(shippedKinds);
  const notes = [];
  const owners = new Map();
  // A plugin may own no fence and only inline kinds (2026-10-14-plugin-inline-door.md): `fence` is then empty.
  const fenceOf = (p) => (p.fence ? String(p.fence) : '');
  for (const p of plugins) if (fenceOf(p)) owners.set(p.fence, [...(owners.get(p.fence) ?? []), p.name]);
  for (const [fence, who] of owners) if (who.length > 1) notes.push(`warning: the plugins ${who.join(' and ')} both declare the fence \`${fence}\`, so neither draws it and its blocks stay code`);
  // The same rule for an inline kind (§6): two plugins that claim one kind draw it for neither, and its spans stay code.
  const kindOwners = new Map();
  for (const p of plugins) for (const k of p.kinds ?? []) kindOwners.set(k, [...(kindOwners.get(k) ?? []), p.name]);
  for (const [kind, who] of kindOwners) if (who.length > 1) notes.push(`warning: the plugins ${who.join(' and ')} both declare the inline kind \`@${kind}{…}\`, so neither draws it and its spans stay code`);
  const refused = new Map();
  for (const p of plugins) {
    const fence = fenceOf(p);
    if (!fence && !(p.kinds ?? []).length) refused.set(p.name, 'it declares no fence and no inline kind');
    else if (fence && !FENCE_NAME_RE.test(fence)) refused.set(p.name, `its fence name ${JSON.stringify(fence.slice(0, 40))} is not lower-case letters, digits and hyphens`);
    else if (fence && owned.has(fence)) refused.set(p.name, `\`${fence}\` is a fence a shipped plugin owns`);
    else if (fence && isLanguage(fence)) refused.set(p.name, `\`${fence}\` is a code language the engine highlights`);
    else {
      const bad = (p.kinds ?? []).find((k) => !FENCE_NAME_RE.test(String(k)) || hostKinds.has(k));
      if (bad !== undefined) refused.set(p.name, FENCE_NAME_RE.test(String(bad)) ? `\`@${bad}{…}\` is an inline kind Lattice already draws` : `its inline kind ${JSON.stringify(String(bad).slice(0, 40))} is not lower-case letters, digits and hyphens`);
    }
  }
  for (const [shorter, longer] of pluginNameConflicts(plugins.map((p) => p.name))) {
    for (const n of [shorter, longer]) refused.set(n, `its name overlaps ${n === shorter ? longer : shorter}'s (ids and classes are kept by name prefix)`);
  }
  for (const [name, why] of refused) notes.push(`warning: the plugin ${name} is not run: ${why}`);
  const run = plugins.filter((p) => !refused.has(p.name) && ((fenceOf(p) && owners.get(p.fence).length === 1) || (p.kinds ?? []).some((k) => kindOwners.get(k).length === 1)));
  // What runs, by what it draws: a fence two plugins share, or a kind two plugins share, is left out of these maps
  // while the plugin's other contributions still run.
  const fences = new Map(run.filter((p) => fenceOf(p) && owners.get(p.fence).length === 1).map((p) => [p.fence, p.name]));
  const kinds = new Map(run.flatMap((p) => (p.kinds ?? []).filter((k) => kindOwners.get(k).length === 1).map((k) => [k, p.name])));
  return { run, notes, fences, kinds };
}

/**
 * One warning per thing the first render's capture left alone: a block too long for its plugin, a slide a
 * shipped pass rebuilds (or a raw nested `<section>`), and fences past the render's allowance. `fences` is
 * the fence name → plugin map the capture ran with.
 * @returns {string[]}
 */
export function fenceCaptureNotes(cap, fences) {
  const notes = [];
  for (const t of cap.tooLong) {
    notes.push(t.inline
      ? `warning: an \`@${t.inline}{…}\` span on slide ${t.slide + 1} is longer than the ${MAX_INLINE_CHARS.toLocaleString('en-US')} characters an inline span may be, and stays code`
      : `warning: a \`${[...fences].find(([, n]) => n === t.pkg)?.[0]}\` block on slide ${t.slide + 1} is too long for the plugin ${t.pkg}, and stays a code block`);
  }
  for (const [slide, pass] of new Map(cap.shadowed.map((x) => [`${x.slide}|${x.pass}`, [x.slide, x.pass]])).values()) {
    notes.push(pass === 'nested-section'
      ? `warning: slide ${slide + 1} holds a raw <section>, which a shipped pass may rebuild from its text and read a plugin's output as an address, so its plugin blocks stay code`
      : `warning: slide ${slide + 1} is rebuilt by the shipped \`${pass}\` pass, which would read a plugin's text as an address, so its plugin blocks stay code`);
  }
  if (cap.tooMany) notes.push(`warning: ${cap.tooMany} plugin block${cap.tooMany > 1 ? 's' : ''} past the ${MAX_FENCES_PER_PASS} a render draws stay code blocks`);
  return notes;
}

/**
 * The text of a code block as the author wrote it. markdown-it's code renderer escapes four
 * characters and nothing else, so those four are what come back; `&amp;` goes last so `&amp;lt;`
 * reads as the author's `&lt;`.
 */
export function decodeFenceBody(text) {
  return String(text).replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

/** `class="a b"` out of one open tag's text, as a list of tokens. markdown-it writes the attribute double-quoted. */
function classTokens(tagText) {
  const m = /\sclass\s*=\s*"([^"]*)"/i.exec(tagText);
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

/**
 * Every `<pre><code class="language-NAME">text</code></pre>` in `html` whose NAME is in `names`,
 * in document order, as `{ name, start, end, body }` (offsets into `html`, `end` one past `</pre>`).
 *
 * A block is a fence only when it is exactly that shape: `<code>` directly inside `<pre>`, plain
 * text inside (a highlighter's `<span>` means some grammar already drew it, so it is left alone),
 * and `</pre>` directly after `</code>`. A `<pre>` the host marked `data-lattice-off` is a fence of
 * a plugin the deck did not load: it stays the code block it is.
 * @param {string} html
 * @param {Iterable<string>} names  the fence names the door runs (a plugin's fence, which need not be its name)
 */
export function fenceBlocks(html, names) {
  const want = new Set(names);
  if (!want.size) return [];
  const out = [];
  // 0 outside; 1 after a `<pre>`; 2 after its `<code>`; 3 after the `</code>`.
  let state = 0;
  let pre = null;
  let code = null;
  for (const t of scanTags(html)) {
    if (t.kind !== 'tag') {
      // A comment or RAWTEXT span inside the block means it is not the plain shape.
      state = 0;
      continue;
    }
    if (state === 0 || (t.name === 'pre' && !t.isClose)) {
      if (t.name === 'pre' && !t.isClose && !t.selfClose) {
        const text = html.slice(t.start, t.end);
        state = /\sdata-lattice-off\b/i.test(text) ? 0 : 1;
        pre = t;
      } else state = 0;
      continue;
    }
    if (state === 1) {
      if (t.name === 'code' && !t.isClose && t.start === pre.end) {
        const hit = classTokens(html.slice(t.start, t.end)).map((c) => (c.startsWith('language-') ? c.slice(9) : null)).find((n) => n && want.has(n));
        if (hit) {
          code = { tag: t, name: hit };
          state = 2;
          continue;
        }
      }
      state = 0;
    } else if (state === 2) {
      // The very next tag must close the code, so no tag sits in the text.
      if (t.name === 'code' && t.isClose) {
        code.closeStart = t.start;
        code.closeEnd = t.end;
        state = 3;
      } else state = 0;
    } else if (state === 3) {
      if (t.name === 'pre' && t.isClose && t.start === code.closeEnd) {
        out.push({ name: code.name, start: pre.start, end: t.end, body: decodeFenceBody(html.slice(code.tag.end, code.closeStart)) });
      }
      state = 0;
    }
  }
  return out;
}

/** The longest `@kind{…}` span the door hands a plugin: an inline span is a word or a phrase, not a document. */
export const MAX_INLINE_CHARS = 2_000;

/** A named span (2026-10-14-plugin-inline-door.md §4.1): `@`, a kind, and a record that closes the span. */
const NAMED_SPAN_RE = /^@([a-z][a-z0-9-]*)\{[\s\S]*\}$/;

/**
 * Every inline `<code>…</code>` in `html` whose text is `@kind{…}` for a kind in `kinds`, in document order, as
 * `{ kind, start, end, text, escaped? }` (offsets into `html`, `end` one past `</code>`; `text` entity-decoded), for
 * the inline door (2026-10-14-plugin-inline-door.md §4.4). `escaped`: the author wrote `\@kind{…}`, and `text` is
 * what they want shown, the backslash off.
 *
 * Only that exact shape: a `<code>` outside any `<pre>` (a fence's body is not a span), plain text inside (a tag
 * there means something already drew it), and no `data-lat-escaped` (the author's `\@kind{…}`, kept literal) or
 * `data-lattice-off` (a span of a plugin the engine left off) on the open tag. The record must close the span, so
 * `@kind{a} b` is prose about a kind, not a call.
 * @param {string} html
 * @param {Iterable<string>} kinds
 */
export function inlineSpans(html, kinds) {
  const want = new Set(kinds);
  if (!want.size) return [];
  const out = [];
  let pre = 0;
  let open = null;
  for (const t of scanTags(html)) {
    if (t.kind !== 'tag') {
      open = null;
      continue;
    }
    if (t.name === 'pre') {
      pre = Math.max(0, pre + (t.isClose ? -1 : t.selfClose ? 0 : 1));
      open = null;
      continue;
    }
    if (pre) continue;
    if (t.name === 'code' && !t.isClose && !t.selfClose) {
      const tagText = html.slice(t.start, t.end);
      open = /\sdata-lat-escaped\b|\sdata-lattice-off\b/i.test(tagText) ? null : t;
      continue;
    }
    if (open && t.name === 'code' && t.isClose) {
      const text = decodeFenceBody(html.slice(open.end, t.start));
      // `\@kind{…}` is the author's literal: the engine strips an escape's backslash only before a span IT draws, and
      // a zip plugin's kind it does not know, so the door finishes the escape for its own kinds (`escaped`).
      const escaped = text.charCodeAt(0) === 0x5c;
      const m = NAMED_SPAN_RE.exec(escaped ? text.slice(1) : text);
      if (m && want.has(m[1])) out.push({ kind: m[1], start: open.start, end: t.end, text: escaped ? text.slice(1) : text, ...(escaped ? { escaped: true } : {}) });
    }
    open = null;
  }
  return out;
}

/** FNV-1a over UTF-16 code units, 8 hex characters: a short, stable name for a fence's text, not a security boundary. */
function shortHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * The namespace a plugin's ids and classes live in: `lp-<name>`. The sanitizer keeps an id or class
 * only in the package's own namespace (door-attr.mjs `doorFilterAttr`), and a bare `<name>` let a
 * plugin called `cell` keep the engine's `cell-stage`, and plugin `a` keep an id that belongs to
 * plugin `a-b`. The `lp-` prefix is one the engine never writes, and the door refuses a plugin whose
 * name is a hyphen-prefix of another's (`pluginNameConflicts`), which closes the second.
 */
export const fenceNamespace = (name) => `lp-${name}`;

/** Plugin names where one is a hyphen-prefix of another (`a`, `a-b`): their namespaces overlap. @returns {Array<[string, string]>} [shorter, longer] */
export function pluginNameConflicts(names) {
  const out = [];
  for (const a of names) for (const b of names) if (a !== b && b.startsWith(`${a}-`)) out.push([a, b]);
  return out;
}

/**
 * An id the renderer may put on an element: the plugin's namespace, the render prefix, a short hash of
 * the fence's text and how many fences with that same text came before it in this render. Only
 * `[A-Za-z0-9_-]`. An id is a target that `url(#id)` and `href="#id"` anywhere in the deck resolve to,
 * so a plugin's ids are its own.
 *
 * It names the fence's CONTENT, not its place: an id built from the slide number changed for every
 * fence after an inserted slide, which re-ran each one (the Studio remembers a result by its key,
 * and the key holds the id). `seen` is the render's one counter, shared by the deck and every pane,
 * so two identical fences in two panes of one slide still get two ids.
 * @param {Map<string, number>} seen
 */
export function fenceId(pkg, idPrefix, body, seen) {
  const base = `${fenceNamespace(pkg)}-${String(idPrefix ?? '').replace(/[^A-Za-z0-9_-]/g, '_')}${shortHash(body)}`;
  const k = seen.get(base) ?? 0;
  seen.set(base, k + 1);
  return `${base}-${k}`;
}

/**
 * The fences the plugins in `fences` own in the engine's finished deck render.
 *
 * `fences` maps each fence name the door runs to the plugin that owns it. `skip` is a set of
 * `splitSections` part indices to leave alone: the slides a code package claims whole, which the
 * package redraws, so a fence inside one is not run. `rebuilt(classes)` names the shipped pass that
 * rebuilds a slide with those classes from its text, if any (lib/transformers/rebuilt-classes.js:
 * video, contact, wifi, qr…): a plugin's text on such a slide would be read as an address, by the
 * engine's pass and again by the runtime's DOM pass, so its fences are not claimed and come back in
 * `shadowed`. A fence longer than MAX_FENCE_CHARS is reported in `tooLong`; fences past `budget`
 * (MAX_FENCES_PER_PASS, spent down across every call of ONE render: a pane is its own call, so a
 * per-call count let a deck of pane slides claim thousands) are counted in `tooMany`. `seen` is the
 * render's id counter (`fenceId`).
 * @param {string} html
 * @param {{ fences: Map<string, string>, slideIndex: (n: number) => number, idPrefix?: string, skip?: Set<number>, seen?: Map<string, number>, rebuilt?: (classes: string[]) => string | null, budget?: { left: number } }} opts
 *   `slideIndex` maps a section's position in this html to its deck position (the registry hook's own)
 * @returns {{ claims: Array<{ i: number, pkg: string, fence: string, slide: number, id: string, body: string, start: number, end: number, block: string }>, tooLong: Array<{ pkg: string, slide: number }>, tooMany: number, shadowed: Array<{ slide: number, pass: string, pkg: string }> }}
 *   offsets are into the section part's text (`openTag + inner + close`), `i` its `splitSections` index
 */
export function claimedFences(html, { fences, kinds = new Map(), slideIndex, idPrefix = '', skip = new Set(), seen = new Map(), rebuilt = () => null, budget = { left: MAX_FENCES_PER_PASS } }) {
  const claims = [];
  const tooLong = [];
  const shadowed = [];
  let tooMany = 0;
  let position = 0;
  splitSections(html).forEach((part, i) => {
    if (part.type !== 'section') return;
    const slide = slideIndex(position++);
    if (skip.has(i)) return;
    const text = part.openTag + part.inner + part.close;
    // Fences and inline spans (`@kind{…}`, whose `inline` names the kind), in document order: one budget, one id
    // counter and the same shadowing for both, because both run the same plugin code on the same slide.
    const blocks = [...fenceBlocks(text, fences.keys()), ...inlineSpans(text, kinds.keys()).map((x) => ({ name: x.kind, inline: x.kind, start: x.start, end: x.end, body: x.text, escaped: !!x.escaped }))]
      .sort((a, b) => a.start - b.start);
    if (!blocks.length) return;
    const owner = (b) => (b.inline ? kinds.get(b.inline) : fences.get(b.name));
    // The slide's own classes, and FAIL CLOSED on any raw `<section` an author nested in it: the video pass
    // scans every `<li` in a `section.video`, nested or not, and a regex over the tag misses `class=video`
    // (unquoted), a `>` inside an attribute value, `data-class="x" class="video"` and an entity-encoded name
    // (the checker, 2026-10-12). The text holds the section's own open tag first; inner is what an author wrote.
    let pass = rebuilt(String(part.cls || '').split(/\s+/).filter(Boolean));
    if (!pass && /<section\b/i.test(part.inner)) pass = 'nested-section';
    if (pass) {
      for (const b of blocks) shadowed.push({ slide, pass, pkg: owner(b) });
      return;
    }
    for (const b of blocks) {
      const pkg = owner(b);
      // An escape runs nothing and spends nothing: it is the literal, finished (`escapedSpan`).
      if (b.escaped) {
        claims.push({ i, pkg, fence: null, inline: b.inline, escaped: true, slide, id: '', body: b.body, start: b.start, end: b.end, block: text.slice(b.start, b.end) });
        continue;
      }
      if (b.body.length > (b.inline ? MAX_INLINE_CHARS : MAX_FENCE_CHARS)) tooLong.push({ pkg, slide, ...(b.inline ? { inline: b.inline } : {}) });
      else if (budget.left <= 0) tooMany++;
      else {
        budget.left--;
        const claim = { i, pkg, fence: b.inline ? null : b.name, slide, id: fenceId(pkg, idPrefix, b.body, seen), body: b.body, start: b.start, end: b.end, block: text.slice(b.start, b.end) };
        claims.push(b.inline ? { ...claim, inline: b.inline } : claim);
      }
    }
  });
  return { claims, tooLong, tooMany, shadowed };
}

/** What a renderer is handed for one fence. Two strings: the author's text and an id, and nothing else. */
export function fenceInput(claim) {
  return { body: claim.body, id: claim.id };
}

/**
 * What a renderer is handed for one inline span (2026-10-14-plugin-inline-door.md §4.4): the kind, the span as the
 * author wrote it, the record read by the kind's declared slot (or null when it declares none, or the record does
 * not read), and an id. `kind` is what tells it from a fence, which never has one.
 * @param {{ inline: string, body: string, id: string }} claim
 * @param {Record<string, unknown> | null} [fields]
 */
export function inlineInput(claim, fields = null) {
  return { kind: claim.inline, text: claim.body, fields: fields ?? null, id: claim.id };
}

/** One fence's or span's identity across the two renders and across renders: the plugin, what it was (a fence, or
 *  which kind), its code's digest, and what it was handed. A span and a fence with the same text never share one. */
export const fenceKey = (c, sha256) => `${c.pkg}\u0000${c.inline ? `inline:${c.inline}` : 'fence'}\u0000${c.id}\u0000${sha256}\u0000${c.body}`;

/**
 * A plugin's sanitized output in its root element. The root is ours, never the plugin's: it names
 * the plugin, which is what a plugin's scoped CSS keys on and what a reader of the HTML finds
 * when asking where a figure came from.
 */
export function fenceMarkup(pkg, html) {
  return `<div ${PLUGIN_ROOT_ATTR}="${escapeHtml(pkg)}">${html}</div>`;
}

/** An escaped span (`\@kind{…}`) finished: the literal without its backslash, marked as the engine marks its own escapes
 *  (inline-code-directives.js `ESCAPED_ATTR`), so no later pass draws it. */
export function escapedSpan(text) {
  return `<code data-lat-escaped="">${escapeHtml(text)}</code>`;
}

/** An inline kind's sanitized output in its root, a `<span>`: it stands where a word stood, and names the plugin and the kind. */
export function inlineMarkup(pkg, kind, html) {
  return `<span ${PLUGIN_ROOT_ATTR}="${escapeHtml(pkg)}" data-kind="${escapeHtml(kind)}">${html}</span>`;
}

/**
 * What stands where an inline span is when its plugin is not listed (2026-10-14-plugin-inline-door.md §4.4): the
 * fence placeholder's chip, as a `<span>` so it sits in the line. The plugin's mark and its name as the accessible
 * name, sized by the kind's `placeholder.size` (default `sm`, one line of text), and none of the author's text.
 * @param {string} pkg
 * @param {string} kind
 * @param {unknown} [hint]  the kind's `placeholder`: only its `size` is read
 */
export function inlinePlaceholder(pkg, kind, hint = null) {
  const name = escapeHtml(printableLine(pkg));
  const raw = hint && typeof hint === 'object' ? /** @type {Record<string, unknown>} */ (hint).size : undefined;
  const size = typeof raw === 'string' && ['sm', 'md', 'lg', 'xl'].includes(raw) ? raw : 'sm';
  const label = `${name}: @${escapeHtml(kind)} is not listed in this deck's plugins:`;
  return `<span data-lattice-plugin-off="${name}" data-placement="chip" data-inline data-size="${size}" role="note" title="${label}" aria-label="${label}"><span class="lattice-plugin-mark" aria-hidden="true"></span></span>`;
}

/**
 * A placeholder hint (plugin.schema.json `placeholder`) reduced to what the stylesheet may be handed: a known
 * `placement`, a `W/H` `aspect` for a figure, a known `size` for a chip; anything else is dropped. Applied at import and again where the
 * markup is made (`fencePlaceholder`), so a stored or declared value can never put anything but these in an attribute or a style.
 * @param {unknown} raw
 * @returns {{ placement: 'stage' | 'figure' | 'chip', aspect?: string, size?: string }}
 */
export function placeholderHint(raw) {
  const r = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const placement = r.placement === 'stage' || r.placement === 'chip' ? r.placement : 'figure';
  const aspect = typeof r.aspect === 'string' && ASPECT_RE.test(r.aspect) ? r.aspect : undefined;
  const size = typeof r.size === 'string' && ['sm', 'md', 'lg', 'xl'].includes(r.size) ? r.size : undefined;
  return { placement, ...(placement === 'figure' && aspect ? { aspect } : {}), ...(placement === 'chip' ? { size: size ?? 'md' } : {}) };
}

/**
 * What stands where a plugin's fence is when the deck did not list the plugin (plugin-system §9 decision 11): a drawn
 * placeholder in the house Nacre atmosphere, with the plugin's name. Our markup, never the plugin's, and no color of its
 * own: every paint is a deck token (lib/base/base.modifiers.css `div[data-lattice-plugin-off]`), the mark is drawn from
 * `--shape-spark` (HARD RULES #3 and #29), and it carries none of the author's text. Its size is geometry the engine
 * already has, chosen by `data-placement`: `stage` fills the stage, `figure` takes the content width at `--lp-w` /
 * `--lp-h` (the plugin's remembered or declared proportions), `chip` is a square in the avatar size scale.
 * @param {string} pkg
 * @param {unknown} [hint]  a placeholder hint, with `aspect` possibly replaced by the plugin's remembered one
 */
export function fencePlaceholder(pkg, hint = null) {
  const name = escapeHtml(printableLine(pkg));
  const h = placeholderHint(hint);
  const style = h.aspect ? ` style="--lp-w:${h.aspect.split('/')[0]};--lp-h:${h.aspect.split('/')[1]}"` : '';
  const size = h.size ? ` data-size="${h.size}"` : '';
  const words = h.placement === 'chip' ? '' : `<span class="lattice-plugin-words"><strong>${name}</strong><span>Plugin block · not listed in this deck's plugins:</span></span>`;
  const label = h.placement === 'chip' ? ` title="${name}: not listed in this deck's plugins:" aria-label="${name}: not listed in this deck's plugins:"` : '';
  return `<div data-lattice-plugin-off="${name}" data-placement="${h.placement}"${size}${style} role="note"${label}><span class="lattice-plugin-mark" aria-hidden="true"></span>${words}</div>`;
}

/**
 * A zip plugin's inline kinds as both doors keep them (2026-10-14-plugin-inline-door.md §4.3): each kind's name, its
 * `slot` (a Segno slot spec, compiled where a span is read), its placeholder reduced to a known `size`, and a short
 * title. Anything else a manifest declares on a kind is the gate's to refuse (`refusePluginCode`), not kept here.
 * @returns {Array<{ name: string, slot?: object, placeholder?: { size: string }, title?: string }>}
 */
export function inlineKindsOf(manifest) {
  const inline = manifest?.contributes?.inline ?? {};
  return pluginInlineKinds(manifest).map((name) => {
    const d = inline[name] && typeof inline[name] === 'object' ? inline[name] : {};
    const size = typeof d.placeholder?.size === 'string' && ['sm', 'md', 'lg', 'xl'].includes(d.placeholder.size) ? d.placeholder.size : null;
    return {
      name,
      ...(d.slot && typeof d.slot === 'object' && !Array.isArray(d.slot) ? { slot: d.slot } : {}),
      ...(size ? { placeholder: { size } } : {}),
      ...(typeof d.title === 'string' && d.title.trim() ? { title: printableLine(d.title).slice(0, 80) } : {}),
    };
  });
}

/** What a declared or remembered aspect must look like: `W/H`, whole numbers up to 999 (plugin.schema.json `placeholder.aspect`). */
export const ASPECT_RE = /^[1-9][0-9]{0,2}\/[1-9][0-9]{0,2}$/;

/**
 * The proportions of a drawn block, from its sanitized output: the first `<svg>`'s `viewBox` (or `width` and `height`),
 * as `W/H` reduced to whole numbers within the schema's range, or null when the output has none (plain markup has no
 * intrinsic proportions). The host remembers it so a later placeholder is the size the real block was.
 * @param {string} html
 * @returns {string | null}
 */
export function aspectOfOutput(html) {
  const tag = /<svg\b[^>]*>/i.exec(String(html))?.[0];
  if (!tag) return null;
  const attr = (n) => new RegExp(`\\s${n}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1];
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const [w, h] = vb && vb.length === 4 ? [vb[2], vb[3]] : [parseFloat(attr('width') ?? ''), parseFloat(attr('height') ?? '')];
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  const k = Math.min(1, 999 / Math.max(w, h));
  const a = Math.max(1, Math.round(w * k));
  const b = Math.max(1, Math.round(h * k));
  // Reduced, so `520/66` and `260/33` are one value.
  const g = (x, y) => (y ? g(y, x % y) : x);
  const d = g(a, b);
  return `${a / d}/${b / d}`;
}

/** The engine's code block, kept, with a visible note saying why the plugin did not draw it. */
export function withFenceNote(block, pkg, why) {
  const name = escapeHtml(printableLine(pkg));
  const note = `<p data-package-error="${name}" role="note">The plugin “${name}” did not draw this block: ${escapeHtml(printableLine(String(why).slice(0, NOTE_CHARS)))}</p>`;
  return `${block}${note}`;
}

/**
 * `html` with the fence at each `claims[k]` replaced by `replacements[k]`, in one left-to-right pass
 * per section (a splice that re-sliced the section once per fence took 50 s for 20,000 fences).
 * The claims are the part-relative ones `claimedFences` returned, applied to the section they came from.
 * @param {string} html  the deck the claims were read from
 * @param {Array<{ i: number, start: number, end: number }>} claims
 * @param {string[]} replacements  same length and order as `claims`
 */
export function replaceFences(html, claims, replacements) {
  const byPart = new Map();
  claims.forEach((c, k) => {
    if (!byPart.has(c.i)) byPart.set(c.i, []);
    byPart.get(c.i).push({ start: c.start, end: c.end, text: replacements[k] });
  });
  if (!byPart.size) return html;
  return splitSections(html)
    .map((p, i) => {
      if (p.type !== 'section') return p.text;
      const text = p.openTag + p.inner + p.close;
      const mine = byPart.get(i);
      if (!mine) return text;
      const out = [];
      let last = 0;
      for (const c of mine.sort((a, b) => a.start - b.start)) {
        out.push(text.slice(last, c.start), c.text);
        last = c.end;
      }
      out.push(text.slice(last));
      return out.join('');
    })
    .join('');
}

/** The section parts a code package claims whole: a fence inside one is the package's to draw, not ours. */
const claimedParts = (html, names, engineClaims) => new Set(claimedSlides(html, { packages: names, engineClaims }).map((c) => c.i));

/**
 * The plugin-fence door the engine takes as `opts.codeFences` (lib/engine/index.js): `names` are
 * the fence names it leaves plain, `run` is the hook its LAST registry slot calls
 * (lib/transformers/code-fences.js). This one records every fence a plugin owns, with the slide
 * position and id prefix the render gives it, and changes nothing.
 * @param {Map<string, string>} fences  fence name → owning plugin
 * @param {{ names: string[], engineClaims: Iterable<string>, rebuilt?: (classes: string[]) => string | null, kinds?: Map<string, string> }} slides  the slide packages' names, the engine's claims, which shipped pass rebuilds a slide, and the inline kinds the door runs (kind → owning plugin)
 */
export function captureFences(fences, { names, engineClaims, rebuilt, kinds = new Map() }) {
  const claims = [];
  const tooLong = [];
  const shadowed = [];
  const seen = new Map();
  const budget = { left: MAX_FENCES_PER_PASS };
  // `escapes`: how many `\@kind{…}` spans the second render finishes (a deck whose only spans are escapes still needs it).
  const out = { names: new Set(fences.keys()), claims, tooLong, shadowed, tooMany: 0, escapes: 0, run: null };
  out.run = (html, { slideIndex, idPrefix }) => {
    if (!fences.size && !kinds.size) return html;
    const r = claimedFences(html, { fences, kinds, slideIndex, idPrefix, skip: claimedParts(html, names, engineClaims), seen, rebuilt, budget });
    // An escape is finished at substitution, never run: the doors' loops see only what draws.
    claims.push(...r.claims.filter((c) => !c.escaped));
    out.escapes += r.claims.length - r.claims.filter((c) => !c.escaped).length;
    tooLong.push(...r.tooLong);
    shadowed.push(...r.shadowed);
    out.tooMany += r.tooMany;
    return html;
  };
  return out;
}

/**
 * The same door for the second render, putting each fence's result in. `results` maps
 * `fenceKey(claim, sha256)` to the sanitized markup the plugin returned (`fenceMarkup`), or to the
 * note that stands in for it. A fence the first render did not hand over (the render is
 * deterministic, so that is a defect, not a race) keeps its code block with a note, never a
 * stranger's output out of place.
 * @param {Map<string, string>} fences  fence name → owning plugin
 * @param {Map<string, string>} results
 * @param {Map<string, string>} digestOf  plugin name → the SHA-256 of its code, the one the first render keyed on
 */
export function substituteFences(fences, results, digestOf, { names, engineClaims, rebuilt, kinds = new Map() }) {
  const seen = new Map();
  const budget = { left: MAX_FENCES_PER_PASS };
  return {
    names: new Set(fences.keys()),
    run: (html, { slideIndex, idPrefix }) => {
      if (!fences.size && !kinds.size) return html;
      const { claims } = claimedFences(html, { fences, kinds, slideIndex, idPrefix, skip: claimedParts(html, names, engineClaims), seen, rebuilt, budget });
      if (!claims.length) return html;
      // A span that changed between the renders keeps its code; a note in a line of text would be a block in a sentence.
      return replaceFences(html, claims, claims.map((c) => (c.escaped ? escapedSpan(c.body) : (results.get(fenceKey(c, digestOf.get(c.pkg))) ?? (c.inline ? c.block : withFenceNote(c.block, c.pkg, 'the block changed between the two renders'))))));
    },
  };
}
