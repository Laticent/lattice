studio: +133
The chat's speech preview reads four small helpers (whether a slide is hidden, its spoken line, the
deck's front-matter say: map and its plugin off-list) that already live in the Studio's startup code;
the eager `architect` chunk now exports them to the lazy chat chunk. The new tools themselves,
find_text, replace_text and the term reports, all load lazily with the chat.
Given back first: +601 on the Studio and +598 on the home page, which came from reaching those helpers
through dynamic import() (a module already in an eager chunk then ships its whole export table up
front), and from term reports read off the cadenza package; both now load the cheap way.
