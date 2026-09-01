- The docs site's dev dependency tree now resolves `brace-expansion` at 1.1.18, picking up the v1
  backports for CVE-2026-13149 and GHSA-mh99-v99m-4gvg. It reaches the tree only through
  `minimatch`, so nothing the Lattice package ships changes; the bump landed by hand because
  Dependabot's own PR for it (#1489) has been unable to regenerate itself since 2026-08-10.
