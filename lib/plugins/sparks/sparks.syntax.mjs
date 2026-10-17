/**
 * The sparks plugin's usage probe (lib/plugins/host-grammar.mjs `usesPlugin`): does a deck write
 * a spark? Any `~{` or `@spark{` — a SUPERSET of what the dispatcher draws, because a false
 * positive only costs a `plugin/used-not-loaded` check and a miss hides that warning
 * (engineering/decisions/2026-09-27-plugin-system.md § 4.8). The plugin adds no markdown-it rule:
 * its syntax is an inline-code kind (`contributes.inline`), which the host dispatches. It has no
 * payload either, so this probe loads nothing.
 */
const PROBE = /~\{|@spark\{/;

export function detect(source) {
  return typeof source === 'string' && PROBE.test(source);
}
