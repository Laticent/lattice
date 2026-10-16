/**
 * The icons plugin's usage probe (lib/plugins/host-grammar.mjs `usesPlugin`): does a deck write
 * an icon? An inline `^{…}` or `@icon{…}`, or an `icon=` anywhere — a SUPERSET of what the dispatcher draws,
 * because a false positive costs one needless data load and a miss ships a literal span
 * (engineering/decisions/2026-09-27-plugin-system.md § 4.8). The plugin adds no markdown-it rule:
 * its syntax is an inline-code kind (`contributes.inline`), which the host dispatches.
 */
// `@icon{` is the named form (2026-10-14-plugin-inline-door.md): a probe that missed it left a browser
// surface with no drawings and the span as code.
const PROBE = /\^\{|@icon\{|\bicon\s*=/;

export function detect(source) {
  return typeof source === 'string' && PROBE.test(source);
}
