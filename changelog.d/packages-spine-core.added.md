- **Added: the package spine (`lib/packages/`).** One shape for themes, components,
  finishes and motion: a folder named for the item, a `<name>.manifest.json` that
  owns the name, and role files named `<name>.<role>`. The build now discovers
  themes and components through it, writes one generated index
  (`lib/packages/packages.generated.json`), and fails when a package's folder or
  file names disagree with its manifest — for every kind, not only themes. Component
  manifests may now carry `"type": "component"` and `"format": 1`.
