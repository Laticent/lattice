import { type LensDef, type LensRegistry, type WorkspaceLensConfig } from './types';
/** Parse the deck front matter (the text BETWEEN the `---` fences) into a resolved registry, merging
 *  workspace defaults unless the deck opts out with `lens-defaults: off`. Best-effort: a malformed
 *  child line is skipped, not thrown (validateRegistry reports it). The implicit `full` lens is always
 *  present at index 0 and can never be dropped. */
export declare function parseLensRegistry(frontMatter: string, workspace?: WorkspaceLensConfig): LensRegistry;
/** Emit the canonical `lenses:` block (excludes the implicit `full`). Empty registry => ''. */
export declare function emitRegistry(reg: LensRegistry): string;
/** True when a lens is a PRISTINE copy of a workspace default — same shape (base / label / single /
 *  hidden / order), NOT approved. A pristine inherited lens is left OUT of the deck source (it's
 *  re-inherited at read), so a deck the author never touched stays clean — no `lenses:` block. Exported
 *  so the UI can tell an untouched INHERITED starter apart from one the author has made their own (the
 *  Lenses panel badges the former "Starter"). */
export declare function isPristineInherited(lens: LensDef, def: LensDef | undefined): boolean;
/** Emit only the deck's DELTA from the workspace default lenses — the shape a deck writes when its reader
 *  views are INHERITED from a workspace setting (not materialized per-deck). Rules:
 *   - a pristine inherited default → NOT emitted (invisible in source; re-inherited at read);
 *   - an approved / modified / custom (non-default) lens → emitted as a full def (portable + self-contained);
 *   - a workspace default the deck REMOVED (absent from `reg`) → emitted as `{ drop: true }` so it does not
 *     silently re-inherit on the next read.
 *  This is what keeps an untouched deck's source empty while still letting the author approve, edit, or
 *  drop an inherited view. `parseLensRegistry(…, workspace)` round-trips the result back to `reg`.
 *
 *  `materialize` FORCES a pristine inherited lens to be emitted anyway when its id is in the set — used
 *  for the "tagging counts as touching" rule: once the author tags slides into an inherited view, the
 *  Studio passes that view's id here so its def is written to the deck (it's no longer a disposable
 *  inherited starter, so it survives the workspace setting being turned off). See tags.ts `taggedLensIds`. */
export declare function emitRegistryDelta(reg: LensRegistry, workspace: WorkspaceLensConfig, materialize?: Set<string>): string;
/** Rewrite a deck front matter so its lens registry matches `reg` — Lente as sole writer. Preserves
 *  every unrelated key; re-emits the `lens-default:` scalar and the canonical `lenses:` block at the
 *  end (canonical placement, since the host's generic emitter relocates nested blocks anyway).
 *
 *  With a `workspace` config, the deck's reader views are INHERITED (not materialized per-deck): the
 *  block records only the deck's DELTA from those defaults (see `emitRegistryDelta`), so an untouched
 *  deck writes NO block at all — and `lens-default:` is emitted only when the deck overrides the
 *  workspace default. Without `workspace`, the whole registry is materialized (the pre-inheritance
 *  behavior). Either way `parseLensRegistry(result, workspace)` round-trips back to `reg`.
 *
 *  `materialize` (workspace mode only) forces the named pristine inherited lenses to be written out —
 *  the "tagging counts as touching" rule (see `emitRegistryDelta`). Callers pass the deck's
 *  `taggedLensIds` so a view the author tagged into is no longer disposable. */
export declare function upsertLensRegistry(frontMatter: string, reg: LensRegistry, workspace?: WorkspaceLensConfig, materialize?: Set<string>): string;
