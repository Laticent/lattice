---
origin: 3045
priority: P2
recorded: 2026-11-08
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §How the rule is held
deferred: large — part (a) shipped (the ratchet); part (b), draining a backlog of 689 slow literals in 186 files, is many PRs of rewrites, each with its own fuzz
---

# Replace the regex hang guards with recheck, and decide the repo-wide gate's shape

why now   — About twenty tests still guard a regex against backtracking with a wall-clock bound marked `flaky-ok`
            (`grep -rn "flaky-ok: hang guard" test`). Each is F4 by design and flaky in principle. `recheck` (exact pin
            4.6.2, owner-approved, ~67 MB with its native binary) decides a pattern's complexity from the automaton
            (`checker: 'automaton'`), so a test can ask "is every regex this input runs linear?" without a clock.
where     — the hang-guard tests (masthead-lift, meta-record, front-matter-scalar, lift-bracket-span, …); the patterns
            they execute; `lib/**` for a repo-wide check.
how       — what a 2026-11-08 scan of `lib/**` found (TypeScript-parsed regex literals, `checkSync`, automaton):
            561 `vulnerable: polynomial`, 1 exponential (`lib/packages/npm-plugin-loader.js:56`), 15 `unknown: timeout`
            at 10 s, 126 `unknown: unsupported` (backreferences, lookarounds). lint-core.js holds 94 of them,
            chart-narration.js 53, carousel.js 37. Most are the unanchored `\s+x` shape: quadratic only on a long run of
            the leading class. A verdict costs 0.5 to 3.4 s, and a timeout verdict depends on the machine, so a gate must
            not use one.
            Options for the owner: (a) a ratchet in check-ownership, a committed verdict table keyed on source + flags so
            only new literals are checked, held exactly like flaky-test-baseline.json; (b) test-scoped only: a helper
            runs a test's hostile input, collects the regexes executed, and asserts each is `safe` (the masthead path
            alone runs the shared tag tokenizer `<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, which recheck
            flags, so (b) still means rewriting shared patterns); (c) keep the hang guards and close this.
            DECIDED 2026-11-08 (owner, D1 on #3092): B-then-A. First (a), the ratchet: a check-ownership rule over
            every regex literal in lib/**, a committed verdict table keyed on source + flags so only new or changed
            literals are checked, no timeout verdicts (deterministic recheck limits; an undecidable pattern carries a
            written reason, like `flaky-ok`), and recheck installed in its own pinned folder like test/fixtures/marp-cli
            so the root `npm ci` does not carry its 67 MB. Then (b) drains the table folder by folder, lint-core first,
            and each drained pattern retires its wall-clock hang guard.
progress  — 2026-11-08 (zero-flakes part 3): part (a) shipped. `checkRegexCensus` holds lib/** to tools/regex-census.json
            in build:check; recheck 4.6.2 is pinned in tools/recheck/ (pure-JS backend, about 12 MB); the writer is
            `npm run regex:census`. Part (b) started: `test/helpers/regex-trace.js` (`assertLinearRegexes`) replaced 10
            of the 20 hang guards (meta-record, bracket-list, chart-values-numeric-pill, lift-bracket-span,
            front-matter-scalar, codeql-1958, render-target-keys, deck-front-matter-settings, video-providers,
            lattice-doc). Drained: the fence opener (lib/core/fence-opener.js, 8 copies in lib/core and lint-core) and
            lift-bracket-span's paragraph scan, each with a seeded differential fuzz and a mutation arm.
            The 10 guards left, and what the trace found on each path:
            · slide-camera-faces (2): `/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g` (slide-camera.mjs:254) is polynomial
              ('var(---,' repeated). Fix: run it only on the value up to its last `)`, where `,[^)]*` always finds
              one; recheck still calls the pattern polynomial, so that one needs a regex-ok and an `allow` reason.
            · chart-narration (1): `/%%\{[\s\S]*?\}%%/g` and `/!?\[([^\]]*)\]\([^)]*\)/g` polynomial, plus
              markdown-it's own patterns (a dependency's: `allow` each with recheck's verdict).
            · closed-comments (1): a fence pattern with a back-reference (unknown), the autolink pattern
              (polynomial) and a tag pattern with a look-ahead (unknown), on findSkeletonHtml's path.
            · masthead-lift (1), chart-row-record (3), relationship-scaling (2, test/benchmark): not traced yet.
            The backlog went from 699 literals in 191 files to 689 in 186; lint-core from 93 to 92 (the fence opener). The video plugin's copy of the fence opener
            (lib/plugins/video/shared/fences.js) stays: a plugin imports nothing from lib/core.
            Admitted with --raise on the rebase onto main f13a118: three patterns #3089 (agenda autofill) added after
            the census snapshot, all `unknown` (a back-reference or a look-ahead recheck cannot model):
            lint-core.js:8176 and :8177, agenda-autofill.js:242. They were already on main; the next drain owes
            each a linear rewrite or a written proof. Backlog after the rebase: 693 literals in 187 files.
            On the rebase onto main 4e2a419 (the queue ejected #3097 for this): two more from #3095,
            progress.transform.js:253 (back-reference, unknown) and :391 (an h1-h6 pair with a lazy body, polynomial).
            Backlog now: 697 literals in 187 files.
            The census cannot certify a look-around (recheck cannot model one), so a pattern made linear by a
            look-behind or an atomic-group look-ahead carries its proof in writing: `// regex-ok:` on its line, and
            the same reason in the test's `allow`.
            2026-11-09 (zero-flakes part 4, owner D1): the pre-commit job `regex-census-recheck` re-decides each
            verdict the staged table adds or changes against HEAD (`node tools/regex-census.js --staged`), so a
            hand-typed verdict no longer passes. A planted `"safe"` on a polynomial pattern failed the commit in 1.04 s.
            2026-11-09 (part 4, P2): seven of the ten hang guards retired (slide-camera-faces 2, relationship-scaling
            2, chart-narration 1, closed-comments 1, masthead-lift 1). Each path's slow patterns became linear readers,
            each held to its old pattern by a seeded differential fuzz (seed 3045) with a mutation arm:
            fontFaceRules/replaceVarRefs (slide-camera.mjs), firstClause/dropTrailingPunct/closePunctGaps
            (relationship.js), stripMdLinks/stripMermaidDirectives (chart-narration.js), replaceFencedBlocks/
            replaceAutolinks/skeletonTags (layout/gate.js), attrRunReader (new lib/forms/cell/masthead/attr-run.js, the footer-cell
            walk in masthead.transform.js). Backlog 697 -> 675. LEFT: chart-row-record's 3 guards. They run all of
            lint and render: about 120 patterns recheck does not call safe, about 25 of which read the hostile input
            (lint-core's caption/say/fence/list scans, markdown-it's own, the engine's tag walkers). They retire with
            the lint-core drain, not one at a time.
            2026-11-09 (part 4, P3): the five patterns admitted with --raise in #3097 are drained: lint-core's agenda
            fence and html-block strippers (stripAgendaFences, stripAgendaHtmlBlocks), agenda-autofill's class-directive
            rewrite (replaceClassDirective), and progress.transform.js's class attribute (two alternatives instead of a
            back-reference) and first-heading read (firstHeadingInner). Each is held to its old pattern by a seeded
            fuzz (test/unit/core/agenda-progress-readers.test.js) and to linear work by scanWork
            (test/unit/core/linear-readers-work.test.js). Backlog 675 -> 670.
            2026-11-12 (flaky tests, unit tier): notes-core's five hang guards retired (test/unit/authoring/
            notes-core.test.js now asserts `assertLinearRegexes` plus a work count). Drained on that path: the
            run-time COMMENT_SOURCE (`CommentScan`, a seeded fuzz in notes-comment-reader.test.js), `/[\r\n]+$/` x3
            (`withoutEol`), the heading/rule back-reference (three alternatives, `safe`); and slice-equivalence-core's
            quote-aware tag strip (`stripTags`). Each with a mutation arm.
done when — the ratchet holds lib/** to its table in build:check; the table and the hang guards are gone, or each
            remaining entry carries its reason.
evidence  — each rewritten pattern: a seeded differential fuzz against the old one, and the old pattern failing its test.
verify    — maker-checker per rewritten shared pattern; npm test under load.

2026-11-21 — PR 3 scope (owner's B covers every author-input path; the flake desk's plan): drain the rest of the
            heatmap render hang guard's path (test/unit/core/chart-row-record.test.js, "the stamped-cell rewrite stays
            linear"), then retire that guard and its flaky-ok. Traced with `traceRegexes` on the guard's input (2,000
            `<td`) at claude/regex-drain-render 1ec2ee4, which is PR 2: the table walkers, the code-only paragraphs and
            the tag tokenizers are already done there. Left, 16 the census calls slow:
              `\s+#.*$` (core/hide-directive.mjs:22, core/meta-keys.mjs:84 and :96) · `^(['"])(.*)\1$` (the same three,
              and export/marp-bundle-html.js:275) · `[*_]{1,3}(?=\S)([\s\S]*?\S)[*_]{1,3}` (core/table-row-label.js:118)
              · the bounded tag head `<!--|<(\/?)([a-z][a-z0-9-]*)\b(?:…){0,4000}>` (core/chart-rows.js:389) ·
              `<code>([\s\S]*?)<\/code>` (core/carousel.js:210, :343, :347; heatmap.transform.js:222) · `\.?0+$`
              (chart-family/shared/cartesian.js:862) · `<h2[^>]*>[\s\S]*?<\/h2>` (core/premise.js:20,
              core/split-panels.js:108, flowchart.transform.js:206, state-chart.transform.js:271) ·
              `\s*<footer\b[\s\S]*?<\/footer>\s*$` and `<p([^>]*)>([\s\S]*?)<\/p>\s*$` (transformers/chart-frame.js) ·
              masthead.transform.js:321 (already `regex-ok`, anchored) · `<section\b[^>]*\sclass="([^"]*)"`
              (transformers/inline-run.js:19, label-set-key.js:74 and :146) · `\sdata-lattice-hidden\s*=\s*(["'])true\1`
              (core/hidden-slides.mjs:13) · `<section\b[^>]*>` (core/image-aspect.js:159, engine/index.js:118) ·
              `<svg\b(?:…)*>` and `<(?!\/)([a-zA-Z][\w-]*)\b(?:…)*>` (core/svg-a11y-names.js:124 and :158) ·
              `(?<!\s)\s+data-debug(?:="[^"]*")?` (engine/index.js:307).
            And 27 the census does not hold: markdown-it's own block and inline rules (third-party: census `allow`
            with the reason, or a replacement only where a measured hostile input hangs) and patterns built at run
            time (each named in `allow` with why it is safe, or rewritten).
