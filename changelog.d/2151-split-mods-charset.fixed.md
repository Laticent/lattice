- `data-split-mods` admits only CSS-identifier tokens. The value is an attribute, and its source
  is a class attribute in rendered HTML, so a token carrying markup characters is DROPPED rather
  than escaped — a value that cannot contain a quote is not a sink at all, where an escape is
  only as good as its last-touched regex. It is also exactly what the value is for: a token has
  to be a valid CSS identifier for `[data-split-mods~="x"]` to be worth writing. Flagged by
  CodeQL (`js/incomplete-html-attribute-sanitization`) on this branch's first push.
