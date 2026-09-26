---
origin: 2385
priority: P2
recorded: 2026-09-26
---

# Autocomplete the flowchart grammar in the Studio editor

why now   — The owner asked for it on #2385. docs/src/components/studio/editor-complete.ts
            (`makeStudioCompletion`) completes front-matter keys and register values.
            On a flowchart slide it offers nothing: not the shape names already in
            the list, not the arrow forms, not the span words.
where     — docs/src/components/studio/editor-complete.ts; lib/core/flowchart-grammar.js
            (the one source of words: outlines and their aliases, slots, statuses,
            line styles and heads). Completion must read the grammar's tables and
            never keep its own copy (HARD RULE #7's spirit).
done when — On a `flowchart` slide the editor completes:
              - a shape name after an arrow, from the names already in that chart;
              - span words inside a backtick span, both shape words and line words,
                with a one-line description of each;
              - arrow forms after a name.
            The completions come from the grammar's tables, so an alias or word
            added there shows up with no editor change. Driven in the real Studio
            (#23) at desktop width, with a screenshot; e2e coverage per
            engineering/development.md §Studio e2e suite.
evidence  — The owner's review of #2385.
verify    — the Studio, a flowchart slide, typing after `->` and inside a backtick span.
