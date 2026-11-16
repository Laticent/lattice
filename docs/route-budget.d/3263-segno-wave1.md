studio: +3170
playground: +2550
home: +1020

What grew, as CI measured it against main (studio +3068, playground +2448, home +917; each line carries about 100 bytes
of margin for CI's variation). The Studio's notes, `describe:` and `say:` editors now find a slide's comments from the
deck model instead of a fence scan of their own, with markdown-it's answer for a comment in a table row (+608, in
slide-directives). The deck model records where a `$$` rule's memo is held, so a math deck splices instead of parsing
from nothing on every keystroke (+130 slide-boundaries, +46 state-facade). The Studio's front-matter reader takes a
leading BOM as part of the block and its writers keep it in front (+117 front-matter). The front-matter register grammar
(item 4) generates its line parser into front-matter-keys.mjs (+1531, in the front-matter-key chunk) and its fence parser
into front-matter-fence.mjs (+624); the fence is all the docs home page loads, the key reader only the Studio and the
Playground. It gave back first, from +2.7 KB: shared rules for the six copies of a loop, the fence kept out of the line
parser, one error label, the lint-only block-scalar regex moved to lib/authoring, and smaller drivers. All of it is
Studio, editor and register-reader code the routes load at startup. The owner raised studio's ceiling by 2 KB for it
(#3264, #3267).
