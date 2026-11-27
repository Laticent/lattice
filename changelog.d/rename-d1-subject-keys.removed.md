- **Breaking:** six deck keys now name what they style: `tag:` is `card-tag:`, `lift:` is `card-lift:`, `corners:` is `slide-corners:`, `rule:` is `heading-rule:`, `headline:` is `headline-align:` and `stamp:` is `stamp-shape:`, and `lint:deck --fix` rewrites an old deck.
- The engine no longer reads the old keys. A deck that still writes one renders that setting's default until
  `lint:deck --fix` renames the line. The lint is an error, `key-renamed`, and every value word stays as it was:
  `lift: on` becomes `card-lift: on`.
- The slide classes follow the keys: `tag-*` is `card-tag-*`, `lifted` / `flat` are `card-lift-on` / `card-lift-off`,
  `corners-*` is `slide-corners-*`, `rule-auto` / `-full` / `-short` / `-accent` are `heading-rule-*`, `head-*` is
  `headline-align-*`, and `stamp-*` is `stamp-shape-*`. `no-heading-rule` and `with-heading-rule` already carried the
  new name, so they stay. Each old class is an `unknown-class` error whose fix writes the new class. The class names
  inside an exported HTML deck change with them; the rendered pixels do not.
- The lint rules follow too: `unknown-card-tag`, `unknown-card-lift`, `unknown-slide-corners`, `unknown-heading-rule`,
  `unknown-headline-align` and `unknown-stamp-shape` replace `unknown-tag`, `unknown-lift`, `unknown-corners`,
  `unknown-rule`, `unknown-headline` and `unknown-stamp`.
- The presets set the new keys: `editorial`, `brand` and `minimal` write `headline-align:`, `heading-rule:`,
  `card-lift:` and `slide-corners:` where they wrote the old ones.
