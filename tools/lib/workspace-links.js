/**
 * Link a second checkout's OWN workspace packages into its node_modules, under the names ITS package.json files declare.
 *
 * Two tools build another tree beside this one and borrow this repo's third-party node_modules:
 * `tools/render-identity.mjs` (the base the render is compared against) and `tools/squadra/reference-tree.js` (main's
 * lint-core). Both used to copy this repo's `node_modules/@laticent/*` links, which name the packages as THIS tree calls
 * them. Across a rename that breaks the other tree: after `@laticent/segno-markdown` became `@laticent/segno-languages`,
 * a base tree from before the rename imported a name no link carried (ERR_MODULE_NOT_FOUND). Reading the names from the
 * other tree's own workspaces keeps each tree's imports and links in step, whichever side of a rename it is on.
 *
 * @param {string} tree the other checkout's root
 * @returns {Set<string>} the package names it linked
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function linkOwnWorkspaces(tree) {
  const nm = path.join(tree, 'node_modules');
  const linked = new Set();
  const { workspaces } = JSON.parse(fs.readFileSync(path.join(tree, 'package.json'), 'utf8'));
  // Fail loudly on a shape this does not read: linking nothing would surface later as an ERR_MODULE_NOT_FOUND that
  // names a package, not this function. The repo's root is an explicit list of scoped packages; a change to that is
  // a change to this.
  if (!Array.isArray(workspaces)) throw new Error(`linkOwnWorkspaces: ${tree}/package.json has no "workspaces" array`);
  for (const rel of workspaces) {
    if (rel.includes('*')) throw new Error(`linkOwnWorkspaces: ${tree}/package.json lists a glob workspace (${rel}); list each folder`);
    const manifest = path.join(tree, rel, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const { name } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (!name || linked.has(name)) continue;
    if (!name.startsWith('@')) throw new Error(`linkOwnWorkspaces: workspace ${rel} in ${tree} is named "${name}", not a scoped name, and would collide with a shared link`);
    const at = path.join(nm, ...name.split('/'));
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.symlinkSync(path.join(tree, rel), at, 'dir');
    linked.add(name);
  }
  return linked;
}

module.exports = { linkOwnWorkspaces };
