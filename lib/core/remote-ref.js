/**
 * Does a piece of MARKUP from someone else reach the network when it renders?
 *
 * ONE predicate for the two places a stranger's package carries markup rather than CSS
 * (engineering/decisions/2026-09-23-portable-packages.md §10, the P1 follow-up):
 *   - a component's sample slide (`gallery.md`), which becomes the user's own deck content
 *     on Insert. The import gates RENDER it through the engine, parse the result with a real
 *     HTML parser, and hand every element to `remoteRefsInElements`: the CLI in
 *     `lib/packages/gallery-gate.js` (parse5), the Studio in
 *     `docs/src/components/studio/library/gallery-gate.ts` (DOMParser).
 *   - motion art (`art` / `poster` SVG), which the Library draws with
 *     `dangerouslySetInnerHTML` on the Studio origin. `scene-library.ts` `stripRemoteRefs`
 *     drops each attribute `attrIsRemote` flags.
 * A remote reference is a beacon: the request tells a stranger's server who opened the file
 * and when (HARD RULE #22).
 *
 * WHY THE GALLERY IS RENDERED FIRST. The first cut scanned the markdown source with regexes,
 * and an adversarial pass found eleven spellings it missed: a fence closed by a longer fence,
 * an escaped backtick, a reference definition inside a blockquote, `&bsol;`, a `logo:` front
 * matter key, a `video` component's `poster` bullet… Each was a place where a regex disagreed
 * with markdown-it, the HTML5 parser or a component transform about what the text MEANS. The
 * engine's output, parsed by a spec parser, is what the browser will actually load, so the
 * scan reads that and nothing else.
 *
 * WHAT "REMOTE" MEANS HERE, and why it is looser than `css-scan.js` `urlIsLocal`. That one
 * holds a component's STYLESHEET to `#fragment` and `data:` only, because a stylesheet has no
 * use for any other target. Markup does: a relative `logo.png` resolves against the page that
 * shows it (the Studio's own origin, or the deck's folder in the CLI) and so reaches nobody a
 * stranger controls. So a target is remote when it names a SCHEME other than `data:`, or is
 * protocol-relative (`//host`, and the `\\host` spellings a URL parser folds into it).
 *
 * A CommonJS leaf whose one dependency is the equally dependency-free `media-sources.js`: the docs
 * site default-imports it onto the Studio's eager path (docs/src/plugins/vite-cjs-lib-dev.mjs, which
 * inlines that one sibling in dev), where every byte counts against the budget.
 */

// The URL grammar and the remote predicate live in ONE table, media-sources.js: `isRemoteUrl` is
// derived from each source row's `locality`, so what the render resolves and what the gates refuse
// cannot disagree (2026-10-16-media-plugins.md §3 D2, §4.1). Re-exported here under the names the
// gates already import.
const mediaSources = require('./media-sources');
const { urlAsParsed, sampleName, assetName } = mediaSources;
/**
 * Is this URL a network fetch to somewhere other than the page's own origin?
 * @param {string|null|undefined} raw  an attribute value or url() target, entities decoded
 */
const isRemoteUrl = mediaSources.isRemoteRef;

// CSS reads a carriage return, a form feed and CRLF as a newline (CSS Syntax 3 §3.3, input
// preprocessing). A scanner that ends a string only at `\n` reads `"x<FF>}p{background:url(…)}"`
// as one harmless string, where the browser ends the string at the form feed and fetches the url.
const isCssNewline = (c) => c === '\n' || c === '\r' || c === '\f';
const isCssSpace = (c) => c === ' ' || c === '\t' || isCssNewline(c);
/** The length of the newline at `s[i]`: CRLF is one newline of two characters. */
const newlineLength = (s, i) => (s[i] === '\r' && s[i + 1] === '\n' ? 2 : 1);

/** One CSS escape at `s[i]` (a backslash): `[decoded, nextIndex]`. `\75 ` is `u`, `\:` is `:`. */
function cssEscape(s, i) {
  const hex = /^[0-9a-fA-F]{1,6}/.exec(s.slice(i + 1, i + 7));
  if (hex) {
    let next = i + 1 + hex[0].length;
    // One whitespace after the digits belongs to the escape, and CRLF counts as one.
    if (isCssSpace(s[next] ?? '')) next += isCssNewline(s[next]) ? newlineLength(s, next) : 1;
    const cp = Number.parseInt(hex[0], 16);
    return [cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff ? '�' : String.fromCodePoint(cp), next];
  }
  if (i + 1 >= s.length) return ['�', i + 1];
  return [s[i + 1], i + 2];
}

/**
 * The CSS string token whose quote is at `s[at]`: `[value, nextIndex]`, escapes decoded. A
 * newline (any of the three, above) ends a BAD string and is read again, as whitespace: the
 * browser goes on tokenizing what follows it, so a scanner must too. A backslash before a
 * newline continues the line.
 * @param {string} s
 * @param {number} at
 * @returns {[string, number]}
 */
function cssString(s, at) {
  const q = s[at];
  let v = '';
  let j = at + 1;
  while (j < s.length && s[j] !== q && !isCssNewline(s[j])) {
    if (s[j] !== '\\') v += s[j++];
    else if (j + 1 < s.length && isCssNewline(s[j + 1])) j += 1 + newlineLength(s, j + 1);
    else {
      const [d, n] = cssEscape(s, j);
      v += d;
      j = n;
    }
  }
  return [v, s[j] === q ? j + 1 : j];
}

const CSS_IDENT_START = /[A-Za-z_\\-]/;
const CSS_IDENT = /[A-Za-z0-9_\\-]/;
const CSS_CLOSER = { '(': ')', '[': ']', '{': '}' };

/**
 * Every place a piece of CSS names a target, as spans of the source: each string token, and
 * each `url(…)`, unquoted or holding one string (then the span is the whole function). Read
 * with a tokenizer that follows CSS Syntax 3 where a fetch depends on it: newlines (above),
 * escapes (`u\72l(` is `url(`), comments, strings, and the stack of `(` `[` `{` blocks, so a
 * `}` inside a string or a `(` block does not end a rule.
 *   `value`     the target, escapes decoded (a `url(…)` target trimmed)
 *   `fontFace`  inside an `@font-face` block (a font source, not a picture)
 *   `selector`  inside a `[…]` block: an attribute selector, which never fetches
 * @param {string} css
 * @returns {Array<{ from: number, to: number, value: string, fontFace: boolean, selector: boolean }>}
 */
function cssRefSpans(css) {
  const s = String(css ?? '');
  const out = [];
  // The open blocks, innermost last; a `{` an `@font-face` prelude opens is pushed as 'face'.
  const stack = [];
  let pendingFace = false;
  const push = (from, to, value) =>
    out.push({ from, to, value, fontFace: stack.includes('face'), selector: stack.includes('[') });
  const readString = (at) => cssString(s, at);
  const readName = (at) => {
    let name = '';
    let j = at;
    while (j < s.length && CSS_IDENT.test(s[j])) {
      if (s[j] === '\\') {
        const [d, n] = cssEscape(s, j);
        name += d;
        j = n;
      } else name += s[j++];
    }
    return [name, j];
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? s.length : end + 2;
    } else if (c === '"' || c === "'") {
      const [v, j] = readString(i);
      push(i, j, v);
      i = j;
    } else if (c === '@') {
      const [name, j] = readName(i + 1);
      if (name.toLowerCase() === 'font-face') pendingFace = true;
      i = Math.max(j, i + 1);
    } else if (CSS_IDENT_START.test(c)) {
      const from = i;
      const [name, j] = readName(i);
      i = j;
      if (s[i] !== '(') continue;
      if (name.toLowerCase() !== 'url') {
        stack.push('(');
        i++;
        continue;
      }
      let k = i + 1;
      while (k < s.length && isCssSpace(s[k])) k++;
      if (s[k] === '"' || s[k] === "'") {
        // `url("…")`: one span for the whole function when it closes right after the string,
        // so the rewrite swaps `url("…")` for the hatch; otherwise the string alone, and the
        // `(` stays open as the browser keeps it.
        const [v, end] = readString(k);
        let e = end;
        while (e < s.length && isCssSpace(s[e])) e++;
        if (s[e] === ')') {
          push(from, e + 1, v);
          i = e + 1;
        } else {
          stack.push('(');
          push(k, end, v);
          i = end;
        }
        continue;
      }
      // An unquoted url token: everything to the `)`, escapes decoded.
      let v = '';
      i++;
      while (i < s.length && s[i] !== ')') {
        if (s[i] === '\\') {
          const [d, n] = cssEscape(s, i);
          v += d;
          i = n;
        } else v += s[i++];
      }
      i = Math.min(i + 1, s.length);
      push(from, i, v.trim());
    } else if (c === '(' || c === '[' || c === '{') {
      stack.push(c === '{' && pendingFace ? 'face' : c);
      if (c === '{') pendingFace = false;
      i++;
    } else if (c === ')' || c === ']' || c === '}') {
      // A closer ends the innermost block only when it matches it; any other is a token inside.
      const top = stack[stack.length - 1];
      if (top && CSS_CLOSER[top === 'face' ? '{' : top] === c) stack.pop();
      if (c === '}') pendingFace = false;
      i++;
    } else {
      if (c === ';') pendingFace = false;
      i++;
    }
  }
  return out;
}

/**
 * The remote targets in a piece of CSS: every string token (which covers `url("…")`,
 * `image-set("…")`, `src("…")` and `@import "…"`) and every unquoted `url(…)`, read with
 * `cssRefSpans`' tokenizer rather than regexes so that a comment inside a string, a `)`
 * inside a string, an escaped `u\72l(` and a string a form feed ends all mean what they mean
 * to the browser. A remote string that is not a fetch (`content: "https://…"`) is reported
 * too: the safe direction, and rare.
 * @param {string} css  an inline `style`, a presentation attribute, or a `<style>` body
 * @returns {string[]}
 */
function remoteCssRefs(css) {
  return cssRefSpans(css).map((sp) => sp.value).filter(isRemoteUrl);
}

/**
 * Attributes whose value the browser FETCHES. An `<a href>` is a link, not a fetch, so
 * `attrIsRemote` skips `href` on `a` and `area`; on every other element (`<image>`,
 * `<use>`, `<feImage>`, `<link>`) it loads. `ping` stays: it posts on every click.
 */
const FETCH_ATTRS = new Set([
  'src', 'srcset', 'imagesrcset', 'href', 'xlink:href', 'poster', 'background', 'data', 'action',
  'formaction', 'ping', 'lowsrc', 'dynsrc', 'longdesc', 'codebase', 'archive', 'manifest', 'icon', 'profile',
]);

const NESTED_DOC = new Set(['iframe', 'frame', 'object', 'embed']);
const NESTED_ELEMENTS = new Set(['iframe', 'frame', 'frameset', 'object', 'embed', 'portal', 'fencedframe', 'applet']);

/**
 * Does this ONE attribute reach the network? Names lowercased, `value` entity-decoded (a
 * parsed DOM hands it over that way).
 * @param {string} tag   the element's local name
 * @param {string} name
 * @param {string} value
 */
function attrIsRemote(tag, name, value) {
  const isLink = (tag === 'a' || tag === 'area') && (name === 'href' || name === 'xlink:href');
  // A nested DOCUMENT loads whatever it holds, and nothing here parses it: any `srcdoc`, and a
  // `data:` document in a frame, object or embed, count as a fetch. A `data:` image does not.
  if (name === 'srcdoc' && value.trim()) return true;
  if (NESTED_DOC.has(tag) && (name === 'src' || name === 'data')) {
    // Read as the URL parser will: `da<TAB>ta:` and a leading control are still `data:`.
    const u = urlAsParsed(value);
    if (u.startsWith('data:') && !/^data:image\/(?:png|jpe?g|gif|webp|avif)[;,]/.test(u)) return true;
  }
  if (FETCH_ATTRS.has(name) && !isLink) {
    // `srcset` and `imagesrcset` hold comma-separated `url descriptor` candidates.
    const targets = name.endsWith('srcset') ? value.split(',').map((c) => c.trim().split(/\s+/)[0]) : [value];
    if (targets.some(isRemoteUrl)) return true;
  }
  // `style`, and a presentation attribute that takes a url(): fill, filter, mask, cursor…
  return value.includes('(') && remoteCssRefs(value).length > 0;
}

// Mermaid decodes its OWN entity codes (`#58;` is `:`, `#colon;` too) into a label after
// the page has the fence, and an HTML label decodes `&#58;` once more, so the scan reads the
// text the way the diagram will: numeric and named codes in both spellings, twice over for a
// double encoding. The named table holds the characters a URL is built from; a letter can be
// typed as itself, so an attacker gains nothing from any other name.
const MERMAID_NAMED = { colon: ':', sol: '/', bsol: '\\', period: '.', tab: '', newline: '', lpar: '(', rpar: ')', quot: '"', apos: "'", amp: '&' };
function mermaidDecoded(text) {
  let t = String(text || '');
  for (let pass = 0; pass < 2; pass++) {
    t = t
      // `&#58` needs no `;` in HTML; Mermaid's own `#58;` does (its encoder matches `#\w+;`).
      .replace(/&#(?:x([0-9a-f]+)|(\d+));?|#(\d+);/gi, (m, hex, dec, mdec) => {
        const cp = Number.parseInt(hex ?? dec ?? mdec, hex ? 16 : 10);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      })
      .replace(/[&#]([a-z]+);/gi, (m, name) => MERMAID_NAMED[name.toLowerCase()] ?? m);
  }
  return t;
}

/** Mermaid constructs that can load a resource, refused in a sample slide whatever they point at. */
const MERMAID_FORBIDDEN = [
  ['an image shape (`img:`)', /\bimg\s*:/i],
  ['an HTML media tag in a label', /<\s*\/?\s*(?:img|image|svg|iframe|frame|object|embed|link|style|video|audio|source|picture|use|feimage|portal|meta|base)\b/i],
  ['a src/href/srcset attribute', /\b(?:src|href|srcset|xlink:href|data|poster|background)\s*=/i],
  ['a markdown image in a label', /!\[/],
  ['a `click` directive', /(?:^|[\n;])\s*click\s/i],
  ['a url()', /\burl\s*\(/i],
  ['an image-set()', /image-set\s*\(/i],
  ['`themeCSS`', /themeCSS/i],
  ['an `@import`', /@import/i],
  ['a protocol-relative or UNC path', /[/\\]{2}/],
  // Numeric needs no `;` in HTML; a named one does, so `R&D` in a label stays legal.
  ['an entity code', /&#x?[0-9a-f]+;?|&[a-z][a-z0-9]*;|#[a-z0-9]+;/i],
];

/**
 * The remote targets in a Mermaid diagram's SOURCE, read as the diagram will read it:
 * entity codes decoded first, then every `url()`/string, every `//host`, and every special
 * scheme with or without slashes — against a `file:` page the URL parser reads `http:host/x`
 * as `http://host/x`. A label that merely mentions a URL is the rare false positive, and the
 * safe direction. Used for the fence text in the rendered page AND for every fence the CLI
 * finds in the source (`lib/core/mermaid-fences.js`), which includes one inside an HTML block.
 * @param {string} text
 * @returns {string[]}
 */
function mermaidRemoteRefs(text) {
  const t = mermaidDecoded(text);
  const out = [];
  // ALLOWLIST FIRST. Four checker passes each found a new URL SPELLING the scan below missed,
  // all inside Mermaid text. So a sample slide's diagram may not use any construct that can
  // load something at all, however its target is spelled. Read raw AND with tab/newline
  // dropped, since the URL parser would drop them. Words alone never trip it (`src/` as a
  // label is fine): only the constructs, measured against the 163 fences in the tree.
  const raw = String(text || '');
  for (const body of [raw, raw.replace(/[\t\n\r]/g, ''), t, t.replace(/[\t\n\r]/g, '')]) {
    for (const [what, re] of MERMAID_FORBIDDEN) if (re.test(body)) out.push(`policy:${what}`);
  }
  out.push(...remoteCssRefs(t));
  for (const m of t.matchAll(/(?:[a-z][a-z0-9+.-]*:)?[/\\]{2}[^\s"'<>)\]]+|\b(?:https?|wss?|ftp|file):[^\s"'<>)\]]*/gi)) {
    if (isRemoteUrl(m[0])) out.push(m[0]);
  }
  // The URL parser drops tab and newline ANYWHERE in a URL, so `ht<TAB>tp:host` (or Mermaid's
  // `ht#9;tp:`) is `http:host`. Read the text again with those removed. The scheme still needs
  // no scheme character before it, or `profile:` would read as `file:`.
  const joined = t.replace(/[\t\n\r]/g, '');
  if (joined !== t) {
    for (const m of joined.matchAll(/(?<![a-z0-9+.-])(?:https?|wss?|ftp|file):[^\s"'<>)\]]*|[/\\]{2}[^\s"'<>)\]]+/gi)) {
      if (isRemoteUrl(m[0])) out.push(m[0]);
    }
  }
  return out;
}

/**
 * The front-matter block of a sample slide, read with the same ALLOWLIST as Mermaid text. The
 * gate's own render of a gallery treats front matter as front matter and prints nothing, yet
 * two consumers read it: Insert, which splices the gallery after a `---` so its front matter
 * becomes an ordinary slide, and the CLI, whose `readGlobalStyle` pastes a `style:` key into
 * the export's stylesheet (matched line-wise, so an indented `style:` inside another key's
 * block counts too). So no `style:` line at all, and no loading construct anywhere in it.
 * Shipped galleries hold `marp`, `theme`, `paginate` and `header` here, and pass.
 * @param {string} fm  the text between the `---` fences
 * @returns {string[]}
 */
function frontMatterRemoteRefs(fm) {
  const out = [];
  if (/^\s*style\s*:/im.test(String(fm || ''))) out.push('policy:a `style:` key in front matter');
  return [...out, ...mermaidRemoteRefs(fm)];
}

/** The front-matter block at the top of LF-normalized markdown, or null. */
function frontMatterOf(md) {
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(String(md || ''));
  return m ? m[1] : null;
}

/**
 * The code fences a browser runtime draws from their text (a Mermaid diagram), as one regex
 * alternation — a COPY of the plugin registry's `RUNTIME_DRAWN_FENCES`
 * (lib/plugins/drawn.generated.mjs), for the same reason `VENDORED_SCRIPTS` below is copied: this
 * file is a dependency-free CommonJS leaf the Studio bundles, and the registry's data is an ES
 * module. `test/unit/core/drawn-fence-copy.test.js` fails the day a registry fence is missing
 * here, so a second runtime-drawn plugin cannot land unscanned.
 *
 * `isDrawnFenceClass(cls)` — does this class attribute mark a block the runtime draws from its
 * TEXT? By SUBSTRING on the code class (the runtime's own `[class*="language-<fence>"]` selector,
 * lib/runtime), so an info string like `mermaid-x` that the runtime would still draw counts, and by
 * the bare word, the `<pre class="mermaid">` shape a Marp host renders.
 */
const DRAWN_ALT = 'mermaid';
const DRAWN_CLASS = new RegExp(`language-(?:${DRAWN_ALT})|(?:^|\\s)(?:${DRAWN_ALT})(?:\\s|$)`, 'i');
const isDrawnFenceClass = (cls) => DRAWN_CLASS.test(String(cls || ''));

/**
 * The scripts a sample slide may load: Lattice's own vendored builds, by file name, behind any
 * run of `./` and `../` and an optional `dist/` (and Mermaid's published build, below). The
 * names are the ones `lib/core/marp-bundle.js` `RUNTIME_SCRIPT_SRCS` emits, plus the unminified
 * runtime the diagram gallery loads; a unit test (`test/unit/core/gallery-remote-refs.test.js`)
 * fails if that list grows a name this one lacks.
 * Copied rather than required, because this file is a dependency-free leaf the Studio bundles.
 */
// The `.min.js` spellings are the same files under their names before 2026-09-29, when the
// minified suffix became `-min`; a package gallery written against the old names stays admissible.
const VENDORED_SCRIPTS = Object.freeze([
  'mermaid-v11-min.js', 'lattice-dagre-min.js', 'lattice-runtime-min.js', 'lattice-runtime.js',
  'mermaid-v11.min.js', 'lattice-dagre.min.js', 'lattice-runtime.min.js',
]);
// `node_modules/mermaid/dist/mermaid.min.js` is Mermaid's own published build, the path a deck in
// a development tree loads it by (test/integration/baseline-decks/gallery.md does). Compared as
// plain strings, never compiled into a pattern, so no name can widen what matches.
const VENDORED_SCRIPT_PATHS = new Set([
  ...VENDORED_SCRIPTS,
  ...VENDORED_SCRIPTS.map((n) => `dist/${n}`),
  'node_modules/mermaid/dist/mermaid.min.js',
  // The mermaid plugin's OWN copy (its manifest's `payload.vendored`), which every surface ships —
  // the path the diagram gallery loads it by for a VS Code preview of the tree.
  'lib/plugins/mermaid/vendor/mermaid.min.js',
]);

/** Is this (already parsed) script reference one of the vendored builds? */
function isVendoredScript(ref) {
  // Drop the query and fragment, then any run of `./` and `../`; what is left must be one of the
  // paths above exactly. Only C0 controls and spaces are trimmed, as the URL parser trims them:
  // `.trim()` also took a trailing no-break space, which the browser keeps and fetches.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the URL parser strips them, so must we.
  const path = String(ref).replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[?#].*$/s, '').replace(/^(?:\.\.?\/)+/, '');
  return VENDORED_SCRIPT_PATHS.has(path);
}

// SMIL elements that can SET an attribute over time — `<set attributeName="href" to="…">`
// fetches on the frame it applies, with no href in the markup to see.
const SMIL = new Set(['set', 'animate', 'animatemotion', 'animatetransform', 'animatecolor']);

/**
 * Every remote fetch target among the elements of a PARSED document. Each host parses with
 * its own spec parser and hands the elements over in one shape:
 * `{ tag, attrs: [[name, value]…], text }`, names lowercased, values decoded, `text` the
 * text content of a `<style>`, a `<script>`, or an element whose class names Mermaid.
 * @param {Iterable<{tag: string, attrs: Array<[string, string]>, text?: string}>} elements
 * @returns {string[]}
 */
function remoteRefsInElements(elements) {
  const out = [];
  for (const el of elements) {
    const get = (n) => el.attrs.find(([k]) => k === n)?.[1] ?? '';
    // A nested document loads whatever it holds, and nothing here parses it. A sample slide has
    // no use for one, so it is refused outright rather than judged by its src.
    if (NESTED_ELEMENTS.has(el.tag)) out.push(`policy:a <${el.tag}> element`);
    // SCRIPT. A render runs the deck's scripts, and a script can reach the network in ways no
    // attribute shows (WebRTC's UDP, a DNS lookup). A sample slide may load ONE OF LATTICE'S OWN
    // vendored builds by a relative path with an empty body — the diagram gallery loads the
    // vendored Mermaid that way — and nothing else: no inline script, no `data:`/`javascript:`
    // source, no event handler, no `javascript:` URL, and no other relative file. "Any relative
    // path" used to pass, and in the Studio a relative path resolves against the Studio's own
    // origin (any same-origin chunk), in the CLI against the author's disk: code the package did
    // not write, but code nobody chose (followups.d/2336 item 14). An SVG `<script>` names its
    // file in `href` or `xlink:href`, not `src`, so all three are read. A remote source is
    // caught below, by `attrIsRemote`, with its URL in the message.
    if (el.tag === 'script') {
      if (String(el.text || '').trim()) out.push('policy:an inline <script>');
      for (const k of ['src', 'href', 'xlink:href']) {
        const ref = urlAsParsed(get(k));
        if (/^(?:data|javascript|vbscript|blob):/.test(ref)) out.push('policy:a <script> with a data: or javascript: source');
        else if (ref && !isRemoteUrl(get(k)) && !isVendoredScript(ref)) out.push(`policy:a <script> loading ${ref.slice(0, 60)}, which is not one of Lattice's own vendored scripts`);
      }
    }
    for (const [name, value] of el.attrs) {
      if (/^on/.test(name)) out.push(`policy:an event handler (${name})`);
      else if (/^(?:javascript|vbscript):/.test(urlAsParsed(value))) out.push('policy:a javascript: URL');
    }
    for (const [name, value] of el.attrs) {
      if (attrIsRemote(el.tag, name, value)) out.push(value);
    }
    if (el.tag === 'style') {
      out.push(...remoteCssRefs(el.text));
      // A sample slide never needs a whole stylesheet, and a relative one is no better.
      if (/@import\b/i.test(String(el.text || '').replace(/\\/g, ''))) out.push('@import');
    }
    if (SMIL.has(el.tag) && /^(?:xlink:)?href$/i.test(get('attributename').trim())) {
      for (const k of ['to', 'from', 'by', 'values']) {
        for (const v of get(k).split(';')) if (isRemoteUrl(v.trim())) out.push(v.trim());
      }
    }
    // A Mermaid fence reaches the page as TEXT (`<code class="language-mermaid">`) and the
    // runtime draws it later, so its `img:` shapes and `themeCSS` never show up as markup.
    // Any remote URL in the diagram's text counts; a label that merely quotes one is the
    // rare false positive, and the safe direction.
    // The code class as a SUBSTRING, the runtime's own selector (lib/runtime), so an info
    // string like `mermaid-x` that the runtime would still draw is scanned too.
    if (isDrawnFenceClass(get('class'))) out.push(...mermaidRemoteRefs(el.text));
    // A refresh navigates, and a `data:` page it navigates to runs its own script (measured in
    // a subframe), so a sample slide may not carry one at all, whatever its target.
    if (el.tag === 'meta' && /refresh/i.test(get('http-equiv'))) {
      out.push('policy:a <meta http-equiv="refresh">');
      const m = /url\s*=\s*['"]?([^'"]*)/i.exec(get('content'));
      if (m && isRemoteUrl(m[1])) out.push(m[1]);
    }
  }
  return out;
}

/** Why a component package is refused when its sample slide fetches — the words both front
 *  doors (the Studio's Library and `lattice packages add`) use. */
function galleryRefusal(url) {
  const ref = String(url);
  if (ref.startsWith('policy:')) {
    return `its sample slide uses ${ref.slice(7)} — a construct that can load from the network, so a sample slide from someone else may not carry it (a beacon to whoever sent it).`;
  }
  return `its sample slide loads ${String(url).slice(0, 80)} from the network — a remote image or url() in gallery.md is a beacon to whoever sent it (only relative paths and data: images are allowed).`;
}

// ─── Web images in a deck: blocked by default, loaded per origin on request ────────────────
// The owner's rule (portable-packages trio follow-up 11, 2026-09-25): a deck's images from the
// WEB (http, https, `//host`) do not load until the reader chooses to load them, because each
// one tells its server who opened the deck and when. The preview frames and every export carry
// a content-security policy that refuses them (lib/core/subresource-csp.mjs); these functions
// give that refusal a face. `blockWebImages` swaps each blocked image for a drawn placeholder
// that keeps its address, and counts what else the policy refuses (a `url()` background, a
// Mermaid `img:` shape), so a host can say "this deck loads N web images from these sites".
// A local `file:` image, a `data:` or `blob:` one and a relative path are not web images.

/** The web origin a URL loads from (`https://host[:port]`), or null when it is not a web URL. */
function webOrigin(raw) {
  let s = urlAsParsed(raw).replace(/\\/g, '/');
  if (s.startsWith('//')) s = `https:${s}`;
  if (!/^https?:\/\//.test(s)) return null;
  try {
    const { origin } = new URL(s);
    return origin && origin !== 'null' ? origin : null;
  } catch {
    return null;
  }
}

// EVERY named character reference whose value is one ASCII character other than a letter or a
// digit: the characters a URL, a `url(` and a CSS escape are built from (a letter or a digit has
// no name, so it can only be typed as itself or as a number). From the HTML standard's
// entities.json; `test/unit/core/web-css-bypass.test.js` holds each value to the `entities`
// package's decoder. Names are case-sensitive, as the HTML parser reads them. A tab and a
// newline decode to nothing: the URL parser drops both anywhere in a URL.
const ASCII_NAMED = {
  AMP: '&', amp: '&', DiacriticalGrave: '`', grave: '`', GT: '>', gt: '>', Hat: '^', LT: '<', lt: '<',
  NewLine: '', QUOT: '"', quot: '"', Tab: '', UnderBar: '_', lowbar: '_', VerticalLine: '|', verbar: '|',
  vert: '|', apos: "'", ast: '*', midast: '*', bsol: '\\', colon: ':', comma: ',', commat: '@',
  dollar: '$', equals: '=', excl: '!', lbrace: '{', lcub: '{', lbrack: '[', lsqb: '[', lpar: '(',
  num: '#', percnt: '%', period: '.', plus: '+', quest: '?', rbrace: '}', rcub: '}', rbrack: ']',
  rsqb: ']', rpar: ')', semi: ';', sol: '/',
};
// Of those, the only ones the parser also reads WITHOUT a `;` (the standard's legacy names).
const LEGACY_NAMED = new Set(['AMP', 'amp', 'GT', 'gt', 'LT', 'lt', 'QUOT', 'quot']);

/** Decode the character references an HTML parser decodes in an attribute value or text. */
function decodeEntities(v) {
  return String(v).replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z]+))(;?)/g, (m, dec, hex, name, semi) => {
    if (dec || hex) {
      const cp = Number.parseInt(dec ?? hex, dec ? 10 : 16);
      return cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? '�' : String.fromCodePoint(cp);
    }
    if (!Object.hasOwn(ASCII_NAMED, name) || (!semi && !LEGACY_NAMED.has(name))) return m;
    return ASCII_NAMED[name];
  });
}
const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The drawn stand-in for a blocked image: an empty 16:9 box the engine styles
 *  (`img[data-lattice-web-src]`, base.modifiers.css). It carries no color, so it is palette-blind.
 *  Its intrinsic 320×180 is a modest quarter of a slide's width: an SVG with only a viewBox has
 *  no intrinsic width, and the browser stretched it until two of them overflowed a content slide
 *  that two ordinary images fit. A layout that sizes its image still sizes this one. */
// The drawn picture mark in its middle (a sun over two peaks) is a neutral gray at partial
// opacity, the one color a data: image can carry: it cannot read the deck's tokens, and a
// translucent gray reads on a light and a dark canvas alike. Drawn, never typed (HARD RULE #29).
const WEB_IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 16 9'%3E" +
  "%3Cg fill='gray' fill-opacity='.5'%3E%3Ccircle cx='7.05' cy='3.55' r='.42'/%3E" +
  "%3Cpath d='M5.9 5.75 7.25 4.3 8.05 5.1 8.9 4.05 10.1 5.75Z'/%3E%3C/g%3E%3C/svg%3E";

/** The stand-in for a blocked web BACKGROUND: the placeholder's hatch, in the deck's tokens. */
const WEB_BG_PLACEHOLDER = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--text-muted) 22%, transparent) 0 1px, transparent 1px 10px)';

/**
 * CSS text (decoded: a `<style>` body or an attribute value the caller decoded) with every web
 * target `refuse(url, kind)` refuses swapped for the hatch, read by `cssRefSpans`, so every
 * spelling the browser fetches is one this rewrites: an escaped `u\72l(`, a `url("…")` with a
 * `)` in it, an `image-set("…")` or `@import "…"` string. A string becomes the hatch too, which
 * `image-set()` and `content` take as an image and `@import` ignores. A string inside `[…]` is
 * an attribute selector and stays.
 *
 * `fonts`: whether an `@font-face` source is refused as well. Where a content-security policy
 * backs the rewrite, a font is left to its `font-src` and not counted as an image the reader
 * could load. Where none does (the Studio's Reading view), nothing else would refuse it.
 * @param {string} css
 * @param {(url: string, kind: string) => boolean} refuse
 * @param {{ fonts?: boolean }} [opts]
 */
function cssWithoutWebUrls(css, refuse, { fonts = false } = {}) {
  const s = String(css);
  let out = '';
  let at = 0;
  for (const sp of cssRefSpans(s)) {
    if (sp.selector || (sp.fontFace && !fonts) || !refuse(sp.value, 'css')) continue;
    out += s.slice(at, sp.from) + WEB_BG_PLACEHOLDER;
    at = sp.to;
  }
  return at === 0 ? s : out + s.slice(at);
}

// The elements whose address a placeholder replaces. `href` is a fetch only on SVG `<image>`.
const WEB_MEDIA_TAG = /<(img|source|video|audio|image)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
// Any start tag, its quoted attribute values read whole so a `>` inside one does not end it.
const TAG = /<[a-z][^\s/>]*(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
// `[\s/"']`: the HTML parser takes a `/` as a separator too, so `<img/src=…>` has a src, and an
// attribute may follow a quoted value with no space at all (`<img alt="x"src=…>`).
const TAG_ATTR = /([\s/"'])(src|srcset|poster|href|xlink:href)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+)/gi;
const STYLE_ATTR = /([\s/"'])(style\s*=\s*)("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
// A `<style>` element: its start tag read like TAG, so a `>` in a quoted attribute does not end
// it; its end tag as the HTML parser closes raw text (`</style` then a space, a `/` or `>`, then
// anything to `>`); and no end tag at all runs to the end of the document.
const STYLE_ELEMENT = /(<style\b(?:"[^"]*"|'[^']*'|[^'">])*>)([\s\S]*?)(<\/style(?:[\t\n\f\r /][^>]*)?>|$)/gi;
// What a fetch outside a known spot would need: a style, or one of the media elements.
const MAY_FETCH = /style|<(?:img|source|video|audio|image)\b/i;


/**
 * The allowed web origins for a PREVIEW, plus the site's own. A preview frame, a capture frame
 * and the presenter stage all run on the page's own origin, and the site serves its sample art
 * (lib/samples/, the `sample:` images) from there — so an absolute same-origin address is the
 * site's own file, not a web image, and hatching it hid every portrait and logo in the Studio.
 * Loading it tells no third party anything. A file that leaves the browser may use it only when
 * it carries PIXELS (the PDF/PNG/PPTX capture frame). One that carries markup, like the HTML
 * player, embeds same-origin pictures first (lib/export/inline-url-media.mjs) and keeps its list
 * empty, so the recipient's copy never calls back to the site. `origin` defaults to the page's.
 */
function withOwnOrigin(allowed = [], origin = globalThis.location?.origin) {
  const own = typeof origin === 'string' && /^https?:\/\//.test(origin) ? origin : null;
  return own && !allowed.includes(own) ? [...allowed, own] : allowed;
}
/**
 * Swap every web image the reader has not allowed for a placeholder, and list what was blocked.
 *
 * @param {string} html      slide markup (an engine render, before or after sanitizing)
 * @param {Iterable<string>} [allowed]  web origins the reader chose to load (`webOrigin` form)
 * @param {{ fonts?: boolean, DOMParser?: typeof DOMParser | null }} [opts]
 *   `fonts`: refuse `@font-face` sources too, for a host with no content-security policy behind
 *   it (`cssWithoutWebUrls`). `DOMParser`: the spec parser that checks the result, the page's
 *   own by default; `null` skips the check.
 * @returns {{ html: string, blocked: Array<{ url: string, origin: string, kind: 'image'|'media'|'css'|'diagram' }> }}
 *   `blocked` holds every refused web reference, the placeholder-less ones (`css`, `diagram`)
 *   included, since the content-security policy refuses those without a rewrite.
 */
function blockWebImages(html, allowed = [], { fonts = false, DOMParser: DOMParserImpl = globalThis.DOMParser } = {}) {
  const allow = new Set(allowed);
  const blocked = [];
  const refuse = (value, kind) => {
    const url = decodeEntities(value).trim();
    const origin = webOrigin(url);
    if (!origin || allow.has(origin)) return false;
    blocked.push({ url, origin, kind });
    return true;
  };
  const out = String(html ?? '').replace(WEB_MEDIA_TAG, (tag, name) => {
    const el = name.toLowerCase();
    let first = null;
    let replaced = tag.replace(TAG_ATTR, (whole, sp, attr, eq, quoted) => {
      const a = attr.toLowerCase();
      if ((a === 'href' || a === 'xlink:href') && el !== 'image') return whole;
      const raw = quoted.replace(/^["']|["']$/g, '');
      const kind = el === 'img' || el === 'image' ? 'image' : 'media';
      if (a === 'srcset') {
        const cands = decodeEntities(raw).split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
        const hits = cands.filter((c) => refuse(c, kind));
        if (!hits.length) return whole;
        first ??= hits[0];
        return '';
      }
      if (!refuse(raw, kind)) return whole;
      first ??= decodeEntities(raw).trim();
      // An image keeps a box (the placeholder); a video, audio or source loses its address.
      return el === 'img' && a === 'src' ? `${sp}src="${WEB_IMAGE_PLACEHOLDER}"` : el === 'image' ? `${sp}${attr}${eq}"${WEB_IMAGE_PLACEHOLDER}"` : '';
    });
    if (first !== null) {
      // An image whose web `srcset` was refused shows the placeholder too, not the fallback
      // `src` beside it; a video keeps a box through the placeholder poster.
      if (el === 'img') replaced = replaced.replace(/[\s/]src\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/i, '').replace(/^<img\b/i, `<img src="${WEB_IMAGE_PLACEHOLDER}"`);
      if (el === 'video') replaced = replaced.replace(/^<video\b/i, `<video poster="${WEB_IMAGE_PLACEHOLDER}"`);
      // A function replacer: the URL is author text, and `$&` or `$`` in a string replacement splices
      // the matched tag text into the attribute.
      replaced = replaced.replace(/\s*(\/?)>$/, (_m, slash) => ` data-lattice-web-src="${escapeAttr(first)}"${slash}>`);
    }
    return replaced;
  });
  // A `url()` in a style attribute (a `![bg](…)` panel is one) or a <style> block becomes a
  // hatched gradient in the deck's own tokens. Not only for the look: the Studio's raster export
  // (html-to-image) re-fetches every background it finds from the PARENT page, which the frame's
  // policy does not govern, so a url() left in place would still be fetched at export.
  // Inside real TAGS only: a code sample's text can read `style='…'` too (markdown-it escapes
  // `"` and `<`, not `'`), and it is the author's text, not a fetch.
  // The value is decoded first (the browser reads `url&lpar;…` as `url(…)`) and, when it changes,
  // written back whole: double-quoted, every `&`, `"`, `<` and `>` escaped.
  let html2 = out.replace(TAG, (tag) =>
    tag.replace(STYLE_ATTR, (whole, lead, pre, _q, dq, sq, bare) => {
      const v = decodeEntities(dq ?? sq ?? bare);
      const next = cssWithoutWebUrls(v, refuse, { fonts });
      return next === v ? whole : `${lead}${pre}"${escapeAttr(next)}"`;
    }),
  );
  html2 = html2.replace(STYLE_ELEMENT, (whole, open, body, close) => {
    const next = cssWithoutWebUrls(body, refuse, { fonts });
    return next === body ? whole : `${open}${next}${close}`;
  });
  // The regexes above read markup the way a browser usually does, not always: inside `<svg>` a
  // `<style>` is parsed as markup, so `url&#40;…` and `url(<!---->…` fetch there. So when a spec
  // parser is at hand (every browser caller), its reading of the result is checked too, and
  // anything it still finds is rewritten through the DOM. The common case parses once and
  // changes nothing, so the output stays byte-identical to the regex pass.
  const verified = DOMParserImpl && MAY_FETCH.test(html2) ? verifyWithParser(html2, DOMParserImpl, refuse, fonts) : null;
  if (verified !== null) html2 = verified;
  else {
    // No parser (a Node caller): anything the rewrite could not reach is still counted, and the
    // frame's policy still refuses it.
    for (const tag of html2.match(TAG) || []) for (const m of tag.matchAll(STYLE_ATTR)) for (const u of remoteCssRefs(decodeEntities(m[4] ?? m[5] ?? m[6]))) refuse(u, 'css');
    for (const m of html2.matchAll(STYLE_ELEMENT)) for (const sp of cssRefSpans(m[2])) if (!sp.selector && (fonts || !sp.fontFace) && isRemoteUrl(sp.value)) refuse(sp.value, 'css');
  }
  for (const m of html2.matchAll(/<(?:code|pre|div)\b[^>]*\sclass\s*=\s*"[^"]*mermaid[^"]*"[^>]*>([\s\S]*?)<\/(?:code|pre|div)>/gi)) {
    // One diagram's scan reports a URL once per spelling pass; count it once.
    // Text for a URL SCAN only, never output: decoded FIRST, then every angle bracket blanked,
    // so no markup survives in it however the source spelled it.
    for (const u of new Set(mermaidRemoteRefs(decodeEntities(m[1]).replace(/[<>]/g, ' ')))) if (!u.startsWith('policy:')) refuse(u, 'diagram');
  }
  return { html: html2, blocked };
}

// The attributes the verifier reads on each media element, as the regex pass does.
const MEDIA_FETCH_ATTRS = ['src', 'srcset', 'poster', 'href', 'xlink:href'];

/**
 * `blockWebImages`' check of its own result, read by a spec parser: every style attribute,
 * every `<style>` element's text (the text the browser builds its sheet from, so a comment or
 * a character reference inside an SVG `<style>` is already gone or decoded) and every media
 * element's fetch attributes. Returns the rewritten markup, or `html` unchanged when the parser
 * finds nothing left to refuse. The parsed document is inert: parsing it fetches nothing.
 */
function verifyWithParser(html, DOMParserImpl, refuse, fonts) {
  const doc = new DOMParserImpl().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  let dirty = false;
  for (const el of doc.body.querySelectorAll('*')) {
    const tag = el.localName.toLowerCase();
    const style = el.getAttribute('style');
    if (style !== null) {
      const next = cssWithoutWebUrls(style, refuse, { fonts });
      if (next !== style) {
        el.setAttribute('style', next);
        dirty = true;
      }
    }
    if (tag === 'style') {
      const text = el.textContent ?? '';
      const next = cssWithoutWebUrls(text, refuse, { fonts });
      if (next !== text) {
        el.textContent = next;
        dirty = true;
      }
    }
    if (!['img', 'source', 'video', 'audio', 'image'].includes(tag)) continue;
    for (const a of MEDIA_FETCH_ATTRS) {
      const v = el.getAttribute(a);
      if (v === null || ((a === 'href' || a === 'xlink:href') && tag !== 'image')) continue;
      const kind = tag === 'img' || tag === 'image' ? 'image' : 'media';
      const targets = a === 'srcset' ? v.split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean) : [v];
      const hits = targets.filter((t) => refuse(t, kind));
      if (!hits.length) continue;
      dirty = true;
      el.removeAttribute(a);
      if ((tag === 'img' && (a === 'src' || a === 'srcset')) || (tag === 'image' && a !== 'srcset') || (tag === 'video' && a === 'poster')) {
        el.setAttribute(tag === 'video' ? 'poster' : tag === 'image' ? a : 'src', WEB_IMAGE_PLACEHOLDER);
        if (!el.hasAttribute('data-lattice-web-src')) el.setAttribute('data-lattice-web-src', hits[0].trim());
      }
    }
  }
  return dirty ? doc.body.innerHTML : html;
}

/**
 * A stylesheet with every web `url()` outside `allowed` swapped for the placeholder hatch, for a
 * host that puts deck CSS into a page with no content-security policy (the Studio's Reading
 * view). Returns the rewritten CSS and what was refused. With no policy behind it, an
 * `@font-face` source is refused too: nothing else would.
 * @param {string} css
 * @param {Iterable<string>} [allowed]
 */
function blockWebCss(css, allowed = []) {
  const allow = new Set(allowed);
  const blocked = [];
  const refuse = (value, kind) => {
    const url = String(value).trim();
    const origin = webOrigin(url);
    if (!origin || allow.has(origin)) return false;
    blocked.push({ url, origin, kind });
    return true;
  };
  return { css: cssWithoutWebUrls(String(css ?? ''), refuse, { fonts: true }), blocked };
}

/** The distinct origins of a `blocked` list, in first-seen order. */
function webOrigins(blocked) {
  return [...new Set((blocked || []).map((b) => b.origin))];
}

/** The last `webRefsInCss` call: its sheets and its answer. One slot, since a session has one theme at a time. */
let lastCssScan = null;

/**
 * Every web reference a STYLESHEET makes, in the `blocked` shape the frame policy reads
 * (`subresourceCspPolicy`'s `blocked`), whatever its spelling: escaped, `image-set()`, plain.
 * A theme or an author stylesheet reaches a preview frame beside the markup, never through
 * `blockWebImages`, so without this a subdomain reference in it could ride an allowed site's
 * subdomain wildcard. Allowed origins are listed too: the policy only asks which hosts have a
 * reference BELOW them, and an allowed origin is never below itself.
 * @param {...string} sheets
 * @returns {Array<{ url: string, origin: string, kind: 'css' }>}
 */
function webRefsInCss(...sheets) {
  const texts = sheets.map((css) => String(css ?? ''));
  // The Playground asks about the same theme and engine sheet on every keystroke, and the
  // tokenizer costs about 35 ms on a full sheet. A sheet that is unchanged is not rescanned:
  // one remembered answer, compared by content (the string is rebuilt each render, so identity
  // would never hit). A fresh copy goes out each time, so no caller can edit the memo.
  if (lastCssScan && lastCssScan.texts.length === texts.length && lastCssScan.texts.every((t, i) => t === texts[i])) {
    return lastCssScan.refs.map((r) => ({ ...r }));
  }
  const refs = [];
  for (const css of texts) for (const url of remoteCssRefs(css)) {
    const origin = webOrigin(url);
    if (origin) refs.push({ url, origin, kind: 'css' });
  }
  lastCssScan = { texts, refs };
  return refs.map((r) => ({ ...r }));
}

module.exports = { sampleName, assetName, isDrawnFenceClass, cssEscape, cssString, cssRefSpans, decodeEntities, urlAsParsed, WEB_IMAGE_PLACEHOLDER, webOrigin, blockWebImages, withOwnOrigin, blockWebCss, webRefsInCss, webOrigins, VENDORED_SCRIPTS, isVendoredScript, isRemoteUrl, remoteCssRefs, attrIsRemote, remoteRefsInElements, mermaidRemoteRefs, frontMatterRemoteRefs, frontMatterOf, galleryRefusal, FETCH_ATTRS };
