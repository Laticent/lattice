studio: +870
playground: +1
The Studio's live lint is lint-core, and it now carries the code and compare-code pane rows under
two- and three-line headings, glossary's and list-tabular's rows at their wrap step and under an
eyebrow, list-tabular's `fixed` row, and the character-length reader for those two (+870 B gz against main as CI measures it; +799 against this branch's base 4ce0d29).
Given back first: compare-code's rows ride the existing `code` shape, and the eyebrow-plus-callout
pair is stored only where it was measured (list-tabular).
The playground's +1 B is measured against main; against 4ce0d29 the same build measured −3 B, so it is gzip variation, not a change the PR makes to that route.
