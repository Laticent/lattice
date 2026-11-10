/**
 * The image plugin's usage probe (lib/plugins/host-grammar.mjs `usesPlugin`): does a deck write `@image{`?
 * A SUPERSET of what the dispatcher draws (a false positive costs only a `plugin/used-not-loaded` check). The alias, Markdown's
 * `![title](src)`, is CommonMark and needs no probe: it renders whether or not the plugin's record is used.
 */
const PROBE = /@image\{/;

export function detect(source) {
  return typeof source === 'string' && PROBE.test(source);
}
