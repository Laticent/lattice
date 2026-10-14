- Every inline kind that takes a record has one more spelling, `` `@kind{…}` ``, the form plugins will use for
  their own inline syntax: `` `@icon{database}` `` is `` `^{database}` ``, `` `@avatar{Ada Okafor}` `` is
  `` `!{Ada Okafor}` ``, `` `@spark{12 14 17}` `` is `` `~{12 14 17}` ``, and `` `@pill{LIVE}` `` is `` `{LIVE}` ``.
  The short forms stay, and both spellings draw identically. `@` without a brace right after the name
  (`` `@ada` ``, `` `@laticent/segno` ``) is still plain code.
- In the Studio editor, typing `` `@ `` lists every inline kind with its short form, and inside `@kind{` the menu
  offers what the short form offers (spark types, pill shapes, icon names).
- `lint:deck` warns on `@name{…}` when no kind is called `name` (`unknown-inline-kind`), with a one-click fix to
  the nearest kind, and its pill, spark, icon and spelling checks read the `@kind{…}` spelling too.
