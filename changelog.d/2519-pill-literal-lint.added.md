- A backslash before a broken pill (`\{A|B}`, the escape `pill-literal` suggests) now keeps the
  literal text without leaving a visible backslash, as it already did for a broken spark. Braces
  that belong to another language (a backslash inside them, a regex interval like `{2,3}`, a
  `{{template}}`) are not pill attempts and keep every character as written.
