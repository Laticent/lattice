/**
 * callout-place-load.js — how `callout-layer.js` finds the heavy half in a build that carries it.
 *
 * Node, the CLI and the single-file bundles (`require`) reach `callout-place.js` here. The ESM
 * playground build replaces this file with a stand-in that answers null and ships the heavy half as its
 * own entry, which the host loads for a deck that has a callout (tools/build-playground.js
 * `calloutPlaceStub`). Keeping the `require` in a file of its own is what lets the build cut it.
 */
module.exports = () => require('./callout-place');
/** True only in the stand-in: the heavy half is a separate chunk the host loads (`lib/playground/index.js` `calloutsNeeded`). */
module.exports.lazy = false;
/**
 * Set by `callout-layer.js` when a chart needed the heavy half in a lazy build and it was not there, so the host
 * can load it and render again, the way `takeMissingKernels` does for a chart kernel (lib/playground/index.js
 * `takeMissingCallouts`). It catches a callout the host's scan did not see (one written through markup).
 */
module.exports.missed = false;
