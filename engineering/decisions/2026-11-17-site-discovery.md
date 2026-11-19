---
status: shipped
summary: >
  lattice.style now tells crawlers and agents the same thing its pages do. A filtered sitemap drops the 21
  pages it used to list that are not meant to be found (19 said noindex; two prototypes now do too), every standalone route carries a canonical link and an Open Graph card,
  robots.txt and a 1.6 KB llms.txt router ship from one module (docs/src/lib/discovery.mjs), and a post-build
  gate (docs/scripts/check-discovery.mjs) fails when any of them disagree. The sitemap carries each page's
  last content commit, every content page has a Markdown copy at its own path plus `.md`, and the 75
  routes whose code a strict policy cannot break carry a strict, hash-based CSP; the rest are stage 2.
  A shared link shows a social card drawn from real engine renders.
---

# Site discovery: sitemap, canonical, robots.txt, llms.txt (2026-11-17)

Issue #3207 asked for the docs site to be easier to find for search engines and AI agents, and safe as a
static site. This note records what the built site carried before, what changed, and what was left out.

## 1. What the built site carried before

Measured on `docs/dist` from `main` (`5c4be2f`), 220 HTML files:

| Signal | Before |
|---|---|
| `sitemap-index.xml` | Present (Starlight adds `@astrojs/sitemap`), 202 URLs, **19 of them pages that say `noindex`**: the 14 library demo shells, `/gift/`, two of the four `/proto/` routes, the two Vetrina fixtures. A sitemap that lists a noindex page sends a crawler two opposite instructions. The other two `/proto/` routes are throwaway prototypes that said nothing; this change marks them noindex too, so 21 URLs leave the sitemap. |
| `<link rel="canonical">` | Only on Starlight docs pages. **Missing on every standalone route**: the landing page, `/features/`, `/comparison/`, `/studio/`, `/playground/`, all 80 component pages, every `/plugins/` and `/libraries/` page. `ComponentsLayout`, `CatalogLayout` and `/comparison/` already computed the URL, but only for `og:url`. |
| Open Graph | Missing entirely on the landing page, `/features/`, `/studio/`, `/playground/`. |
| `robots.txt` | None. |
| `llms.txt` | None. `2026-09-05-agent-kit-by-destination.md` §4 deferred it until the kit could be served from the domain, "as a router of ~2 KB, not an index". The domain now serves it. |
| JSON-LD | Already on 139 content pages (`ArticleSchema`, from the reader-mode work). Unchanged. |
| Headings, viewport, `lang` | One `<h1>` per content page. The pages without one are redirect stubs and `/studio/`, an app shell whose `<h1>` arrives on hydration (axe already checks it there). `/features/` looked like two, but the second is the text `<h1>` inside an HTML comment. Nothing to fix. |

## 2. What changed

- **One module, `docs/src/lib/discovery.mjs`**, holds the noindex list (`isIndexable`), the canonical-URL
  helper, and the text of `robots.txt` and `llms.txt`. The sitemap filter, both endpoints and the gate import
  it.
- **The sitemap is ours, filtered.** `astro.config.mjs` declares `@astrojs/sitemap` itself, which stops
  Starlight adding its unfiltered copy, and filters with `isIndexable`. 202 URLs became 181.
- **`components/site/PageMeta.astro`** emits the canonical link, `og:type`, `og:site_name`, `og:title`,
  `og:description`, `og:url` and `twitter:card` for every route that writes its own `<head>`. It replaced the
  partial sets in `ComponentsLayout`, `CatalogLayout` and `/comparison/`, and was added to the landing page,
  `/features/`, `/studio/` and `/playground/`.
- **`/robots.txt`** lets every crawler fetch everything (`User-agent: *`, which Googlebot, Bingbot, GPTBot,
  ClaudeBot and PerplexityBot all read) and names the sitemap. One named group: Googlebot and Bingbot are kept
  off `/*.md$`, because the Markdown copies exist for agents, cannot carry a canonical link or a noindex,
  and would otherwise sit in search results beside the pages they copy (review finding). AI crawlers can
  still read them. `/playground/v/` stays allowed for them (the longer rule wins): the Playground fetches
  deck samples as `.md` at run time. This stops crawling, not linking: a search engine can still list a
  blocked URL it finds linked, with no snippet.
  A preview should not be indexed, because it competes with the real page. The PR previews are built in
  GitHub Actions with `CF_PAGES` unset (`2026-07-01-docs-pr-preview.md`), so their `robots.txt` is the
  production one; what keeps them out is a `/* X-Robots-Tag: noindex` rule in `docs/public/_headers`, which
  only Cloudflare reads. `robots.txt` still answers `Disallow: /` for a build `deploy-env.mjs` calls a
  preview, which covers a future Cloudflare-built preview.
- **`/llms.txt`** is an 11-link router (1,629 bytes) to the pages an agent needs to write a deck, plus the
  agent kit on the `dist-kits` branch. It points at `/components.md`, the whole component reference as plain
  Markdown, which the site already built.
- **Two prototypes and the offline page now say `noindex`.** `/proto/anima/` and `/proto/css3d-pie/` were
  the only `/proto/` routes without it; `/offline/` is the service worker's fallback.
- **The gate**, `docs/scripts/check-discovery.mjs`, runs in the docs `build` script after `astro build`
  (139 ms on this sandbox). It fails when a page's `noindex` and `isIndexable` disagree, when the sitemap and the
  indexable pages differ, when an indexable page lacks a canonical link, description or `og:title`, when
  `robots.txt` names a sitemap that was not built, or when an `llms.txt` link is dead or the file passes
  4 KB. Its first run caught `/playground/`, which this change had missed.

- **`lastmod` from git history** (owner call, 2026-11-17). Each sitemap URL carries the date of
  the last commit to the page's main-content source (`docs/src/lib/lastmod.mjs`): a docs page's
  `.md`/`.mdx` file, a component page's component folder, a catalog page's `content/catalog`
  file, a standalone route's own `.astro` file. Shared chrome (a layout, the header, a
  stylesheet) moves no date, which is what Google asks lastmod to track. Review found two
  corrections, both in: machine renders never move a date (27 of 52 component folders had last
  been touched by the nightly golden bless, which re-commits their PDFs), and `/components/` is
  dated by the whole catalog it renders, not by its page file. A standalone route is dated by
  its own page file, so a `<head>` edit moves it too: there, the page and its content are one
  file. A page with no commit yet (a new page on a local build) gets no date and a warning. A depth-1 checkout
  would date every page to its one commit, so `docs.yml` and `docs-preview.yml` now check out
  full history without file contents (`fetch-depth: 0`, `filter: blob:none`): measured 19 MB and
  about 3 to 5 s, plus 0.4 s for the one `git log` pass. Every other build is shallow and omits
  lastmod entirely. The gate holds it all-or-nothing: with history every URL must carry the
  computed date, and without it none may carry one.

- **A strict Content-Security-Policy on 75 of the 203 routes** (owner call, 2026-11-17: stage
  it). GitHub Pages cannot send headers, so it is a `<meta>` tag, written by
  `docs/scripts/csp.mjs` after every other step that rewrites HTML, so its hashes are of the
  bytes that ship. Measured before choosing that design:
  - Astro 7's own `security.csp` does not hash `is:inline` scripts (every route has three or
    more), is computed before our post-build steps rewrite the HTML, and on the landing page
    put the tag where the browser ignored the whole policy.
  - Three kinds of page get no policy yet, because it would break them. Stage 2 is
    `followups.d/3277-p1-csp-frame-pages.md`.
    - **frame (125):** a slide preview is a same-origin `srcdoc` frame, which inherits its
      parent's policy, and the engine writes inline scripts into it at run time with per-deck
      values. Under a strict policy the Playground preview rendered blank. A page is a frame page
      when its HTML names the runtime, or a module it can load (statically or dynamically)
      contains `srcdoc`.
    - **eval (1, Calco):** HarfBuzz's Emscripten bindings build functions from strings through
      an alias, so the PPTX export hung at "Embedding fonts…" (1 s and 3 fonts without the
      policy). A page is an eval page when its code contains a direct `eval(`/`Function(` (the
      `Function("return this")` globalThis fallback, which never runs in a browser, excluded), or
      loads a module on `INDIRECT_EVAL_CHUNKS`. Every build prints each non-frame exempt page and
      its reason, so a page that loses its policy is visible.
    - **network (2, Cadenza and Suono):** their voice code calls OpenRouter and Google on the
      visitor's key and imports a model runtime from esm.run. Every outside origin found in code
      a policy page can load must be on `RUNTIME_ORIGINS` (the page is exempt) or
      `LINK_ONLY_ORIGINS` (a string never fetched), or the build fails, so a new one is a decision.
  - The question put to the owner said "about 100" policy pages; the measured number is 75.
  - The policy: scripts from our origin plus the hash of each inline script, plus
    `'wasm-unsafe-eval'` (WebAssembly compiles; JS eval stays blocked); images, fonts, media and
    fetches from our origin plus `data:`/`blob:`; no frames, no plugins; `base-uri` and
    `form-action` our origin. Styles allow inline: Radix's dialog scroll lock injects a `<style>`
    carrying the visitor's measured scrollbar width, which no hash can match, and blocking it
    lets the page scroll behind every open dialog. A nonce is a public constant on a static site.
    What injected CSS could do is read the page through selectors and leak it in a `url()`, and
    the image, font and fetch rules close every such channel.
  - Two things on policy pages broke and are fixed at the source: the header's palette-label
    rules were a `<style>` a script built at run time (now a static `is:inline` element above
    the header, same paint order), and the offline page hid a missing logo with an inline
    `onerror` (now inline SVG, so it needs no cached asset).
  - Script hashes come from a parse5 parse of each page, not a pattern: CodeQL flagged the first
    version's end-tag regex, and a hash of the wrong bytes blocks the script it should allow.
  - `e2e/site-csp.spec.ts` loads every policy page; drives search (Pagefind, whose load failure
    the menu swallows silently), the palette label and the mode toggle; and presses every control
    on every library demo with a policy (60+), on Chromium, WebKit and Gecko, failing on any
    `securitypolicyviolation`. Loading alone missed the Calco and voice breaks the first review
    found; the press-everything test catches the Calco one when its exemption is removed. A
    second review found that test's first wait was no wait (`networkidle` returns at once on an
    idle page), so a late violation could be lost: it now reports violations out of the page as
    they happen, presses a fixed list of controls, and after each waits until the control is
    usable again and no request is in flight.

- **CSP stage 2: the preview-frame pages** (stage 1's `followups.d/3277-p1-csp-frame-pages.md`; what is left is
  `followups.d/3277-p1-csp-remaining-pages.md`). 198 of 204
  routes now carry the policy, up from 75. Measured first, in Chromium, WebKit and Gecko, with a
  page under `script-src 'self'`:

  | frame | same-origin `<script src>` | inline script | own policy kept |
  |---|---|---|---|
  | `srcdoc` | runs | refused | n/a |
  | `srcdoc`, `sandbox="allow-scripts"` | runs | refused | n/a |
  | `data:` or `blob:`, sandboxed | n/a | refused | no: it inherits too |
  | loaded from a same-origin URL, sandboxed | n/a | runs by its own hash | yes |

  A same-origin worker inherits nothing either: `new Function` ran in all three.
  - **The preview agents are one file.** The font gate, the geometry, the fit, the link guard,
    the Drawing-Board sync and the Stage's reveal and fit used to be written inline into each frame,
    some with per-deck values. They now live in `lib/core/frame-agents.mjs`, which the asset sync
    writes as `lattice-frame-agents.js` beside `lattice-runtime.js`. A builder writes
    `<script src="…/lattice-frame-agents.js" data-agent="fit" data-gap="16">`; the file runs the
    agent its tag names and reads the per-deck values from the tag's data. Classic `src` scripts run
    in document order, so every ordering rule (the gate in `<head>`, dagre before the runtime) holds.
    The three builders (`deck-preview.js`, `single-slide-render.ts`, the Stage) write no inline
    script. `frame-agents.test.ts` parses `buildSrcdoc`'s and the Stage's documents and fails an
    inline one; the single-slide builder's document is internal to its host, so `site-csp.spec.ts`
    is its guard (an inline script put back there turned the component-page cell red).
  - **The two sandboxes load through a shell.** The code-package runner and the draw host build a
    whole document with its own strict policy and the hash of its one script, and function-plot's
    frame needs `'unsafe-eval'`, which no page policy grants. As `srcdoc` both were refused. The frame
    now loads `lattice-sandbox.html` (`lib/packages/sandbox-shell.mjs`) from beside the runtime; the
    shell writes the host's document into itself with `document.open`/`write`, and that document's
    own policy then applies on top of the shell's. Measured in all three engines: the hashed script
    runs, an unhashed one is refused, a `fetch` is refused, a module from the named directory loads.
    WebKit needs `*` in the shell's `script-src` for the module case. The frame keeps
    `sandbox="allow-scripts"` and the same window, so the hosts' `e.source` checks are unchanged.
    **The shell guards itself**, because it is a public file any site can frame. Review found the
    first version wrote whatever document a framing page sent, so a foreign page's script ran on our
    origin (reproduced in all three engines; with the guards the same probe writes nothing). It now
    acts only in an opaque document (`self.origin === "null"`: sandboxed without
    `allow-same-origin`) and only on a document sent from our own origin (`e.origin ===
    location.origin`). A red-team pass (2026-11-19) added a third: the shell writes only a document that
    OPENS with its own policy (`SHELL_DOC_PREFIX`), because one without would run under the shell's
    policy alone, which admits a script from any host; that reached an outside server in all three
    engines, though neither host writes such a document. The same pass found that author markup could
    shadow `document.currentScript` with a named element and pick an agent's data; the sanitizer strips
    the name, and the agents file now reads the real getter and runs only for a real `<script>`.
    **Only a page with a policy uses it**: a page without one (the Studio today)
    writes `srcdoc` as before, because the shell is a navigation the service worker never sees (it
    does not control an opaque-origin frame), so offline it lasts only as long as the HTTP cache.
  - **Per-page allowances instead of exemptions.** An outside origin a page's code calls now joins
    exactly the directive that call needs (`ORIGIN_DIRECTIVES`): the video players
    (`www.youtube-nocookie.com`, `player.vimeo.com`, `www.instagram.com`, `www.tiktok.com`) in
    `frame-src`, TikTok's oEmbed lookup and OpenRouter and Gemini in `connect-src`. A page whose code
    can open the sandbox shell gets `frame-src 'self'`; every other page keeps `'none'`. Style adds
    `blob:`: the single-slide preview shares its engine sheet as a blob URL, and WebKit checks it.
  - **Evaluation that never runs is not counted**, each by its exact shape: the `function-bind`
    polyfill, JSZip's `setImmediate` string callback, and CodeMirror's Pug syntax probe (inside a
    `try`; under the policy the attribute keeps plain highlighting).
  - **The site's own origins sit beside `'self'`** (`selfOrigins`, added 2026-11-19). Every e2e
    cell above ran with the service worker blocked, which hid a Gecko defect: once `public/sw.js`
    controls a page (from a visitor's second page on), Firefox matched a srcdoc preview's inherited
    `'self'` wrongly for anything the worker answered, refused the frame's runtime, agents file and
    fonts, and the preview fell back to the default serif. Naming `https://lattice.style` and
    `https://*.lattice-docs-5ji.pages.dev` explicitly is what Gecko matches (5 refusals to 0 on the
    same page). The wildcard covers only our own Cloudflare Pages project. A local build adds its
    origin with `--self-origin=` (`build:e2e`). The tag grew by about 410 bytes;
    `getting-started`, the tightest budgeted policy page, keeps about 1 KB under its ceiling.
  - **A floor.** `MIN_POLICY_PAGES` (198) fails the build when a page silently loses its policy:
    an exemption is computed, so a new import can strip one.
  - **What still has no policy, and why** (every build prints the list; the follow-up carries it):
    the Studio and `/proto/chat-figures/` (the export player writes inline scripts into its capture
    and prune frames); Calco (`woff2-encoder`'s Emscripten bindings build functions from strings;
    the fix is the subsetter in a same-origin worker, measured to work above); Cadenza and Suono
    (`esm.run` serves runtimes whose own requests, models and wasm from other hosts, are not yet
    measured: `OPEN_ORIGINS`); and the landing page, held by name (`HELD_ROUTES`) because the policy
    tag is about 1,460 bytes and the page's HTML sits 52 bytes under its 121,924-byte `htmlRaw` hard
    ceiling (measured 2026-11-19), so the policy would put it about 1.4 KB past. The ceiling is the
    owner's number.
  - **The e2e reads refusals from every frame and from the console.** With an inline script put
    back into the single-slide preview, WebKit fired `securitypolicyviolation` in the frame;
    Chromium and Gecko refused the script, printed the refusal and fired nothing. An event-only
    reader stayed green over that, so `site-csp.spec.ts` also counts the browser's own refusal
    messages.

- **A Markdown copy ("twin") of every content page** (`docs/scripts/md-twins.mjs`, 177 pages):
  every page that declares itself an article (docs pages, component pages, catalog pages,
  `/comparison/`) gets `<path>.md`, linked from its `<head>` as `<link rel="alternate"
  type="text/markdown">`, and `llms.txt` links the copies. App shells get none: a copy of the
  Studio would be a list of button labels.
  - A component page's copy is its `<name>.docs.md`, verbatim: the canonical agent doc
    (HARD RULE #6).
  - Every other copy is made from the BUILT page, not the source. 32 of the 58 docs pages are
    MDX, whose components (the front-matter table, the form diagrams, 38 live CraftLabs) are
    calls, not text; the built page is what a reader sees. The converter keeps `<main>`, drops
    interface (navigation, buttons, the contents list, hidden and screen-reader-only text,
    React's `<!-- -->` separators), keeps each code block's language, writes a definition list
    as `**term:** value` bullets and a card title as a heading, and turns each CraftLab island,
    whose props Astro serializes onto it, into the CSS and Markdown it would show.
  - `md-twins.mjs --check` fails a missing copy, a copy with no heading, or HTML comments or
    interface markup in its prose (code is exempt: a deck sample is full of `<!-- _class -->`).
    A sweep of all 91 non-component copies found no "Section titled", "Copy", pagination or
    contents-list text.
  - Review found two defects in the first version, both fixed and both now tested: a rule that
    spaces side-by-side items (so a row of tags does not read as one word) also ran inside code,
    where the items are one line's highlight tokens, and turned `"name":` into `" name " :` in 38
    copies; and the component copies kept 472 repo-relative links that 404 on the site.
    `rebaseLinks` now resolves each against its source file (another component's doc becomes its
    `.md` copy; anything else becomes the file on GitHub), and `--check` fails a relative link
    left in prose. The same fix went into `sync-portal.mjs`: the long-served `/components.md` had
    about 160 dead links of the same kind.

- **A social card** (`docs/public/og/lattice.png`, 1200×630 PNG, 93 KB), drawn by
  `tools/make-og-card.js` from the brand lockup, the landing page's promise and three slides
  the engine rendered (the committed showcase rasters), so a shared link shows the product.
  One card for the site: a per-page card is 181 images to keep current, for a preview that
  mostly shows the page title beside it anyway. `OgImage.astro` emits `og:image` with its
  size and alt text in both heads (PageMeta and DocsHead), and every page's `twitter:card` is
  `summary_large_image`. No `twitter:image`: X reads `og:image` when it is absent, and every
  byte is on every page, while the landing page's HTML sits about 1 KB under its route-budget
  ceiling. The gate reads the PNG's own header, so a re-draw at another size fails.

## 3. What was left out, and why

- **A referrer meta tag.** `strict-origin-when-cross-origin` is already every current browser's default, so
  the tag would change nothing.

## 4. Secrets on a public static site

GitHub Pages serves every file in `docs/dist`. The existing gates already cover the two secrets the site
could leak: `checkOpenRouterBudget` (HARD RULE #24) keeps our OpenRouter key out of `docs/**`, and
`check-key-chunk.mjs` keeps a visitor's own key name out of the shipped HTML. This change adds no new
secret and no new path into `dist/`.
