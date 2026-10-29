/**
 * The checks plugin's usage probe (lib/plugins/host-grammar.mjs `usesPlugin`): does a deck write a check? A bracket
 * shortcut or the full form. A SUPERSET of what the dispatcher draws (a false positive costs one probe). The plugin adds
 * no markdown-it rule: its syntax is two inline-code kinds (`contributes.inline`), which the host dispatches, and the
 * list-text grammar's leading check, which components read. An embedded plugin is always admitted, so the probe never
 * gates it; it exists because every plugin ships one.
 */
const PROBE = /\[.\]|@check\{/;

export function detect(source) {
  return typeof source === 'string' && PROBE.test(source);
}
