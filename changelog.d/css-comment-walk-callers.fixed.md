- A theme whose `:root` selector carries `/*` inside an attribute string (for
  example `:root[data-x="/*"], :root:root`) now resolves its tokens by the right
  specificity. `rootSpecificity` in `lib/theme/parse.js` stripped comments with a
  regex that read that `/*` as an opener and dropped the rest of the selector list.
  It and the CSS minifier (`tools/minify-css.js`) now use the shared comment walk in
  `lib/core/css-comments.mjs`. Every shipped CSS bundle is byte-identical.
