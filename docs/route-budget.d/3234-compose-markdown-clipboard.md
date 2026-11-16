studio: +23
playground: +12
Compose's Markdown clipboard and the clean Markdown export. The clipboard, the paste check and the front-matter merge all load lazily (the merge in its own chunk, front-matter-merge.ts, so front-matter.ts gives back the 239 bytes an earlier commit added); what reaches the eager islands is the lazy chunks' names in the import map (+12 on each island, +9 in architect) and the Share menu's longer Markdown row text (+2).
