- **Security: DOMPurify 3.4.11 → 3.4.16 and esbuild 0.28.0 → 0.28.1.** The sanitizer behind
  the Studio's slide preview and the caption projection takes its upstream patch releases,
  which Dependabot's security PR (#1497) could not land because the bump changes three
  committed export bundles. Those bundles are rebuilt here.
