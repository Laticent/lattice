studio: +80
playground: +4
The Compose editor now reads a cell's leading marker through the Segno list-text grammar
(`lib/core/cell-marker-edit.mjs`): two new rules, `edit` and `escaped`, in the generated parser
the Studio already ships, plus the 40-line reader module (+61 B gz against main as CI measures it;
+80 covers gzip variation). Given back first: the editor's four regular expressions are gone, and
narration's `spoken` rule left the same parser.
The playground's +1 B is the shared generated parser's new rules on a route that only reads it
lazily; +4 covers gzip variation, as earlier declarations here do.
