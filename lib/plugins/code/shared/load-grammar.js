/**
 * lib/plugins/code/shared/load-grammar.js — how the code plugin loads one highlight.js grammar
 * in Node: require its module, on first use. `available` tells the highlighter this surface can
 * load any language in the table without fetching it, and the table (./languages.generated.js)
 * rides here so a browser bundle, which loads by fetch instead, does not carry it.
 *
 * Browser bundles swap this file for ./load-grammar.browser.js (tools/build-playground.js), where
 * a grammar arrives by fetch instead, so the 192 modules never enter a bundle.
 */

const { LANGUAGES, ALIASES } = require('./languages.generated.js');

module.exports = {
  LANGUAGES,
  ALIASES,
  available: true,
  load(name) {
    try {
      return require(`highlight.js/lib/languages/${name}`);
    } catch {
      return null;
    }
  },
};
