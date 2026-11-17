---
status: shipped
summary: >
  lattice.style now tells crawlers and agents the same thing its pages do. A filtered sitemap drops the 21
  pages it used to list that are not meant to be found (19 said noindex; two prototypes now do too), every standalone route carries a canonical link and an Open Graph card,
  robots.txt and a 1.6 KB llms.txt router ship from one module (docs/src/lib/discovery.mjs), and a post-build
  gate (docs/scripts/check-discovery.mjs) fails when any of them disagree. The sitemap carries each page's
  last content commit, every content page has a Markdown copy at its own path plus `.md`, and the 78
  pages that cannot build a preview frame carry a strict, hash-based CSP; the frame pages are stage 2.
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
- **`/robots.txt`** is one group for every crawler: `Allow: /` and the sitemap. Googlebot, Bingbot, GPTBot,
  ClaudeBot and PerplexityBot all read `User-agent: *`, so a per-bot group with the same rules adds nothing.
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
  stylesheet) moves no date, which is what Google asks lastmod to track. A depth-1 checkout
  would date every page to its one commit, so `docs.yml` and `docs-preview.yml` now check out
  full history without file contents (`fetch-depth: 0`, `filter: blob:none`): measured 19 MB and
  about 3 to 5 s, plus 0.4 s for the one `git log` pass. Every other build is shallow and omits
  lastmod entirely. The gate holds it all-or-nothing: with history every URL must carry the
  computed date, and without it none may carry one.

- **A strict Content-Security-Policy on the 78 routes that cannot build a preview frame**
  (owner call, 2026-11-17: stage it). GitHub Pages cannot send headers, so it is a `<meta>` tag,
  written by `docs/scripts/csp.mjs` after every other step that rewrites HTML, so its hashes are
  of the bytes that ship. Measured before choosing that design:
  - Astro 7's own `security.csp` does not hash `is:inline` scripts (every route has three or
    more), is computed before our post-build steps rewrite the HTML, and on the landing page
    put the tag where the browser ignored the whole policy.
  - A slide preview is a same-origin `srcdoc` frame, which inherits its parent's policy, and
    the engine writes inline scripts into it at run time with per-deck values. Under a strict
    policy the Playground preview rendered blank. So a page that can build a frame (its HTML
    names the runtime, or a module it can load, statically or dynamically, contains `srcdoc`)
    gets no policy for now: 125 of 203 routes. Moving the frame scripts into files is stage 2,
    `followups.d/3277-p1-csp-frame-pages.md`. (The question put to the owner said "about 100"
    frame-free pages; the measured number is 78.)
  - The policy: scripts from our origin plus the hash of each inline script, nothing else (no
    inline handlers, no eval); images, fonts, media and fetches from our origin plus `data:`/
    `blob:`; no frames, no plugins; `base-uri` and `form-action` our origin. Styles allow
    inline: Radix's dialog scroll lock injects a `<style>` carrying the visitor's measured
    scrollbar width, which no hash can match, and blocking it lets the page scroll behind every
    open dialog. A nonce is a public constant on a static site. What injected CSS could do is
    read the page through selectors and leak it in a `url()`, and the image, font and fetch
    rules close every such channel.
  - Two things on those pages broke under the policy and are fixed at the source: the header's
    palette-label rules were a `<style>` a script built at run time (now a static `is:inline`
    element above the header, same paint order), and the offline page hid a missing logo with
    an inline `onerror` (now inline SVG, so it needs no cached asset).
  - `e2e/site-csp.spec.ts` loads every policy page and fails on any `securitypolicyviolation`,
    and drives search (Pagefind, whose load failure the menu swallows silently), the palette
    label and the mode toggle on Chromium at desktop and phone width, WebKit and Gecko.

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
