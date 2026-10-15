/**
 * lib/plugins/code-format/code-format.syntax.mjs — no grammar of its own (the code plugin reads the
 * `@code{…}` record); only `detect`, which decides whether the bake runs for a deck. Pure.
 */

import { wantsFormat } from './shared/detect.mjs';

export const detect = wantsFormat;
