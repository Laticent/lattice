---
origin: 3045
priority: P2
recorded: 2026-11-08
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §How the rule is held
deferred: blocked — the gate's shape is an owner decision: the brief expected about 13 regex copies, and recheck flags 561 literals in lib/**
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
            Recommendation: (b) first on the guards that exist, then (a) once the rewrites have shrunk the table.
done when — the hang guards are gone or each is a recheck assertion with a failing arm; the repo-wide shape is decided.
evidence  — each rewritten pattern: a seeded differential fuzz against the old one, and the old pattern failing its test.
verify    — maker-checker per rewritten shared pattern; npm test under load.
