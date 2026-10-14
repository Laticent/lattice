- Every inline kind that takes a record has one more spelling, `` `@kind{…}` ``, the form plugins will use for
  their own inline syntax: `` `@icon{database}` `` is `` `^{database}` ``, `` `@avatar{Ada Okafor}` `` is
  `` `!{Ada Okafor}` ``, `` `@spark{12 14 17}` `` is `` `~{12 14 17}` ``, and `` `@pill{LIVE}` `` is `` `{LIVE}` ``.
  The short forms stay, and both spellings draw identically. `@` without a brace right after the name
  (`` `@ada` ``, `` `@laticent/segno` ``) is still plain code.
- In the Studio editor, typing `` `@ `` lists every inline kind with its short form, and inside `@kind{` the menu
  offers what the short form offers (spark types, pill shapes, icon names).
- `lint:deck` warns on `@name{…}` when no kind is called `name` (`unknown-inline-kind`), with a one-click fix to
  the nearest kind, and its pill, spark, icon and spelling checks read the `@kind{…}` spelling too.
- A plugin from a zip can bring its own inline kinds: its manifest declares them under `contributes.inline`, and a deck
  that lists the plugin calls one as `` `@kind{…}` ``. The plugin's code draws each span in the same sandbox as its
  fence, after you approve it (`lattice packages trust`, or Approve in the Studio). Until the deck lists the plugin, the
  Studio shows a small chip where each span is; a span that cannot draw stays as code, and the Studio or the CLI says
  why.
