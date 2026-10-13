studio: +515
playground: +1
The inline-code dispatcher ships in the Studio and Playground runtimes. It gained a first-character
table of the kinds worth asking, a `probe` / `explain` flag on each kind's `resolve` / `diagnose`, and
two one-entry memos whose results are frozen. Not given back: the old per-kind loop is gone but
the new code is a little larger than it. The bytes buy a dispatcher that reaches no kind for
ordinary code (149 ns to 37 ns a span) and a backslash escape that no longer builds a 173 µs
"did you mean" message to decide whether to strip a character.
