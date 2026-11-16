studio: +23
playground: +13
Compose's Markdown clipboard and the clean Markdown export. The clipboard, the paste check and the front-matter merge all load lazily (the merge in its own chunk, front-matter-merge.ts, so front-matter.ts gives back the 239 bytes an earlier commit added). CI measured the growth in the eager StudioIsland (+12), PlaygroundIsland (+13) and architect (+9) chunks, most likely the new lazy chunks' names in the import map (inferred from which chunks grew, not measured), and in share-menu (+2), the Markdown row's longer text.
