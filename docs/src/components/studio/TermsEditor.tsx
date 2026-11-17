// The deck-scope "Terms" editor — one structured list over the `terms:` front matter, which absorbed
// the older `acronyms:` and `lexicon:` (engineering/decisions/2026-11-16-terms-registry.md). Each row
// says how a word, name, acronym or symbol is SAID (or silenced), what it STANDS FOR, and an optional
// glossary DEFINITION. The slide keeps the word as written; only what the voice says changes.
//
// Committing writes the whole list back as `terms:` and removes the two older blocks it absorbed
// (`setFrontMatterTerms`, lossless — every other front-matter byte survives, #1257). Same
// commit-on-blur discipline the two editors it replaces used.
//
// ▶ speaks the row's term the way a slide would (Cadenza with this deck's terms), in the reader's
// current voice, so the author hears the fix before a slide uses it. Cadenza and the voice load on
// that first press: Deck setup is on the Studio's startup path, and neither belongs there (route
// budget, studio eagerJsGz).

import { Loader2, Play, Plus, Volume2, VolumeX, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TermEntry } from '../../lib/front-matter';

/** A registry entry as the reader returns it (`termEntries`): the fields plus the key it came from. */
export type TermRecord = TermEntry & { from?: 'terms' | 'acronyms' | 'lexicon' };

interface Row {
	id: string;
	term: string;
	pronounce: string;
	expansion: string;
	definition: string;
	silent: boolean;
}

let ROW_SEQ = 0;
const toRows = (terms: ReadonlyMap<string, TermRecord>): Row[] =>
	[...terms].map(([term, e]) => ({
		id: `t${ROW_SEQ++}`,
		term,
		pronounce: e.pronounce ?? '',
		expansion: e.expansion ?? '',
		definition: e.definition ?? '',
		// An empty `pronounce` with nothing else to say is the silence form (`"🎯": ""`).
		silent: e.pronounce === '',
	}));

/** The rows as an ordered [term, entry] list. A blank term, or a row with nothing in it, is dropped;
 *  duplicate terms de-dupe last-wins (the reader's rule). */
export function termsFromRows(rows: readonly Row[]): [string, TermEntry][] {
	const seen = new Map<string, TermEntry>();
	for (const r of rows) {
		const term = r.term.trim();
		if (!term) continue;
		const e: TermEntry = {};
		const expansion = r.expansion.trim();
		const definition = r.definition.trim();
		const pronounce = r.pronounce.trim();
		if (expansion) e.expansion = expansion;
		if (r.silent) e.pronounce = '';
		else if (pronounce) e.pronounce = pronounce;
		if (definition) e.definition = definition;
		if (e.expansion || e.definition || e.pronounce !== undefined) seen.set(term, e);
	}
	return [...seen];
}

const signature = (entries: Iterable<[string, TermEntry]>) =>
	[...entries].map(([t, e]) => [t, e.expansion ?? '', e.pronounce ?? '\u0002', e.definition ?? ''].join('\u0000')).join('\u0001');

export function TermsEditor({
	terms,
	onChange,
	lang,
}: {
	terms: ReadonlyMap<string, TermRecord>;
	/** Commit the whole registry (writes `terms:` and drops `acronyms:` / `lexicon:`). On blur / add / remove. */
	onChange: (entries: [string, TermEntry][]) => void;
	/** The deck's `lang:` — so ▶ speaks with the deck's say-as rules. */
	lang?: string;
}) {
	const [rows, setRows] = React.useState<Row[]>(() => toRows(terms));
	const [playing, setPlaying] = React.useState<string | null>(null);
	const [note, setNote] = React.useState<string | null>(null);
	// Re-seed on a CONTENT change (deck switch, an AI edit) — keyed on the content, not the Map
	// identity, so our own commit (the same content coming back) never fights typing.
	const sig = signature(terms);
	const lastSig = React.useRef(sig);
	React.useEffect(() => {
		if (sig !== lastSig.current) {
			lastSig.current = sig;
			setRows(toRows(terms));
		}
	}, [sig, terms]);

	const commit = (next: Row[]) => {
		const entries = termsFromRows(next);
		const nextSig = signature(entries);
		// A row still being filled in (no field yet) changes nothing on disk, so it writes nothing —
		// and a deck still on `acronyms:` / `lexicon:` is not migrated by a mere focus change.
		if (nextSig === lastSig.current) return;
		lastSig.current = nextSig;
		onChange(entries);
	};

	const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
	const updateAndCommit = (id: string, patch: Partial<Row>) =>
		setRows((rs) => {
			const next = rs.map((r) => (r.id === id ? { ...r, ...patch } : r));
			commit(next);
			return next;
		});
	const remove = (id: string) =>
		setRows((rs) => {
			const next = rs.filter((r) => r.id !== id);
			commit(next);
			return next;
		});
	const add = () => setRows((rs) => [...rs, { id: `t${ROW_SEQ++}`, term: '', pronounce: '', expansion: '', definition: '', silent: false }]);
	const commitCurrent = () => commit(rows);
	const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') e.currentTarget.blur();
	};

	const play = async (r: Row) => {
		const term = r.term.trim();
		if (!term) return;
		// Speak the term exactly as a slide would: through Cadenza, with the rows as they stand now
		// (uncommitted edits included), so ▶ is a preview of the fix, not of the saved deck.
		const live = new Map(termsFromRows(rows).map(([t, e]) => [t, e.pronounce ?? e.expansion ?? t]));
		setPlaying(r.id);
		const [{ toSpokenText }, { speakLinePreview }] = await Promise.all([import('@/lib/cadenza'), import('./read-aloud')]);
		const spoken = toSpokenText(term, { terms: live, lang });
		if (!spoken) {
			setPlaying(null);
			setNote(`${term} is silent: the voice skips it.`);
			return;
		}
		setNote(null);
		const res = await speakLinePreview(spoken, lang);
		setPlaying((cur) => (cur === r.id ? null : cur));
		if (!res.ok) setNote(`Could not play ${term}: ${res.error ?? 'no voice'}.`);
	};

	return (
		<div className="my-2">
			{rows.length === 0 ? (
				<p className="text-[11px] leading-snug text-muted-foreground">
					No terms yet. Add a word the voice gets wrong and how to say it (e.g. <span className="font-mono">EBITDA</span>, said{' '}
					<span className="font-mono">ee bit dah</span>). The slide keeps the word as written. One entry also covers the plural, the
					possessive and a hyphenated compound.
				</p>
			) : (
				<ul className="flex flex-col gap-2">
					{rows.map((r) => (
						<li key={r.id} className="flex flex-col gap-1 rounded-md border border-border p-1.5">
							<div className="flex min-w-0 items-center gap-1">
								<Input
									aria-label="Term"
									value={r.term}
									placeholder="EBITDA"
									onChange={(e) => update(r.id, { term: e.target.value })}
									onBlur={commitCurrent}
									onKeyDown={blurOnEnter}
									className="h-8 min-w-0 flex-1 font-mono text-[13px]"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={`Hear ${r.term || 'this term'}`}
									title="Hear it"
									disabled={!r.term.trim() || playing === r.id}
									onClick={() => play(r)}
									className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
								>
									{playing === r.id ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={r.silent ? `Speak ${r.term || 'this term'}` : `Silence ${r.term || 'this term'}`}
									aria-pressed={r.silent}
									title={r.silent ? 'Silent: the voice skips it' : 'Silence it'}
									onClick={() => updateAndCommit(r.id, { silent: !r.silent })}
									className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
								>
									{r.silent ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={`Remove ${r.term || 'term'}`}
									onClick={() => remove(r.id)}
									className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
								>
									<X className="size-4" />
								</Button>
							</div>
							<Input
								aria-label="Say it as"
								value={r.silent ? '' : r.pronounce}
								disabled={r.silent}
								placeholder={r.silent ? 'Silent: the voice skips it' : r.expansion ? 'Say it as (blank: Stands for)' : 'Say it as, e.g. ee bit dah'}
								onChange={(e) => update(r.id, { pronounce: e.target.value })}
								onBlur={commitCurrent}
								onKeyDown={blurOnEnter}
								className="h-8 text-[12.5px]"
							/>
							<Input
								aria-label="Stands for"
								value={r.expansion}
								placeholder="Stands for (optional)"
								onChange={(e) => update(r.id, { expansion: e.target.value })}
								onBlur={commitCurrent}
								onKeyDown={blurOnEnter}
								className="h-7 text-[11.5px]"
							/>
							<Input
								aria-label="Definition"
								value={r.definition}
								placeholder="Definition (optional, for a glossary)"
								onChange={(e) => update(r.id, { definition: e.target.value })}
								onBlur={commitCurrent}
								onKeyDown={blurOnEnter}
								className="h-7 text-[11.5px] text-muted-foreground"
							/>
						</li>
					))}
				</ul>
			)}
			{note ? (
				<p role="status" className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
					{note}
				</p>
			) : null}
			<Button type="button" variant="outline" size="sm" onClick={add} className="mt-2 h-8 gap-1.5 text-[12px]">
				<Plus className="size-3.5" /> Add term
			</Button>
		</div>
	);
}
