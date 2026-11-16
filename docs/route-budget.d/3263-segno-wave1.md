studio: +1000
playground: +390
home: +390

What grew, as CI measured it against main (studio +908, playground +293, home +293; each line carries about 100 bytes
of margin for CI's variation). The Studio's notes, `describe:` and `say:` editors now find a slide's comments from the
deck model instead of a fence scan of their own, with markdown-it's answer for a comment in a table row (+608, in
slide-directives). The deck model records where a `$$` rule's memo is held, so a math deck splices instead of parsing
from nothing on every keystroke (+130 slide-boundaries, +46 state-facade). The Studio's front-matter reader takes a
leading BOM as part of the block and its writers keep it in front (+117 front-matter). All three are Studio and editor
code the routes load at startup.
