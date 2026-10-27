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
const { urlAsParsed, sampleName, assetName, WEB_IMAGE_PLACEHOLDER } = mediaSources;
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
    else if (j + 1 >= s.length) j++; // a backslash at the end of the input adds nothing to a string
    else if (isCssNewline(s[j + 1])) j += 1 + newlineLength(s, j + 1);
    else {
      const [d, n] = cssEscape(s, j);
      v += d;
      j = n;
    }
  }
  return [v, s[j] === q ? j + 1 : j];
}

// The characters a CSS name is read from, by code: a letter, a digit, `_`, `-`, or a backslash
// that starts an escape. (Non-ASCII also continues a name in CSS; reading it as a boundary only
// splits a name, which can make the scanner see a `url(` the browser does not: the safe side.)
const isNameCode = (c) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95 || c === 45 || c === 92;
const isNameStartCode = (c) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 45 || c === 92;
const CSS_CLOSER = { '(': ')', '[': ']', '{': '}' };

/**
 * Every place a piece of CSS names a target, as spans of the source: each string token, and
 * each `url(…)`, unquoted or holding one string (then the span is the whole function). Read
 * with a tokenizer that follows CSS Syntax 3 where a fetch depends on it: newlines (above),
 * escapes (`u\72l(` is `url(`), comments, strings, and the stack of `(` `[` `{` blocks, so a
 * `}` inside a string or a `(` block does not end a rule.
 *   `kind`      'url' for a `url(…)`, 'string' for a bare string token
 *   `value`     the target, escapes decoded (a `url(…)` target trimmed)
 *   `fontFace`  inside an `@font-face` block (a font source, not a picture)
 *   `selector`  inside a `[…]` block: an attribute selector, which never fetches
 * @param {string} css
 * @returns {Array<{ from: number, to: number, kind: 'url'|'string', value: string, fontFace: boolean, selector: boolean }>}
 */
function cssRefSpans(css) {
  const s = String(css ?? '');
  const n = s.length;
  const out = [];
  // The open blocks, innermost last; a `{` an `@font-face` rule opens is pushed as 'face'.
  const stack = [];
  let faces = 0;
  let brackets = 0;
  let pendingFace = false;
  const open = (b) => {
    stack.push(b);
    if (b === 'face') faces++;
    else if (b === '[') brackets++;
  };
  const push = (from, to, kind, value) => out.push({ from, to, kind, value, fontFace: faces > 0, selector: brackets > 0 });
  const readName = (at) => {
    let j = at;
    let escaped = false;
    while (j < n && isNameCode(s.charCodeAt(j))) {
      if (s.charCodeAt(j) === 92) {
        escaped = true;
        j = cssEscape(s, j)[1];
      } else j++;
    }
    if (!escaped) return [s.slice(at, j), j];
    let name = '';
    for (let k = at; k < j; ) {
      if (s.charCodeAt(k) === 92) {
        const [d, next] = cssEscape(s, k);
        name += d;
        k = next;
      } else name += s[k++];
    }
    return [name, j];
  };
  /** The next character that is not whitespace or inside a comment, from `at`. */
  const nextSignificant = (at) => {
    let k = at;
    for (;;) {
      while (k < n && isCssSpace(s[k])) k++;
      if (s[k] !== '/' || s[k + 1] !== '*') return s[k];
      const end = s.indexOf('*/', k + 2);
      if (end < 0) return undefined;
      k = end + 2;
    }
  };
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 47 && s.charCodeAt(i + 1) === 42) {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
    } else if (c === 34 || c === 39) {
      const [v, j] = cssString(s, i);
      push(i, j, 'string', v);
      i = j;
    } else if (c === 64) {
      const [name, j] = readName(i + 1);
      // An `@font-face` rule only where a rule can start (the top level, or a block's body) and
      // only with its block right after the name: any prelude makes the browser drop the rule.
      // `:is(@font-face, p){…}` is a selector, and its block is not a font block.
      const top = stack[stack.length - 1];
      if (name.toLowerCase() === 'font-face' && (top === undefined || top === '{' || top === 'face') && nextSignificant(j) === '{') pendingFace = true;
      i = Math.max(j, i + 1);
    } else if (isNameStartCode(c)) {
      const from = i;
      const [name, j] = readName(i);
      i = j;
      if (s.charCodeAt(i) !== 40) continue;
      if (name.length !== 3 || name.toLowerCase() !== 'url') {
        open('(');
        i++;
        continue;
      }
      let k = i + 1;
      while (k < n && isCssSpace(s[k])) k++;
      if (s[k] === '"' || s[k] === "'") {
        // `url("…")`: one span for the whole function when it closes right after the string,
        // so the rewrite swaps `url("…")` for the hatch; otherwise the string alone, and the
        // `(` stays open as the browser keeps it.
        const [v, end] = cssString(s, k);
        let e = end;
        while (e < n && isCssSpace(s[e])) e++;
        if (s[e] === ')') {
          push(from, e + 1, 'url', v);
          i = e + 1;
        } else {
          open('(');
          push(k, end, 'string', v);
          i = end;
        }
        continue;
      }
      // An unquoted url token: everything to the `)`, escapes decoded.
      let v = '';
      i++;
      while (i < n && s.charCodeAt(i) !== 41) {
        if (s.charCodeAt(i) === 92) {
          const [d, next] = cssEscape(s, i);
          v += d;
          i = next;
        } else v += s[i++];
      }
      i = Math.min(i + 1, n);
      push(from, i, 'url', v.trim());
    } else if (c === 40 || c === 91 || c === 123) {
      open(c === 123 && pendingFace ? 'face' : s[i]);
      if (c === 123) pendingFace = false;
      i++;
    } else if (c === 41 || c === 93 || c === 125) {
      // A closer ends the innermost block only when it matches it; any other is a token inside.
      const top = stack[stack.length - 1];
      if (top && CSS_CLOSER[top === 'face' ? '{' : top] === s[i]) {
        stack.pop();
        if (top === 'face') faces--;
        else if (top === '[') brackets--;
      }
      if (c === 125) pendingFace = false;
      i++;
    } else {
      if (c === 59) pendingFace = false;
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
  // a string is also read as written (see cssReplacements): Firefox's preloader does not decode escapes in an `@import`
  return cssRefSpans(css).flatMap((sp) => (sp.kind === 'string' && css.slice(sp.from + 1, sp.to - 1).includes('\\') ? [sp.value, css.slice(sp.from + 1, sp.to - 1).replace(/\\/g, '/')] : [sp.value])).filter(isRemoteUrl);
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
    // A `<base>` re-targets every relative address on the page, so a sample slide may not carry one.
    if (el.tag === 'base' && get('href')) {
      out.push('policy:a <base> element');
      if (isRemoteUrl(get('href'))) out.push(get('href'));
    }
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
  // `http:host` and `http:/host` are absolute to the URL parser whenever the page's scheme differs
  // (a file:// export, an https site), and relative-but-still-this-host otherwise; either way the
  // address leaves for a host the author named, so any number of slashes after the scheme reads as `//`.
  s = s.replace(/^(https?:)\/*/i, '$1//');
  if (!/^https?:\/\//i.test(s)) return null;
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
// package's decoder. Names are case-sensitive, as the HTML parser reads them. `&Tab;` and `&NewLine;`
// decode to a real tab and newline, as `&#9;` does; the URL parser drops them from an address (`urlAsParsed`), after a list attribute is split on them.
const ASCII_NAMED = {
  AMP: '&', amp: '&', DiacriticalGrave: '`', grave: '`', GT: '>', gt: '>', Hat: '^', LT: '<', lt: '<',
  NewLine: '\n', QUOT: '"', quot: '"', Tab: '\t', UnderBar: '_', lowbar: '_', VerticalLine: '|', verbar: '|',
  vert: '|', apos: "'", ast: '*', midast: '*', bsol: '\\', colon: ':', comma: ',', commat: '@',
  dollar: '$', equals: '=', excl: '!', lbrace: '{', lcub: '{', lbrack: '[', lsqb: '[', lpar: '(',
  num: '#', percnt: '%', period: '.', plus: '+', quest: '?', rbrace: '}', rcub: '}', rbrack: ']',
  rsqb: ']', rpar: ')', semi: ';', sol: '/',
};
// Of those, the only ones the parser also reads WITHOUT a `;` (the standard's legacy names).
const LEGACY_NAMED = new Set(['AMP', 'amp', 'GT', 'gt', 'LT', 'lt', 'QUOT', 'quot']);

// A numeric reference to one of these code points decodes to the windows-1252 character instead,
// as the HTML parser decodes it: `&#x99;` is `™`, which a URL parser folds to `tm` in a host.
// Keyed by decimal code point (128-159 is 0x80-0x9F).
const WINDOWS_1252 = {
  128: 0x20ac, 130: 0x201a, 131: 0x0192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x02c6,
  137: 0x2030, 138: 0x0160, 139: 0x2039, 140: 0x0152, 142: 0x017d, 145: 0x2018, 146: 0x2019, 147: 0x201c,
  148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x02dc, 153: 0x2122, 154: 0x0161, 155: 0x203a,
  156: 0x0153, 158: 0x017e, 159: 0x0178,
};
const REFERENCE = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z]+))(;?)/g;

/**
 * Decode the character references an HTML parser decodes, keeping where each decoded character
 * came from: `map[k]` is the index in `v` where `text[k]` starts, and `map[text.length]` is
 * `v.length`, so a span of `text` maps back to a span of `v`.
 * `attribute`: the text is an attribute value, where a legacy name with no `;` followed by `=`
 * or a letter or digit stays as written (`&quot=` is literal there).
 * @param {string} v
 * @param {{ attribute?: boolean }} [opts]
 * @returns {{ text: string, map: number[] }}
 */
function decodeEntitiesMapped(v, { attribute = false } = {}) {
  const raw = String(v);
  let text = '';
  const map = [];
  let at = 0;
  const copy = (to) => {
    for (; at < to; at++) {
      map.push(at);
      text += raw[at];
    }
  };
  REFERENCE.lastIndex = 0;
  for (let m = REFERENCE.exec(raw); m; m = REFERENCE.exec(raw)) {
    const [whole, dec, hex, name, semi] = m;
    let out;
    if (dec || hex) {
      let cp = Number.parseInt(dec ?? hex, dec ? 10 : 16);
      cp = WINDOWS_1252[cp] ?? cp;
      out = cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? '�' : String.fromCodePoint(cp);
    } else if (Object.hasOwn(ASCII_NAMED, name) && (semi || (LEGACY_NAMED.has(name) && !(attribute && /[=A-Za-z0-9]/.test(raw[m.index + whole.length] ?? ''))))) {
      out = ASCII_NAMED[name];
    } else continue;
    copy(m.index);
    for (let k = 0; k < out.length; k++) map.push(m.index);
    text += out;
    at = m.index + whole.length;
  }
  copy(raw.length);
  map.push(raw.length);
  return { text, map };
}

/** Decode the character references an HTML parser decodes in an attribute value or text. */
function decodeEntities(v, opts) {
  const raw = String(v);
  return raw.includes('&') ? decodeEntitiesMapped(raw, opts).text : raw;
}
const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// WEB_IMAGE_PLACEHOLDER, the drawn stand-in for a blocked image, lives in media-sources.js: the player runtime and the engine need
// it and nothing else here, and requiring this module for it bundled the whole scanner into every export's runtime.

/** The stand-in for a blocked web BACKGROUND: the placeholder's hatch, in the deck's tokens. */
const WEB_BG_PLACEHOLDER = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--text-muted) 22%, transparent) 0 1px, transparent 1px 10px)';

/**
 * Where a piece of CSS (decoded: a `<style>` body, or an attribute value the caller decoded)
 * names a web target `refuse(url, kind)` refuses, as `[from, to, replacement]` in that text,
 * read by `cssRefSpans`, so every spelling the browser fetches is one found here: an escaped
 * `u\72l(`, a `url("…")` with a `)` in it, an `image-set("…")` or `@import "…"` string.
 * A `url(…)` becomes the hatch, so a background keeps a visible box. A bare string becomes
 * `none`: where a string would fetch (`image-set()`, `@import`, a custom property an image
 * reads) that is invalid and fetches nothing, and where it is text (`content`) it draws nothing,
 * where the hatch would have drawn a slide-sized box. A string inside `[…]` is an attribute
 * selector and stays.
 *
 * `fonts`: whether an `@font-face` source is refused as well. Where a content-security policy
 * backs the rewrite, a font is left to its `font-src` and not counted as an image the reader
 * could load. Where none does (the Studio's Reading view), nothing else would refuse it.
 * @param {string} css
 * @param {(url: string, kind: string) => boolean} refuse
 * @param {{ fonts?: boolean }} [opts]
 * @returns {Array<[number, number, string]>}
 */
function cssReplacements(css, refuse, { fonts = false } = {}) {
  const out = [];
  for (const sp of cssRefSpans(css)) {
    if (sp.selector || (sp.fontFace && !fonts)) continue;
    // Firefox's preloader fetches an `@import "…"` string as WRITTEN, before the CSS parser has decoded its
    // escapes: `"/\\127.0.0.1:9/x"` reads as `//127.0.0.1:9/x` there (measured 2026-10-26, a document in
    // Firefox 142), though CSS decodes `\\127` to a letter and the address is relative. A string is refused if
    // either reading names the web.
    const raw = sp.kind === 'string' ? css.slice(sp.from + 1, sp.to - 1) : '';
    if (!refuse(sp.value, 'css') && !(raw.includes('\\') && refuse(raw, 'css'))) continue;
    out.push([sp.from, sp.to, sp.kind === 'url' ? WEB_BG_PLACEHOLDER : 'none']);
  }
  return out;
}

/** `css` with `cssReplacements` applied. */
function cssWithoutWebUrls(css, refuse, opts) {
  const s = String(css);
  return spliced(s, cssReplacements(s, refuse, opts));
}

/** `s` with each `[from, to, text]` (sorted, not overlapping) put in place of its span. */
function spliced(s, edits) {
  if (!edits.length) return s;
  let out = '';
  let at = 0;
  for (const [from, to, text] of edits) {
    out += s.slice(at, from) + text;
    at = to;
  }
  return out + s.slice(at);
}

// ─── Reading the markup the rewrite works on ──────────────────────────────────────────────
// A regex over HTML is wrong in both directions: it read `<p/style=…>` and `</style >` as no
// style at all, and its nested quantifiers made `'<style"'.repeat(1000)` take 50 s. So the
// rewrite reads tags with this scanner, which follows the HTML tokenizer (the WHATWG standard,
// §13.2.5) for what decides where a tag, an attribute or raw text ends, in one linear pass.

const isHtmlSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
const isAsciiAlpha = (s, i) => {
  const c = s.charCodeAt(i) | 32;
  return c >= 97 && c <= 122;
};
// Elements whose content is text up to their end tag, in HTML content. `<noscript>` is read as
// raw text because every surface that shows a deck runs scripts.
const RAW_TEXT = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'textarea', 'title']);
// Inside `<svg>` or `<math>` the tree builder follows rules this scanner does not: no raw text,
// references and comments inside a `<style>`, a tag from this list leaves the foreign content,
// and `<foreignObject>` holds HTML. One of these inside foreign content means the scanner's
// reading may differ from the browser's, so `blockWebImages` asks a spec parser. Lattice's own
// SVG (charts, icons, diagrams) holds none of them: across 404 rendered decks, none.
const FOREIGN_RISK = new Set([
  'style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'textarea', 'plaintext', 'template',
  'foreignobject', 'annotation-xml', 'math', 'b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div',
  'dl', 'dt', 'em', 'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'menu',
  'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's', 'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt',
  'u', 'ul', 'var', 'font',
]);

/**
 * The tag at `html[i]` (`<` then a letter, or `</` then a letter), read as the tokenizer reads
 * it, or null when it never ends (the rest of the document is inside it). Each attribute keeps
 * the span of its value: `vq` where it starts (its quote, if any), `vFrom`/`vTo` the value
 * itself, `to` the end; `sep` is the separator before its name, so removing `[sep, to)` removes
 * it cleanly.
 */
function readTag(html, i) {
  const n = html.length;
  const closing = html[i + 1] === '/';
  let j = i + (closing ? 2 : 1);
  const nameFrom = j;
  while (j < n && !isHtmlSpace(html[j]) && html[j] !== '/' && html[j] !== '>') j++;
  const tag = { from: i, end: 0, nameEnd: j, name: html.slice(nameFrom, j).toLowerCase(), closing, attrs: [], selfClosing: false };
  let slash = false;
  for (;;) {
    while (j < n && (isHtmlSpace(html[j]) || html[j] === '/')) slash = html[j++] === '/';
    if (j >= n) return null;
    if (html[j] === '>') {
      tag.selfClosing = slash;
      tag.end = j + 1;
      return tag;
    }
    slash = false;
    const sep = isHtmlSpace(html[j - 1]) || html[j - 1] === '/' ? j - 1 : j;
    const from = j;
    j++; // the first character belongs to the name, even an `=`
    while (j < n && !isHtmlSpace(html[j]) && html[j] !== '/' && html[j] !== '>' && html[j] !== '=') j++;
    const attr = { name: html.slice(from, j).toLowerCase(), sep, from, to: j, vq: -1, vFrom: -1, vTo: -1, quote: '' };
    tag.attrs.push(attr);
    let k = j;
    while (k < n && isHtmlSpace(html[k])) k++;
    if (html[k] !== '=') continue;
    k++;
    while (k < n && isHtmlSpace(html[k])) k++;
    if (k >= n) return null;
    attr.vq = k;
    if (html[k] === '"' || html[k] === "'") {
      const close = html.indexOf(html[k], k + 1);
      if (close < 0) return null;
      Object.assign(attr, { quote: html[k], vFrom: k + 1, vTo: close, to: close + 1 });
      j = close + 1;
    } else {
      let e = k;
      while (e < n && !isHtmlSpace(html[e]) && html[e] !== '>') e++;
      Object.assign(attr, { vFrom: k, vTo: e, to: e });
      j = e;
    }
  }
}

/** Where the end tag of a raw-text element named `name` starts, at or after `from`, or -1. */
function rawTextEnd(html, name, from) {
  for (let k = html.indexOf('</', from); k >= 0; k = html.indexOf('</', k + 2)) {
    if (html.slice(k + 2, k + 2 + name.length).toLowerCase() !== name) continue;
    const c = html[k + 2 + name.length];
    if (c === undefined || c === '>' || c === '/' || isHtmlSpace(c)) return k;
  }
  return -1;
}

/**
 * Every start tag in `html`, in order, with its attributes, and the text span (`body`) of each
 * raw-text element in HTML content; `risky` when foreign content holds something the scanner
 * does not model (`FOREIGN_RISK`). Comments and bogus comments are skipped where the tokenizer
 * ends them, so a quote inside one cannot hide the tags after it.
 * @param {string} html
 */
function scanHtml(html) {
  const n = html.length;
  const tags = [];
  const foreign = [];
  let risky = false;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    const next = html[lt + 1];
    if (html.startsWith('<!--', lt)) {
      // `<!-->` and `<!--->` close at once; otherwise the first `-->` or `--!>`.
      if (html[lt + 4] === '>') i = lt + 5;
      else if (html.startsWith('->', lt + 4)) i = lt + 6;
      else {
        const a = html.indexOf('-->', lt + 4);
        const b = html.indexOf('--!>', lt + 4);
        if (a < 0 && b < 0) {
          // A comment that never ends swallows the rest of the document in the tree, but Chromium's preload
          // scanner fetches the images after it anyway (measured in a document, `<svg><style><!--` then an
          // `<img>`), so the rest is read as markup and the page's parser is asked as well.
          risky = true;
          i = lt + 4;
          continue;
        }
        i = b < 0 || (a >= 0 && a < b) ? a + 3 : b + 4;
      }
      continue;
    }
    if (foreign.length && html.startsWith('<![CDATA[', lt)) {
      const e = html.indexOf(']]>', lt + 9);
      if (e < 0) break;
      i = e + 3;
      continue;
    }
    if (next === '!' || next === '?' || (next === '/' && lt + 2 < n && !isAsciiAlpha(html, lt + 2))) {
      // A doctype or a bogus comment runs to the first `>`; `</>` is dropped the same way.
      const e = html.indexOf('>', lt + 2);
      if (e < 0) break;
      i = e + 1;
      continue;
    }
    if (!(isAsciiAlpha(html, lt + 1) || (next === '/' && isAsciiAlpha(html, lt + 2)))) {
      i = lt + 1;
      continue;
    }
    const t = readTag(html, lt);
    if (!t) break;
    i = t.end;
    if (foreign.length) {
      const top = foreign[foreign.length - 1];
      if (t.closing) {
        if (t.name === 'p' || t.name === 'br') risky = true;
        if (t.name === top) foreign.pop();
        continue;
      }
      tags.push(t);
      if (FOREIGN_RISK.has(t.name) || (t.name === 'svg' && top === 'math')) risky = true;
      if ((t.name === 'svg' || t.name === 'math') && !t.selfClosing) foreign.push(t.name);
      continue;
    }
    if (t.closing) continue;
    tags.push(t);
    // Newer browsers let a `<select>` hold a table, a style and other markup that older ones drop, so what this
    // scanner reads as raw text or text may be live elements there. The page's own parser decides.
    if (t.name === 'select') risky = true;
    // A `<noscript>` is raw text here, as it is in a page that runs scripts. A sanitizer parses without scripts, reads its
    // content as markup and keeps the elements: `<noscript><img srcset=…></noscript>` goes in with a hidden image and comes out
    // with a live one. The page's own parser (scripts off) reads it the second way, so it decides.
    if (t.name === 'noscript') risky = true;
    if ((t.name === 'svg' || t.name === 'math') && !t.selfClosing) foreign.push(t.name);
    else if (t.name === 'plaintext') break;
    else if (RAW_TEXT.has(t.name)) {
      const close = rawTextEnd(html, t.name, t.end);
      t.body = [t.end, close < 0 ? n : close];
      // An escaped script (`<!--` inside it) ends by rules this scanner does not follow.
      if (t.name === 'script' && html.slice(t.end, t.body[1]).includes('<!--')) risky = true;
      if (close < 0) break;
      const end = readTag(html, close);
      if (!end) break;
      i = end.end;
    }
  }
  return { tags, risky };
}

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
 * Tags are read by `scanHtml`, CSS by `cssRefSpans`, so each spelling of a fetch the browser
 * reads is one this rewrites. Where the scanner cannot model the markup (`risky`: inside `<svg>`
 * or `<math>`, a `<style>` the tree builder parses as markup, or a tag that leaves foreign
 * content), the page's own parser checks the result, and anything it still finds is rewritten
 * through the DOM. No deck Lattice ships needs that check.
 *
 * Run it BEFORE the sanitizer, as every caller does: the parser check re-serializes the markup
 * when it rewrites something, and re-serializing sanitized markup is how a mutation slips past
 * a sanitizer. It takes a fragment (section markup), never a whole document.
 *
 * @param {string} html      slide markup (an engine render, before sanitizing)
 * @param {Iterable<string>} [allowed]  web origins the reader chose to load (`webOrigin` form)
 * @param {{ fonts?: boolean, DOMParser?: typeof DOMParser | null }} [opts]
 *   `fonts`: the host has no content-security policy behind it (the Studio's Reading view), so
 *   refuse what a policy would otherwise refuse: `@font-face` sources (`cssReplacements`), a
 *   `url()` in an SVG paint attribute (`fill`, `mask`), and every other attribute that loads on
 *   render (`<feImage href>`, a table's `background`). Without it, those are left to the policy,
 *   and `blocked`, which feeds the "Load images" offer and the policy itself, stays images and
 *   CSS. `DOMParser`: the spec parser for the `risky` check, the page's own by default; `null`
 *   skips it.
 * @returns {{ html: string, blocked: Array<{ url: string, origin: string, kind: 'image'|'media'|'css'|'diagram' }> }}
 *   `blocked` holds every refused web reference, the placeholder-less ones (`css`, `diagram`)
 *   included, since the content-security policy refuses those without a rewrite.
 */
function blockWebImages(html, allowed = [], { fonts = false, DOMParser: DOMParserImpl = globalThis.DOMParser } = {}) {
  const allow = new Set(allowed);
  const blocked = [];
  // `value` arrives as the browser reads it: an attribute value decoded once, CSS or element text as written. Decoding it
  // again here read `own&amp;sol;@evil` as `own/@evil` (the allowed origin) where the browser reads userinfo and fetches
  // from `evil`, so the two callers that hand over raw attribute text decode it themselves, once.
  const refuse = (value, kind) => {
    const url = String(value).trim();
    const origin = webOrigin(url);
    if (!origin || allow.has(origin)) return false;
    blocked.push({ url, origin, kind });
    return true;
  };
  const src = String(html ?? '');
  const { tags, risky } = scanHtml(src);
  const edits = [];
  // Media first, then every other attribute, then <style> elements: the order `blocked` lists them in.
  for (const t of tags) if (WEB_MEDIA.has(t.name)) mediaEdits(src, t, refuse, edits);
  // A `url()` in a style attribute (a `![bg](…)` panel is one) or a <style> block becomes a
  // hatched gradient in the deck's own tokens. Not only for the look: the Studio's raster export
  // (html-to-image) re-fetches every background it finds from the PARENT page, which the frame's
  // policy does not govern, so a url() left in place would still be fetched at export. The value
  // is read decoded (the browser reads `url&lpar;…` as `url(…)`) and rewritten in place, mapped
  // back to the characters as written, so every other reference in it (`&eacute;`) stays.
  for (const t of tags) {
    for (const a of t.attrs) {
      if (a.vFrom < 0) continue;
      // With no policy behind the host, any other attribute that fetches on render
      // (`<feImage href>`, `<table background>`) loses a refused address: there is no
      // placeholder for it to show. Where a policy is behind it, the policy refuses these.
      if (fonts && otherFetchTargets(t.name, a.name, () => decodeEntities(src.slice(a.vFrom, a.vTo), { attribute: true })).filter((u) => refuse(u, 'media')).length) {
        edits.push([a.sep, a.to, '']);
        continue;
      }
      // A nested document built in place, or an SMIL animation that sets a link's address, fetches
      // from inside: no address on the element names the web, so the attribute itself goes.
      if (fonts && (nestedDocument(t.name, a.name, () => decodeEntities(src.slice(a.vFrom, a.vTo), { attribute: true })) || smilTargets(t.name, a.name, () => decodeEntities(src.slice(a.vFrom, a.vTo), { attribute: true }), () => t.attrs.map((x) => [x.name, x.vFrom < 0 ? '' : decodeEntities(src.slice(x.vFrom, x.vTo), { attribute: true })])).some((u) => refuse(u, 'media')))) {
        edits.push([a.sep, a.to, '']);
        continue;
      }
      // A style attribute, or an SVG paint attribute that takes a url() (`fill`, `mask`).
      if (a.name !== 'style' && !(fonts && URL_PAINT_ATTRS.has(a.name))) continue;
      const raw = src.slice(a.vFrom, a.vTo);
      const { text, map } = decodeEntitiesMapped(raw, { attribute: true });
      const reps = cssReplacements(text, refuse, { fonts });
      if (!reps.length) continue;
      const next = spliced(raw, reps.map(([from, to, rep]) => [map[from], map[to], rep]));
      // An unquoted value is quoted on the way out: the hatch carries spaces.
      edits.push(a.quote ? [a.vFrom, a.vTo, next] : [a.vFrom, a.vTo, `"${next.replace(/"/g, '&quot;')}"`]);
    }
  }
  // A `<base href>` naming a web address points every relative address after it (and, inserted into
  // a live page, before it) at that origin: a fetch no attribute on the element itself shows.
  for (const t of tags) {
    const href = t.name === 'base' && t.attrs.find((a) => a.name === 'href' && a.vFrom >= 0);
    if (href && refuse(decodeEntities(src.slice(href.vFrom, href.vTo), { attribute: true }), 'media')) edits.push([t.from, t.end, '']);
  }
  // A refresh `<meta>` navigates the page (or its frame) to the address, and the navigation is a
  // request no policy for subresources governs.
  for (const t of tags) {
    if (t.name !== 'meta') continue;
    const attr = (n) => t.attrs.find((a) => a.name === n && a.vFrom >= 0);
    const equiv = attr('http-equiv');
    const content = attr('content');
    if (!equiv || !content || decodeEntities(src.slice(equiv.vFrom, equiv.vTo), { attribute: true }).trim().toLowerCase() !== 'refresh') continue;
    const target = refreshTarget(decodeEntities(src.slice(content.vFrom, content.vTo), { attribute: true }));
    // a `data:` page it navigates to runs and fetches in its own right (measured in a subframe)
    if (target && (refuse(target, 'media') || /^[\t\n\f\r ]*(?:data|blob):/i.test(urlAsParsed(target)))) edits.push([t.from, t.end, '']);
  }
  for (const t of tags) {
    if (t.name !== 'style' || !t.body) continue;
    const [b0, b1] = t.body;
    for (const [from, to, rep] of cssReplacements(src.slice(b0, b1), refuse, { fonts })) edits.push([b0 + from, b0 + to, rep]);
  }
  // A tag removed whole (`<base>`, refresh `<meta>`) may also carry an edit of its own attributes; `spliced`
  // takes edits that do not overlap, so the ones inside a removed tag go with it.
  const removed = edits.filter(([f, to, rep]) => rep === '' && src[f] === '<' && src[to - 1] === '>');
  const kept = edits.filter((e) => !removed.some((r) => r !== e && e[0] >= r[0] && e[1] <= r[1]));
  edits.length = 0;
  edits.push(...kept);
  edits.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let html2 = spliced(src, edits);
  if (risky && DOMParserImpl) html2 = verifyWithParser(html2, DOMParserImpl, refuse, fonts);
  else if (risky) {
    // No parser (a Node caller): a <style> inside foreign content is counted as the tree builder
    // reads it (references decoded, comments dropped), and the frame's policy refuses it.
    for (const t of scanHtml(html2).tags) {
      if (t.name !== 'style' || t.body) continue;
      const close = rawTextEnd(html2, 'style', t.end);
      const text = decodeEntities(html2.slice(t.end, close < 0 ? html2.length : close).replace(/<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[|\]\]>|<[^>]*>/g, ''));
      for (const sp of cssRefSpans(text)) if (!sp.selector && (fonts || !sp.fontFace) && isRemoteUrl(sp.value)) refuse(sp.value, 'css');
    }
  }
  // A Mermaid fence reaches the page as text; the runtime draws it later, so its `img:` shapes
  // are counted here (the frame's policy refuses them). Each diagram's body runs to the first
  // end tag of a code, pre or div after it.
  const closers = [...html2.matchAll(/<\/(?:code|pre|div)>/gi)].map((m) => m.index);
  let c = 0;
  // Nothing rewritten (the usual case) means the markup is the markup already scanned.
  for (const t of html2 === src ? tags : scanHtml(html2).tags) {
    if (!MERMAID_HOSTS.has(t.name)) continue;
    const cls = t.attrs.find((a) => a.name === 'class' && a.vFrom >= 0);
    if (!cls || !decodeEntities(html2.slice(cls.vFrom, cls.vTo), { attribute: true }).includes('mermaid')) continue;
    while (c < closers.length && closers[c] < t.end) c++;
    if (c >= closers.length) break;
    // One diagram's scan reports a URL once per spelling pass; count it once.
    // Text for a URL SCAN only, never output: decoded FIRST, then every angle bracket blanked,
    // so no markup survives in it however the source spelled it.
    for (const u of new Set(mermaidRemoteRefs(decodeEntities(html2.slice(t.end, closers[c])).replace(/[<>]/g, ' ')))) if (!u.startsWith('policy:')) refuse(u, 'diagram');
  }
  return { html: html2, blocked };
}

// The elements whose address a placeholder replaces. `href` is a fetch only on SVG `<image>`.
const WEB_MEDIA = new Set(['img', 'source', 'video', 'audio', 'image']);
const MEDIA_FETCH_ATTRS = new Set(['src', 'srcset', 'poster', 'href', 'xlink:href']);
// The SVG presentation attributes whose value can be a `url()` the browser fetches.
const URL_PAINT_ATTRS = new Set(['fill', 'stroke', 'filter', 'mask', 'clip-path', 'marker-start', 'marker-mid', 'marker-end', 'cursor']);
// The attributes, besides a media element's own, whose address loads when the markup renders.
// FETCH_ATTRS less the ones that act only on a click or a submit (`action`, `ping`, `longdesc`).
// `action` and `ping` are refused by `CLICK_FETCH_ATTRS` below (with `formaction` and `attributionsrc`), where no policy stands behind the host; `longdesc` is not.
const HREF_FETCH_TAGS = new Set(['use', 'feimage', 'link', 'script']);
const RENDER_FETCH_ATTRS = new Set(['src', 'srcset', 'imagesrcset', 'href', 'xlink:href', 'poster', 'background', 'data', 'lowsrc', 'dynsrc', 'codebase', 'archive', 'manifest', 'icon', 'profile']);

// Attributes that fetch when the reader acts, or on render (`attributionsrc`, a list of reporting addresses): `ping` posts to each address it lists on a
// click, `action` and `formaction` send a form on a submit. A deck can carry a web one as quietly as an image, and a
// host that runs no content-security policy (`connect-src` and `form-action` are closed in
// subresource-csp.mjs) has nothing else standing between the click and the stranger's server. Read by name on any
// element: refusing too much costs an attribute no deck should carry, and listing the elements a browser honors them
// on is a list that goes stale. An origin the user approved (`allowed`) still passes, which is the door a plugin uses.
const CLICK_FETCH_ATTRS = new Set(['ping', 'action', 'formaction', 'attributionsrc']);

/**
 * The addresses an attribute that `mediaEdits` does not own would fetch, on render or, for `CLICK_FETCH_ATTRS`, on a
 * click or a submit, or `[]`.
 * `value` is a function so that the common attribute (`class`, `id`) is never decoded.
 */
function otherFetchTargets(tag, name, value) {
  if (CLICK_FETCH_ATTRS.has(name)) return name === 'ping' || name === 'attributionsrc' ? value().split(/[\t\n\f\r ]+/).filter(Boolean) : [value().trim()];
  if (!RENDER_FETCH_ATTRS.has(name) || (WEB_MEDIA.has(tag) && MEDIA_FETCH_ATTRS.has(name))) return [];
  // `href` loads only on the elements that fetch what it names; on `<a>`, `<area>` and a
  // MathML element it is a link, followed on a click.
  if ((name === 'href' || name === 'xlink:href') && !HREF_FETCH_TAGS.has(tag)) return [];
  const v = value();
  return name.endsWith('srcset') ? v.split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean) : [v.trim()];
}
const MERMAID_HOSTS = new Set(['code', 'pre', 'div']);

/**
 * Whether the attribute makes a nested document out of its own text or a `data:` page: an
 * `<iframe srcdoc>`, or an `<iframe src>`, `<object data>` or `<embed src>` holding `data:`, `blob:` or
 * `javascript:`. The document it builds loads whatever it names, and the scanner reads none of it.
 */
function nestedDocument(tag, name, value) {
  if (!NESTED_ELEMENTS.has(tag)) return false;
  if (name === 'srcdoc') return true;
  return (name === 'src' || name === 'data') && /^(?:data|blob|javascript):/i.test(urlAsParsed(value()));
}

/** The addresses an SMIL animation would set a link to: `to`, `from`, `by` or `values` where `attributeName` is `href`. */
function smilTargets(tag, name, value, attrs) {
  if (!SMIL.has(tag) || !['to', 'from', 'by', 'values'].includes(name)) return [];
  const target = attrs().find(([n]) => n === 'attributename');
  if (!target || !/^(?:xlink:)?href$/i.test(target[1].trim())) return [];
  return value().split(';').map((v) => v.trim()).filter(Boolean);
}

/**
 * The address a refresh `<meta>`'s `content` navigates to, or '' when it names none: the HTML
 * "shared declarative refresh steps". A time (digits and dots), then `;`, `,` or space, then
 * the address, which may follow `url=` and may be quoted; the leading space and, in a quoted
 * address, everything after the closing quote is dropped.
 */
function refreshTarget(content) {
  const m = /^[\t\n\f\r ]*[0-9.]*[\t\n\f\r ]*[;,]?[\t\n\f\r ]*(?:url[\t\n\f\r ]*=[\t\n\f\r ]*)?(.*)$/is.exec(String(content));
  if (!m) return '';
  const rest = m[1];
  const q = rest[0];
  if (q === '"' || q === "'") {
    const end = rest.indexOf(q, 1);
    return (end < 0 ? rest.slice(1) : rest.slice(1, end)).trim();
  }
  return rest.trim();
}

/**
 * The edits that swap a media element's refused web addresses for the placeholder: an image
 * keeps a box (the placeholder), a video keeps one through the placeholder poster, and a
 * video, audio or source loses its address. The refused address stays on the element as
 * `data-lattice-web-src`, which is how a host offers to load it.
 */
function mediaEdits(src, t, refuse, edits) {
  const el = t.name;
  const kind = el === 'img' || el === 'image' ? 'image' : 'media';
  let first = null;
  const own = [];
  for (const a of t.attrs) {
    if (a.vFrom < 0 || !MEDIA_FETCH_ATTRS.has(a.name)) continue;
    if ((a.name === 'href' || a.name === 'xlink:href') && el !== 'image') continue;
    const raw = src.slice(a.vFrom, a.vTo);
    if (a.name === 'srcset') {
      const hits = decodeEntities(raw, { attribute: true }).split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean).filter((c) => refuse(c, kind));
      if (!hits.length) continue;
      first ??= hits[0];
      own.push([a.sep, a.to, '']);
      continue;
    }
    const value = decodeEntities(raw, { attribute: true });
    if (!refuse(value, kind)) continue;
    first ??= value.trim();
    // An image's own src goes with the rest below; an SVG image keeps its attribute, pointed at
    // the placeholder; anything else loses it.
    if (el === 'img' && a.name === 'src') continue;
    own.push(el === 'image' ? [a.vq, a.to, `"${WEB_IMAGE_PLACEHOLDER}"`] : [a.sep, a.to, '']);
  }
  if (first === null) return;
  if (el === 'img') {
    // An image whose web `srcset` was refused shows the placeholder too, not the fallback `src`
    // beside it: the first src goes, and the placeholder leads the tag.
    const srcAttr = t.attrs.find((a) => a.name === 'src' && a.vFrom >= 0);
    if (srcAttr) own.push([srcAttr.sep, srcAttr.to, '']);
    own.push([t.nameEnd, t.nameEnd, ` src="${WEB_IMAGE_PLACEHOLDER}"`]);
  }
  if (el === 'video') own.push([t.nameEnd, t.nameEnd, ` poster="${WEB_IMAGE_PLACEHOLDER}"`]);
  // The address, before the tag's end and any whitespace before it.
  const gt = t.end - 1;
  const slash = src[gt - 1] === '/' ? '/' : '';
  let p = gt - slash.length;
  while (p > t.nameEnd && isHtmlSpace(src[p - 1])) p--;
  p = Math.max(p, ...own.map((e) => e[1]));
  own.push([p, t.end, ` data-lattice-web-src="${escapeAttr(first)}"${slash}>`]);
  own.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  edits.push(...own);
}

/**
 * `blockWebImages`' check of its own result where the scanner cannot model the markup, read by
 * a spec parser: every style attribute, every `<style>` element's text (the text the browser
 * builds its sheet from, so a comment or a character reference inside an SVG `<style>` is
 * already gone or decoded) and every media element's fetch attributes, inside `<template>`
 * contents too; with `fonts` (no policy behind the host), every other fetching attribute and
 * paint `url()` as well. Exported for its tests: `blockWebImages` calls it only on markup
 * `scanHtml` flags, which few inputs are. Returns the rewritten markup, or `html` unchanged when the parser finds nothing
 * left to refuse. The parsed document is inert: parsing it fetches nothing.
 */
function verifyWithParser(html, DOMParserImpl, refuse, fonts) {
  const doc = new DOMParserImpl().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  let dirty = false;
  const visit = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const tag = el.localName.toLowerCase();
      if (tag === 'template' && el.content) visit(el.content);
      for (const { name, value } of [...el.attributes]) {
        if (fonts && (nestedDocument(tag, name, () => value) || smilTargets(tag, name, () => value, () => [...el.attributes].map((x) => [x.name.toLowerCase(), x.value])).some((u) => refuse(u, 'media')))) {
          el.removeAttribute(name);
          dirty = true;
          continue;
        }
        if (fonts && otherFetchTargets(tag, name, () => value).filter((u) => refuse(u, 'media')).length) {
          el.removeAttribute(name);
          dirty = true;
          continue;
        }
        if (name !== 'style' && !(fonts && URL_PAINT_ATTRS.has(name))) continue;
        const next = cssWithoutWebUrls(value, refuse, { fonts });
        if (next !== value) {
          el.setAttribute(name, next);
          dirty = true;
        }
      }
      if (tag === 'meta' && (el.getAttribute('http-equiv') || '').trim().toLowerCase() === 'refresh') {
        const target = refreshTarget(el.getAttribute('content') || '');
        if (target && (refuse(target, 'media') || /^[\t\n\f\r ]*(?:data|blob):/i.test(urlAsParsed(target)))) {
          el.remove();
          dirty = true;
          continue;
        }
      }
      if (tag === 'base' && el.hasAttribute('href') && refuse(el.getAttribute('href'), 'media')) {
        el.remove();
        dirty = true;
        continue;
      }
      if (tag === 'style') {
        const text = el.textContent ?? '';
        const next = cssWithoutWebUrls(text, refuse, { fonts });
        if (next !== text) {
          el.textContent = next;
          dirty = true;
        }
      }
      if (!WEB_MEDIA.has(tag)) continue;
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
  };
  visit(doc.body);
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

module.exports = { sampleName, assetName, isDrawnFenceClass, cssEscape, cssString, cssRefSpans, decodeEntities, urlAsParsed, WEB_IMAGE_PLACEHOLDER, webOrigin, blockWebImages, verifyWithParser, withOwnOrigin, blockWebCss, webRefsInCss, webOrigins, VENDORED_SCRIPTS, isVendoredScript, isRemoteUrl, remoteCssRefs, attrIsRemote, remoteRefsInElements, mermaidRemoteRefs, frontMatterRemoteRefs, frontMatterOf, galleryRefusal, FETCH_ATTRS };
