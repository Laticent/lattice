- **Breaking:** the Mermaid plugin's kernels moved from `lib/integrations/mermaid/` to
  `lib/plugins/mermaid/shared/` — the init directive, the render worker, portrait reorientation,
  the motion roles and the overlong-label guard. Code that required one through the package's `./lib/*` export by its old
  path must use the new one; no deck changes.
- A shipped plugin may carry an in-tree-only `shared/` folder of modules, and the package
  walk now refuses any other subfolder in a package of a kind that carries no assets (plugin,
  finish, motion), where it used to pass unseen.
