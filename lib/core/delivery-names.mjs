/**
 * lib/core/delivery-names.mjs
 *
 * The `delivery:` register's names and its front-matter parse, without the styles. This is the
 * half of `resolve-delivery.mjs` that imports nothing: `resolve-delivery.mjs` re-exports all of it
 * and adds the three style files. It is its own module so a caller that only needs the names, the
 * Studio's Settings ▸ Speech ▸ Delivery menu, does not load every delivery's style into the
 * Studio's startup JavaScript (Present, which plays the styles, loads lazily).
 *
 * ESM for the Rollup reason `resolve-delivery.mjs` gives.
 */

/** The registered delivery names. */
export const DELIVERY_NAMES = ['restrained', 'expressive', 'somber'];

/** The name a deck gets when it declares none. */
export const DEFAULT_DELIVERY = 'restrained';

/** True when `value` names a registered delivery. */
export function isKnownDelivery(value) {
  return typeof value === 'string' && DELIVERY_NAMES.includes(value.trim().toLowerCase());
}

/**
 * The raw `delivery:` line and its parsed value, or null when the deck declares none. One parse,
 * two callers: this resolver and lint-core's `unknown-delivery` rule, which mirrors it
 * character for character (the parity is pinned).
 *
 * @param {string} md deck source, or the leading `---`-fenced block
 * @returns {{ line: string, value: string }|null}
 */
export function deliveryLine(md) {
  const block = String(md ?? '').match(/^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!block) return null;
  const line = block[1].match(/^[ \t]*delivery:[ \t]*(.*)$/m);
  if (!line) return null;
  // The shared front-matter scalar rule (`frontMatterScalar`, lib/core/front-matter-key.js),
  // mirrored rather than imported for the Rollup reason above: a trailing ` # comment` is cut,
  // one pair of surrounding quotes is dropped.
  const cut = line[1].search(/[ \t]#/);
  const value = (cut === -1 ? line[1] : line[1].slice(0, cut))
    .trim()
    .replace(/^['"]/, '')
    .replace(/['"]$/, '')
    .toLowerCase();
  return { line: line[0].trim(), value };
}

/**
 * The deck's declared delivery name, or null when it declares none or declares an unknown one.
 * An unknown value is null rather than the default, so a typo falls through at play time and is
 * reported at authoring time — the division every sibling register uses.
 *
 * @param {string} md deck source, or the leading `---`-fenced block
 * @returns {string|null}
 */
export function frontMatterDelivery(md) {
  const value = deliveryLine(md)?.value ?? null;
  return value !== null && DELIVERY_NAMES.includes(value) ? value : null;
}
