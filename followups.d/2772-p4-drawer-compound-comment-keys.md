---
origin: 2772
priority: P4
recorded: 2026-11-12
area: engine
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md §9
deferred: off-path — the same on main; deciding it means choosing between the engine (first key only) and meta-edit's documented compound-comment editing, which is a design call, not a fix to #3136's code
source: https://github.com/Laticent/lattice/pull/3136
---

# The slide panel reads every key of a several-line directive comment; the engine reads only the first

why now   — found by the checker on #3136 (F4). For `<!--\n_class: light\n_footer: a\n-->` the engine applies only `_class`,
            and its class becomes `light\n_footer: a`; it sets no footer. `readMetaField(…, 'footer')` returns `a`,
            editable, and with another `<!-- _footer: z -->` on the slide it reports a duplicate the engine does not
            see. A note-like `<!-- focus: remember this\nmore text -->` reads `remember this` where the engine reads
            both lines. `lib/core/meta-edit.mjs` documents compound comments as editable ("drop just that key's line").
where     — lib/core/meta-edit.mjs readMetaField (the `probe` carriers), lib/engine's directive comment read
            (lib/core/comment-directive.mjs), lib/core/meta-scan.mjs (agrees with the engine).
done when — the engine and the drawer agree on a several-line comment: either the engine applies every key, or the
            drawer counts only a comment's first key and writes a new comment for any other.
evidence  — render the two inputs above with lib/engine and with readMetaField; the values match.
verify    — tier 1 checker.
