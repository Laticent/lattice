- **Added: the docs site tells Chrome and Edge's reading modes that a content page is
  an article.** Those reading modes run the DOM Distiller, which reads both `og:type`
  and schema.org `Article` markup; the site emitted no JSON-LD anywhere, and its 71
  component pages emitted neither signal despite being ordinary prose. One shared
  `ArticleSchema` component now renders the record on every Starlight docs page, every
  component page and `/comparison` — 111 of 128 built pages. App shells, redirects and
  the marketing pages are deliberately left out: a shell that claims to be an Article
  invites a reading mode onto a page with no prose in it. Firefox's Reader View reads
  neither signal, so this changes nothing for shake-to-summarize.
