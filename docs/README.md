# Lattice documentation site

The public docs site for Lattice, built with [Astro Starlight](https://starlight.astro.build)
and deployed to GitHub Pages at <https://laticent.github.io/lattice/>.

## Local development

```sh
cd docs
npm install
npm run dev      # http://localhost:4321/lattice/
```

## Structure

- `src/content/docs/` — the pages (intro, getting started, guides, reference).
- `src/styles/lattice.css` — Lattice branding (indaco accent, the engine's fonts).
- `astro.config.mjs` — `site` + `base` (`/lattice`), sidebar, theme.
- `scripts/sync-portal.mjs` — copies the generated plain-Markdown
  component reference (`../dist/docs/components.md`) into `public/` before
  each build, so it ships as a static download at `/lattice/components.md`.
  It is generated from the component manifests by
  `tools/build-docs-portal.js` in the repo root.
- `src/pages/components/` — the browsable component reference: an index
  (`index.astro`) and a per-component page (`[bucket]/[name].astro`) built
  from the same manifests, each with a live preview, an in-browser editor,
  and the full anatomy/slots/variants documentation.

## Deploy

`.github/workflows/docs.yml` builds this site and publishes it to Pages
on every push to `main` that touches `docs/` or the generated
portal. The repo's Pages source must be set to **GitHub Actions**
(Settings → Pages → Build and deployment → Source).
