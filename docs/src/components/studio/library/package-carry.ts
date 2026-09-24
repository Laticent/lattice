// What an imported PACKAGE carried that a Studio record does not model
// (engineering/decisions/2026-09-23-portable-packages.md §3.1: the repo folder, the
// exported zip and the Studio record hold the same files).
//
// A Studio record models what its faculty edits: a theme's CSS and essentials, a
// component's CSS and skeleton and a few manifest axes, a finish's recipe. A package
// can hold more — a repo component's full manifest and its `docs.md`, a finish recipe
// written in its own formatting. Without this, importing a package and exporting it
// again rewrote those files or dropped them.
//
// It is DATA the export writes back verbatim, never something the Studio renders or
// executes: a code role (`transform.js`) is refused at import and never reaches here.
//
// It lasts until the record is EDITED. The faculties (Fabricate, the Finish and Motion
// studios) save what they model and pass no carry, so the first edit drops it: a
// repo component edited in the Studio exports without its `docs.md` and the manifest
// fields the faculty does not know. That is the safe direction — an export never
// writes a stale manifest over what the author just changed.

export type PackageCarry = {
	/** The package's manifest as imported. Export stamps `name`, `type` and `format` over it. */
	manifest?: Record<string, unknown>;
	/** Role files the record has no field for, keyed by ROLE (`docs.md`, `recipe.json`). */
	files?: Record<string, string>;
};
