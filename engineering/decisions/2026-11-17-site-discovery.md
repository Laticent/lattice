---
status: shipped
summary: >
  lattice.style now tells crawlers and agents the same thing its pages do. A filtered sitemap drops the 21
  pages it used to list that are not meant to be found (19 said noindex; two prototypes now do too), every standalone route carries a canonical link and an Open Graph card,
  robots.txt and a 1.6 KB llms.txt router ship from one module (docs/src/lib/discovery.mjs), and a post-build
  gate (docs/scripts/check-discovery.mjs) fails when any of them disagree. A CSP meta tag, an og:image card
  and per-page Markdown twins were weighed and left out, with the reason for each.
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

## 3. What was left out, and why

- **A Content-Security-Policy `<meta>` tag.** GitHub Pages cannot send headers, so a meta tag is the only
  route. But the site runs inline boot scripts on most routes, sandboxed preview frames with their own policy
  (`docs/src/playground/preview-csp.js`), Web Workers and the user's own OpenRouter key. A site-wide policy
  strict enough to matter needs a per-route inventory of every script, frame and fetch origin, and a wrong
  one breaks the Studio silently for whoever hits the path it missed. That is its own change with its own
  e2e evidence, not a rider here. The sandboxed frames, which run untrusted deck content, already carry one.
- **A referrer meta tag.** `strict-origin-when-cross-origin` is already every current browser's default, so
  the tag would change nothing.
- **`og:image`.** A link preview needs a raster card designed for it (link unfurlers mostly refuse SVG). The
  site has none, and a placeholder is worse than no image.
- **Markdown twins of every docs page.** 32 of the 58 docs pages are MDX, and their raw source is component
  calls, not readable Markdown. The twin that matters to an agent, `/components.md`, already ships and is in
  `llms.txt`.

## 4. Secrets on a public static site

GitHub Pages serves every file in `docs/dist`. The existing gates already cover the two secrets the site
could leak: `checkOpenRouterBudget` (HARD RULE #24) keeps our OpenRouter key out of `docs/**`, and
`check-key-chunk.mjs` keeps a visitor's own key name out of the shipped HTML. This change adds no new
secret and no new path into `dist/`.
