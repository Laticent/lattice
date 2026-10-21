/**
 * The pills plugin's usage probe (lib/plugins/host-grammar.mjs `usesPlugin`): does a deck write a pill? Any `{` in
 * source is a SUPERSET of what the dispatcher draws, because a false positive costs one probe and a miss would hide a
 * literal span (engineering/decisions/2026-09-27-plugin-system.md § 4.8). The plugin adds no markdown-it rule: its
 * syntax is an inline-code kind (`contributes.inline`), which the host dispatches. An embedded plugin is always
 * admitted, so the probe never gates it; it exists because every plugin ships one.
 */
export function detect(source) {
  return typeof source === 'string' && source.includes('{');
}
