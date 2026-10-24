/**
 * The video plugin's usage probe (lib/plugins/host-grammar.mjs `usesPlugin`): does a deck write `@video{`?
 * A SUPERSET of what the dispatcher draws (a false positive costs only a `plugin/used-not-loaded` check). The plugin
 * adds no markdown-it rule: its syntax is a named-only inline-code kind (`contributes.inline`), which the host dispatches.
 */
const PROBE = /@video\{/;

export function detect(source) {
  return typeof source === 'string' && PROBE.test(source);
}
