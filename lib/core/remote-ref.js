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
 * A dependency-free CommonJS leaf: the docs site default-imports it onto the Studio's eager
 * path (docs/src/plugins/vite-cjs-lib-dev.mjs), where every byte counts against the budget.
 */

/** A URL as the URL parser reads it, lowercased. */
function urlAsParsed(raw) {
  // A URL parser drops tab and newline anywhere and C0 controls or spaces at either end,
  // so `ht\ttps://` and ` //host` are what the browser fetches. Match what it does.
  return String(raw ?? '')
    .replace(/[\t\n\r]/g, '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the URL parser strips them, so must we.
    .replace(/^[\u0000-\u0020]+/, '')
    .toLowerCase();
}

/**
 * Is this URL a network fetch to somewhere other than the page's own origin?
 * @param {string|null|undefined} raw  an attribute value or url() target, entities decoded
 */
function isRemoteUrl(raw) {
  const s = urlAsParsed(raw);
  if (/^[/\\]{2}/.test(s)) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(s);
  return !!scheme && scheme[1] !== 'data';
}

/** One CSS escape at `s[i]` (a backslash): `[decoded, nextIndex]`. `\75 ` is `u`, `\:` is `:`. */
function cssEscape(s, i) {
  const hex = /^[0-9a-fA-F]{1,6}[ \t\n\r\f]?/.exec(s.slice(i + 1, i + 8));
  if (hex) {
    const cp = Number.parseInt(hex[0], 16);
    return [cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '�', i + 1 + hex[0].length];
  }
  return [s[i + 1] ?? '', i + 2];
}

/**
 * The remote targets in a piece of CSS: every string token (which covers `url("…")`,
 * `image-set("…")`, `src("…")` and `@import "…"`) and every unquoted `url(…)`, read with a
 * tokenizer rather than regexes so that a comment inside a string, a `)` inside a string and
 * an escaped `u\72l(` all mean what they mean to the browser. A remote string that is not a
 * fetch (`content: "https://…"`) is reported too: the safe direction, and rare.
 * @param {string} css  an inline `style`, a presentation attribute, or a `<style>` body
 * @returns {string[]}
 */
function remoteCssRefs(css) {
  const s = String(css ?? '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? s.length : end + 2;
    } else if (c === '"' || c === "'") {
      let v = '';
      i++;
      while (i < s.length && s[i] !== c && s[i] !== '\n') {
        if (s[i] === '\\') {
          const [d, n] = cssEscape(s, i);
          v += d === '\n' ? '' : d;
          i = n;
        } else v += s[i++];
      }
      i++;
      if (isRemoteUrl(v)) out.push(v);
    } else if (/[A-Za-z_\\-]/.test(c)) {
      let name = '';
      while (i < s.length && /[A-Za-z0-9_\\-]/.test(s[i])) {
        if (s[i] === '\\') {
          const [d, n] = cssEscape(s, i);
          name += d;
          i = n;
        } else name += s[i++];
      }
      if (s[i] === '(' && name.toLowerCase() === 'url') {
        i++;
        while (/[ \t\n\r\f]/.test(s[i] ?? '')) i++;
        if (s[i] === '"' || s[i] === "'") continue; // a string: the branch above reads it
        let v = '';
        while (i < s.length && s[i] !== ')') {
          if (s[i] === '\\') {
            const [d, n] = cssEscape(s, i);
            v += d;
            i = n;
          } else v += s[i++];
        }
        if (isRemoteUrl(v.trim())) out.push(v.trim());
      }
    } else i++;
  }
  return out;
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
 * The scripts a sample slide may load: Lattice's own vendored builds, by file name, behind any
 * run of `./` and `../` and an optional `dist/` (and Mermaid's published build, below). The names are the ones `lib/core/marp-bundle.js`
 * `RUNTIME_SCRIPT_SRCS` emits, plus the unminified runtime the diagram gallery loads; a unit test
 * (`test/unit/core/gallery-remote-refs.test.js`) fails if that list grows a name this one lacks.
 * Copied rather than required, because this file is a dependency-free leaf the Studio bundles.
 */
const VENDORED_SCRIPTS = Object.freeze(['mermaid-v11.min.js', 'lattice-dagre.min.js', 'lattice-runtime.min.js', 'lattice-runtime.js']);
// `node_modules/mermaid/dist/mermaid.min.js` is Mermaid's own published build, the path a deck in
// a development tree loads it by (test/integration/baseline-decks/gallery.md does).
const VENDORED_SCRIPT_RE = new RegExp(`^(?:\\.{1,2}/)*(?:(?:dist/)?(?:${VENDORED_SCRIPTS.map((n) => n.replace(/[.]/g, '\\.')).join('|')})|node_modules/mermaid/dist/mermaid\\.min\\.js)(?:[?#].*)?$`);

/** Is this (already parsed) script reference one of the vendored builds? */
function isVendoredScript(ref) {
  return VENDORED_SCRIPT_RE.test(String(ref).trim());
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
    // `language-mermaid` as a SUBSTRING, the runtime's own selector (lib/runtime), so an info
    // string like `mermaid-x` that the runtime would still draw is scanned too.
    if (/language-mermaid|(?:^|\s)mermaid(?:\s|$)/i.test(get('class'))) out.push(...mermaidRemoteRefs(el.text));
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

module.exports = { VENDORED_SCRIPTS, isVendoredScript, isRemoteUrl, remoteCssRefs, attrIsRemote, remoteRefsInElements, mermaidRemoteRefs, frontMatterRemoteRefs, frontMatterOf, galleryRefusal, FETCH_ATTRS };
