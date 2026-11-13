---
origin: 3058
priority: P2
recorded: 2026-11-08
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §7
deferred: large — a correct deadline needs every direct-key faculty to stream (theme, finish, drawing, component, the Architect's deck edits, chat compaction), with mid-stream errors surfaced where today only HTTP status is read, and the e2e provider mocks moved to SSE
source: https://github.com/Laticent/lattice/pull/3084
---
# Bound how long the Studio waits for a provider that does not answer

why now   — a live run on 2026-11-08 (3058-p1) saw Gemini hold requests to an overloaded model for
            minutes, then answer 503 or 429 or drop the connection. The author sees a spinner and
            no word. The owner asked for a 60 s limit with a plain message, and ruled that the
            Studio NEVER falls back to another model on its own.
what was learned — a first-byte deadline built on 2026-11-08 was pulled before it shipped. Every
            faculty except chat calls `complete` without `onToken`, so the request is
            `stream: false` and the response headers arrive only when the whole reply is done; a
            60 s cap killed a healthy long reply (a Sonnet component near 8,192 tokens, a deck
            rewrite) the same as a held one (checker, 2026-11-08; probe: a 61 s mocked reply → 504).
            A held request sends no headers either way: a streamed request to an overloaded Gemini
            model got 0 bytes in 120 s, while a working one answers in about 1 s.
how       — stream every direct request internally (pass a no-op `onToken`), keep the first-byte
            deadline (`FIRST_BYTE_MS`, 60 s) on headers, surface an `error` object that arrives
            inside the stream for every caller (today only tool calls throw on one), and keep
            reading a plain-JSON reply when a provider ignores `stream`. The 504 sentence for
            model-error.ts: "<Provider> did not answer in time — send again, or pick another model
            in Workspace → AI." Never switch models on the author's behalf.
where     — docs/src/components/studio/ai/direct-providers.js (openaiComplete, anthropicComplete),
            docs/src/components/studio/model-error.ts, docs/e2e/byok-direct-providers.spec.ts mocks.
            Decide whether the OpenRouter path (architect-model.js) gets the same bound.
done when — a held request fails at 60 s with that sentence on every faculty, a healthy reply
            longer than 60 s completes, and the caller's cancel still stops a stream in progress.
evidence  — fake-timer unit tests for all three (no wall clock, HARD RULE #32), each red with its
            piece removed; one live run per provider.
verify    — tier 1, maker-checker.
