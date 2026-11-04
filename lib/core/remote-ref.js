/**
 * Does a piece of MARKUP from someone else reach the network when it renders?
 *
 * ONE predicate for the two places a stranger's package carries markup rather than CSS
 * (engineering/decisions/2026-09-23-portable-packages.md §10, the P1 follow-up):
 *   - a component's sample slide (`gallery.md`), which becomes the user's own deck content
 *     on Insert. The import gates RENDER it through the engine and read the result with
 *     `remoteRefsInHtml` (this file's `scanHtml`, refusing where it is unsure): the CLI in
 *     `lib/cli/gallery-gate.js`, the Studio in `docs/src/components/studio/library/gallery-gate.ts`.
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
 * engine's output is what the browser will actually load, so the scan reads that and nothing
 * else, with the tokenizer `scanHtml` follows, and refuses where tree construction could differ.
 *
 * WHAT "REMOTE" MEANS HERE, and why it is looser than `css-scan.js` `urlIsLocal`. That one
 * holds a component's STYLESHEET to `#fragment` and `data:` only, because a stylesheet has no
 * use for any other target. Markup does: a relative `logo.png` resolves against the page that
 * shows it (the Studio's own origin, or the deck's folder in the CLI) and so reaches nobody a
 * stranger controls. So a target is remote when it names a SCHEME other than `data:`, or is
 * protocol-relative (`//host`, and the `\\host` spellings a URL parser folds into it).
 *
 * A CommonJS module whose every dependency is a require-free sibling (`media-sources.js`, the policy
 * table `content-policy.js`, and the generated readers): the docs site default-imports it onto the
 * Studio's eager path (docs/src/plugins/vite-cjs-lib-dev.mjs, which inlines those siblings in dev),
 * where every byte counts against the budget.
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

// The shared readers (the CSS and HTML readers, the entity decoder, the Mermaid reading) live in web-ref-readers.js, where
// the linter's S2 rules read them without this scanner (security spine S2). Re-exported below under the names they had.
const { cssEscape, cssString, cssRefSpans, cssDeclSpans, remoteCssRefs, mermaidRemoteRefs, decodeEntitiesMapped, decodeEntities, ASCII_NAMED, scanHtml, rawTextEnd, refreshTarget } = require('./web-ref-readers.js').makeWebRefReaders({
  isRemoteUrl: mediaSources.isRemoteRef,
  ...require('./css-token-readers.js'),
  makeCssRefSpans: require('./css-ref-reader.js').makeCssRefSpans,
  cssParser: require('./css-ref.generated.js'),
  makeScanHtml: require('./html-ref-reader.js').makeScanHtml,
  rawTextEnd: require('./html-ref-reader.js').rawTextEnd,
  htmlParser: require('./html-ref.generated.js'),
});

// The attribute sets (which name an address, which fetch on render, which on a click) are the security spine's
// policy table, where the linter's S2 rules will read them too (lib/core/content-policy.js; 2026-11-03-security-findings-spine.md §2).
const { FETCH_ATTRS, RENDER_FETCH_ATTRS, HREF_FETCH_TAGS, CLICK_FETCH_ATTRS, WEB_MEDIA, MEDIA_FETCH_ATTRS, URL_PAINT_ATTRS, SMIL, VENDORED_SCRIPTS, isVendoredScript, isAddressString } = require('./content-policy.js');

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
 * (lib/plugins/drawn.generated.mjs): this file is a CommonJS module the Studio bundles, and the
 * registry's data is an ES module. `test/unit/core/drawn-fence-copy.test.js` fails the day a registry fence is missing
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

// VENDORED_SCRIPTS and `isVendoredScript`, the scripts a sample slide may load, come from the policy table
// (content-policy.js, above), where the linter's `stripped-markup` rule reads them too.


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

// `webOrigin`, "which site does this address load from?", lives in the address table (media-sources.js), where the
// linter's `web-image` rule reads it without this scanner (security spine S1).
const { webOrigin } = mediaSources;

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
// rewrite reads tags with a parser generated from lib/core/html-ref-grammar.js (Segno R3), which follows the
// HTML tokenizer (the WHATWG standard, §13.2.5) for what decides where a tag, an attribute, a comment
// or raw text ends, in one linear pass; the reader in html-ref-reader.js keeps the foreign-content
// stack, the open integration points and the raw-text search. The hand-written scanner it replaced is
// frozen in tools/segno-legacy/scan-html-fixed.js, and test/unit/core/html-ref-differential.test.js holds
// the two to the same tags (engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §R3).

const isHtmlSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';

// The raw-text elements whose text the browser decodes (RCDATA). The others' text is as written.
const RCDATA = new Set(['title', 'textarea']);

/**
 * Every remote fetch target in rendered MARKUP, read by `scanHtml`: the gallery gate's reader, in the CLI
 * (`lib/cli/gallery-gate.js`) and the Studio (`library/gallery-gate.ts`) alike. Each tag becomes the element
 * `remoteRefsInElements` judges: names lowercased, values decoded once (as the browser reads an attribute),
 * and `text` the body of a raw-text element.
 *
 * FAILS CLOSED where the reader is unsure (D7 of 2026-10-27-segno-reports-facts-callers-decide.md): a span
 * the tree builder may read differently (foreign content holding HTML, `<select>`, `<noscript>`, an escaped
 * script, a comment that never ends) is a refusal of its own, so no parser is asked and none is needed.
 *
 * A DIAGRAM is the one element whose text is not a raw-text body: the runtime draws an element whose class
 * names Mermaid from its text content. The reader builds no tree, so it reads that text only where it is
 * exact (`diagramText`), and refuses the rest.
 * @param {string} html
 * @returns {string[]}
 */
function remoteRefsInHtml(html) {
  const src = String(html ?? '');
  const n = src.length;
  const { tags, unsure } = scanHtml(src);
  // One finding per reason, naming where the first one starts so the author can find it.
  const first = new Map();
  for (const u of unsure) if (!first.has(u.why)) first.set(u.why, u.from);
  const out = [...first].map(([why, at]) => `policy:markup a browser may build differently from how the check reads it (${why}, at character ${at})`);
  const elements = tags.map((t, i) => {
    const attrs = t.attrs.map((a) => [text(a.name), a.vFrom < 0 ? '' : text(decodeEntities(src.slice(a.vFrom, a.vTo), { attribute: true }))]);
    // A raw-text element's text as the browser reads it: as written, or decoded in RCDATA. `<plaintext>` runs to the end.
    const body = t.body || (t.name === 'plaintext' ? [t.end, n] : null);
    if (body) return { tag: text(t.name), attrs, text: text(RCDATA.has(t.name) ? decodeEntities(src.slice(body[0], body[1])) : src.slice(body[0], body[1])) };
    if (!isDrawnFenceClass(attrs.find(([k]) => k === 'class')?.[1])) return { tag: text(t.name), attrs, text: '' };
    if (!MERMAID_HOSTS.has(t.name)) {
      out.push(`policy:a <${t.name}> marked as a Mermaid diagram (only a <code>, <pre> or <div> may be one)`);
      return { tag: text(t.name), attrs, text: '' };
    }
    const read = diagramText(src, tags, i);
    if (read === null) out.push(`policy:a <${t.name}> diagram holding markup other than text and <span>s`);
    return { tag: text(t.name), attrs, text: read ?? '' };
  });
  // The concrete constructs first: the gate names the first finding, and "a data: source" tells an author more
  // than "markup a browser may build differently".
  return [...remoteRefsInElements(elements), ...out];
}

// The tokenizer reads a NUL as U+FFFD. (CR is left as written: every reader downstream takes it as a newline.)
const text = (s) => s.replace(/\0/g, '\uFFFD');

/**
 * Text in the data state as the tree builder keeps it: a NUL dropped (in body it is never inserted), and
 * references decoded. A legacy name with no `;` decodes in text even where a letter follows it (`&ltimg` is
 * `<img`), which `decodeEntities` does not read, so those are expanded first. That can read a longer
 * entity's name as its legacy prefix (`&ltimes;`), which adds text, the safe direction for a refusal.
 */
const dataText = (s) => decodeEntities(s.replace(/\0/g, '').replace(/&(AMP|amp|GT|gt|LT|lt|QUOT|quot)(?=[A-Za-z0-9])/g, (m, n) => ASCII_NAMED[n]));

/**
 * The text content of the diagram host `tags[i]` (a `<code>`, `<pre>` or `<div>`, the hosts the runtime draws),
 * or null where the reader cannot know it exactly. Known exactly: holding text and `<span>`s, balanced,
 * up to its own end tag. That is what a fence renders (`<code class="language-mermaid">` with highlight.js
 * spans). Anything else is refused. A comment or end tag of another name changes what the text is; and the
 * tree builder can CLONE a formatting element such as `<code>`, class and all, around later text when an
 * ancestor closes it early (`<span><code class=mermaid></span>text`), which balanced spans rule out.
 */
function diagramText(src, tags, i) {
  const host = tags[i];
  const close = new RegExp(`</${host.name}(?=[\\t\\n\\f\\r />]|$)`, 'i');
  const parts = [];
  let depth = 0;
  let at = host.end;
  for (let j = i + 1; ; j++) {
    const next = j < tags.length ? tags[j].from : src.length;
    let gap = src.slice(at, next);
    const end = close.exec(gap);
    if (end) gap = gap.slice(0, end.index);
    for (const m of gap.matchAll(/<\/span[\t\n\f\r ]*>|</gi)) {
      if (m[0] === '<' || --depth < 0) return null;
    }
    parts.push(gap.replace(/<\/span[\t\n\f\r ]*>/gi, ''));
    if (end) return depth === 0 ? dataText(parts.join('')) : null;
    if (j >= tags.length || tags[j].name !== 'span') return null;
    depth++;
    at = tags[j].end;
  }
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
    // A drawn diagram carries `xmlns="http://www.w3.org/2000/svg"`: a namespace name the browser never fetches, which this scan read as
    // a web image on every deck with a diagram ("3 web images from http://www.w3.org were left out").
    const body = decodeEntities(html2.slice(t.end, closers[c])).replace(/\bxmlns(?::[\w-]+)?\s*=\s*(["'])[^"']*\1/gi, ' ').replace(/[<>]/g, ' ');
    for (const u of new Set(mermaidRemoteRefs(body))) if (!u.startsWith('policy:')) refuse(u, 'diagram');
  }
  return { html: html2, blocked };
}

// WEB_MEDIA, MEDIA_FETCH_ATTRS, URL_PAINT_ATTRS, SMIL, RENDER_FETCH_ATTRS, HREF_FETCH_TAGS and CLICK_FETCH_ATTRS come from the
// policy table (content-policy.js, above), where the linter's S2 rules read them too.

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
  // A stray `<body>` or `<html>` start tag in the markup (`<table><td><body background=…>`) gives its
  // attributes to the page's own body or root, which `visit` never reaches: they are not descendants, and
  // `innerHTML` does not carry them. Inserted into a document, the tag does the same there, so the address
  // loads. The parse here starts from a bare `<body>`, so any attribute on either came from the markup:
  // the result is re-serialized from the body's content, which leaves the stray tag's attributes behind.
  for (const el of [doc.documentElement, doc.body]) {
    if (!el.attributes.length) continue;
    for (const { name, value } of [...el.attributes]) for (const u of otherFetchTargets(el.localName, name, () => value)) refuse(u, 'media');
    dirty = true;
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

module.exports = { sampleName, assetName, isDrawnFenceClass, cssEscape, cssString, cssRefSpans, cssDeclSpans, decodeEntities, decodeEntitiesMapped, urlAsParsed, WEB_IMAGE_PLACEHOLDER, webOrigin, blockWebImages, verifyWithParser, withOwnOrigin, blockWebCss, webRefsInCss, webOrigins, VENDORED_SCRIPTS, isVendoredScript, isRemoteUrl, remoteCssRefs, attrIsRemote, remoteRefsInElements, mermaidRemoteRefs, frontMatterRemoteRefs, frontMatterOf, galleryRefusal, FETCH_ATTRS, isAddressString, scanHtml, remoteRefsInHtml };
