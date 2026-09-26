---
origin: 2385
priority: P2
recorded: 2026-09-26
---

# Accept the everyday names for flowchart shapes

why now   — The owner's idea, raised on #2385. The grammar knows eight outline words
            (`:box` `:square` `:pill` `:diamond` `:circle` `:cylinder` `:io` `:doc`).
            Authors reach for the thing's name instead: database, repository,
            process, decision, junction, fork, middleware. Today those are unknown
            words.
where     — lib/core/flowchart-grammar.js (the span-word table), lint-core.js
            (`findFlowchartIssues`), flowchart.docs.md, and the Studio autocomplete
            (the editor follow-up).
done when — Each outline has a curated alias set, and every alias resolves in lint and
            render alike. A proposal to confirm with the owner:
              - cylinder: database, db, repository, store, datastore
              - box: process, service, step, middleware
              - diamond: decision, junction, fork, gateway
              - pill: start, end, terminal
              - io: input, output
              - doc: document, report
            The table lives in the grammar, never in two places. An alias that could
            mean two shapes is left out. The self-healing half: an unknown word
            gets a lint suggestion naming the nearest outline or alias ("did you mean
            `:database`?"). The chart still draws, as a box. The docs list the table.
evidence  — The owner's review of #2385.
verify    — node --test test/unit/core/flowchart-grammar.test.js; lint:deck on a deck
            that uses every alias.
