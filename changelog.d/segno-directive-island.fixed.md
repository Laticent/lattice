- **The linter and the editor's completion now find directive comments exactly where the renderer does.** They read the
  deck model's comment blocks instead of running a line scan of their own. A directive in a multi-line comment
  inside a blockquote or list item (`> <!--` / `> _class: kpi` / `> -->`) is now found, as the renderer always
  applied it. A `<!--` line inside an HTML block such as `<div>` is no longer taken for a directive. And an
  unclosed comment in a list item no longer hides every directive below it. A comment inside the front matter is
  no longer listed as one: the renderer reads only the front matter's keys.
- **The deck model no longer drops a token's number when its tape grows.** On a large deck, the parse that grew
  the tape could lose a comment block's mark, a fence's marker length or a heading's level for the one token
  pushed at that moment. A run of unclosed comments also no longer costs one scan of the rest of the deck per
  comment: 20,000 of them took 5.3 s and now parse about as fast as the renderer's own parser does.
