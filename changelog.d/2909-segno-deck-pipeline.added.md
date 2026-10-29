- **Segno can cap a parse's tree, label node kinds with roles, and report facts about a
  parse.** A grammar's `maxNodes` stops a parse with `code: 'nodes'` instead of growing its tree
  without limit; `node(kind, x, { role })` labels a kind, exposed as `grammar.roles` and a
  generated `ROLES` table; and `facts(spec, input, result)` reports which cap a parse hit, the odd
  characters in the input (NUL, lone surrogates, bidi controls, zero-width and C1 characters, a
  bare CR, a BOM) and the ranges no node covers. A grammar that uses none of these generates the
  same parser as before.
- **Fixed: the `ci` check no longer passes a test tier that was cut off on the PR's current
  commit.** A shard stopped by its own timeout or by hand used to read green, because a
  cancelled tier was always taken for a run superseded by a newer push. The gate now reads the
  PR's head and lets a cancelled tier pass only when a newer push replaced the run.
