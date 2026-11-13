---
origin: 3048
priority: P10
recorded: 2026-11-06
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §4
deferred: large — the remaining builders (Print and export via buildSrcdoc, Read Article and the Library art in the page itself) each need their own plumbing, buildSrcdoc's is an export-bytes change that needs owner sign-off, and the in-page two need a page-level policy or a frame
source: https://github.com/Laticent/lattice/pull/3048
---
# A nonce script-src on the other surfaces that render a deck

why now   — the Studio preview frame refuses any script without its nonce (lifecycle note §4,
            "The second wall"). The six other same-origin surfaces still rest on the sanitizer
            alone: byok-key-isolation-surfaces.spec.ts goes red on every one of them with its
            sanitizer call removed.
where     — deck-preview.js buildSrcdoc (PDF capture, Print, the Webpage bake's capture frame, the
            Playground); ReadArticle.tsx (in-page: a page-level policy, or an `<iframe sandbox>` with
            no `allow-scripts`); the Library scene art (in-page innerHTML: or draw it as an
            `<img src="data:image/svg+xml…">`, which never runs script, after resolving its `var()`s).
done      — the Stage (2026-11-08): buildStageDoc carries the page nonce. The exported player needs
            nothing: player-seal.mjs already writes `default-src 'none'; script-src 'sha256-…'`
            before the prune; the Webpage row's leak comes from the capture frame (buildSrcdoc).
done when — byok-key-isolation-surfaces.spec.ts stays green on each surface with its sanitizer
            call removed, as byok-key-isolation.spec.ts does for the Studio preview.
evidence  — the red-arm run, per surface.
verify    — tier 2 trio: a CSP mistake breaks every export.

Correction: the lifecycle note's Stage row lists `img onerror`, after-style and the mXSS nest; a run on
2026-11-08 with the Stage's sanitizer removed showed `script`, `svg-script`, `details-ontoggle` and
`iframe-srcdoc` reading the key instead.

Also: the Studio preview's nonce is per PAGE LOAD and readable (a `<meta>` policy does not hide it),
so a nonce per document would stop a leaked one from helping a later injection. Not for the Stage:
its rewrite keeps the first document's `<meta>` policy on the window (lifecycle note §4). The render
signatures assume byte-identical rewrites of a slide, so that change has to move the nonce out of
what they compare (lifecycle note §4).
