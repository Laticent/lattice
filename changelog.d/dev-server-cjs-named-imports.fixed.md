- **Fixed: the docs dev server (`npm run dev`) now runs the Studio's webpage export and the
  Compose view.** Both imported named exports from CommonJS files under `lib/`, which the dev
  server cannot serve. The export's diagram bake failed, so every Mermaid diagram shipped as raw
  source, and Compose failed to load at all. Each import is now a default import, and a docs unit
  test fails on the named shape. The built site was never affected.
