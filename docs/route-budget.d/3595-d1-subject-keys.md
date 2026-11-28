studio: +196
playground: +73
home: +124
Renames D1: six keys and their classes gain their subject (`card-tag`, `card-lift`, `slide-corners`, `heading-rule`, `headline-align`, `stamp-shape`), so every string in the settings table, the key list and the Studio's catalogs that names one is longer, and the table carries six retired rows beside the new ones. No code is added; the old-field message table moved out of the eager `meta-door` into lint. Given back in the same PR: the Playground passes its lint vocabulary as one JSON string instead of a structured prop, which takes ~8KB off its raw HTML.
