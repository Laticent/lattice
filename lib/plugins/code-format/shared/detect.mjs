/**
 * lib/plugins/code-format/shared/detect.mjs — does a deck ask for any formatting? A regex and nothing
 * else, because the plugin grammar that carries it (grammar.generated.mjs) is bundled into every
 * browser surface's startup code: importing the planner here would pull the formatters in with it.
 * Cheap, and errs toward yes (the planner then finds nothing to do).
 */

export function wantsFormat(markdown) {
  const src = String(markdown ?? '');
  return /`@code\{[^`\n]*\bformat\b/.test(src) || /^code:[^\n]*\bformat\b/m.test(src);
}
