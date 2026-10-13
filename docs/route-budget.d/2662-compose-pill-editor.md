studio: +1122
playground: +1
Compose gains the pill editor: the notation plugin that draws pills and owns the open editor's range, the pill-sheet that copies the engine's pill rules from the preview frame, the insert door, and `editPill` plus its helpers in the authoring-core bundle (the Playground page imports that bundle too, +1 B gz). The popover and phone sheet (`PillEditor`) load lazily and are not in these figures. CI measured +1122 B gz on the studio route and +1 B on the playground against main.
Given back first: the editor host is a lazy chunk, and the pill drawing reuses the engine's own `lat-pill` rules instead of a second copy of the pill's CSS.
