---
group: Lint & audit
---
Check `.pptx` and `.odp` files the way the office export is held to: a `.pptx` against the ISO 29500 schema, the unique-shape-id rule and Microsoft's Open XML SDK validator (needs a .NET SDK; `--no-openxml` skips it), an `.odp` against the package-structure and reference checks. Prints one line per file and the first findings; exits 1 on any. Neither opens PowerPoint, Google Slides or Collabora.
