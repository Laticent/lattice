/**
 * MAKE AUTHOR TEXT CANONICAL AT AN INGEST. LF line endings, no leading byte-order mark.
 *
 * WHY A MODULE RATHER THAN AN INLINE `.replace` AT EACH DOOR. The bug this exists to prevent
 * (#1349) was caused by ~55 front-matter readers each independently remembering `\r?` — a design
 * that guarantees the next one forgets. Repeating a bare `.replace(/\r\n?/g, '\n')` at every
 * ingest reproduces that shape one level up: greppable only if you already know the exact pattern,
 * silently wrong when someone writes `\r?\n` instead, and silently incomplete when they forget the
 * BOM half. One named function is greppable by NAME.
 *
 * THE AUTHORITATIVE BOUNDARY LIST IS NOT THIS FILE, AND NOT A GREP — it is
 * `SANCTIONED_EOL_BOUNDARIES` in `tools/check-ownership.js`, which fails the build on a listed
 * site that stopped normalizing AND on a stale entry. That gate exists because a boundary set
 * maintained in prose rots, and this file is the proof: its first version claimed to be "the ONE
 * function that enforces it in docs/src" while `deck-source.ts` had been doing the same job since
 * #1170, and `architect-edits.js` cannot import this module at all — it is plain JS loaded
 * directly by `node --test`, so it carries the pattern inline. Prose could not have held that.
 *
 * TWO NORMALIZATIONS, ONE OPERATION, because they are the same failure with two spellings. A
 * Windows editor emits both, and each independently defeats a `^---` front-matter anchor:
 *
 *   · `\r\n?`, NOT `\r?\n`. The first covers Windows CRLF *and* classic-Mac lone CR at identical
 *     cost. A reader-style `\r?\n` structurally CANNOT match a lone CR, because there is no `\n`
 *     to anchor on — so only a boundary can fix that case, and a lone-CR deck did not merely
 *     render in the wrong palette, it mis-split into slides.
 *   · A LEADING U+FEFF. Notepad, PowerShell `>` / `Out-File` and Visual Studio all emit one, and
 *     it is STRICTLY WORSE than the CRLF bug: measured through the real CLI, a BOM'd deck
 *     declaring `theme: cuoio` exported in `indaco` (13 slides → 14), losing its `size:` too and
 *     rendering its own front matter as a visible slide. It also diverged BY PATH — `Blob.text()`
 *     strips a BOM during the UTF-8 decode, `fs.readFileSync(p, 'utf8')` does not — so the same
 *     file rendered correctly in the Studio and wrong through the CLI (HARD RULE #1).
 *
 * Both are no-ops on text that is already canonical, so nothing already-correct changes a byte.
 *
 * WHERE THIS BELONGS: at an INGEST — the moment external text enters, before anything reads it.
 * Not inside a reader (that is the design that failed), and not inside a pure transform (a
 * transform that silently re-encodes its input is a worse transform; see the reconciling notes in
 * `front-matter.test.ts` and `studio-store.test.ts`).
 */
export function normalizeSourceText(text: string): string;
export function normalizeSourceText<T>(text: T): T;
export function normalizeSourceText(text: unknown): unknown {
	return typeof text === 'string' ? text.replace(/^﻿/, '').replace(/\r\n?/g, '\n') : text;
}
