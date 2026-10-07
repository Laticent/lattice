// The icon GRID: every icon the deck can write, drawn, searchable by name, alias or category, for an
// author who has no name to start from (engineering/decisions/2026-09-29-inline-icons.md § 17). The
// editor's completion menu (icon-preview.ts) answers "which icon starts with da"; this answers "what
// is there that means storage".
//
// Lazy on two counts. StudioShell imports this file with React.lazy, so it costs the Studio's
// startup nothing; and the drawings are the icons plugin's DATA script, which `ensurePluginData`
// fetches the first time the grid opens, never before. Each drawing is built as DOM from that data
// (icon-preview.ts `paintIcon`), never parsed from a string, so HARD RULE #22 has no sink to count.

import { Shapes } from 'lucide-react';
import * as React from 'react';
import { PanelBody, PanelDock, PanelEmpty, PanelHeader, PanelSearch, PanelSheet } from '@/components/ui/panel';
import { ensurePluginData } from '@/lib/ensure-plugin-data';
import { useIsPhone } from '@/lib/use-breakpoint';
import { type CaretEdit, filterIcons, groupByCategory, type IconEntry, type IconsData, iconEntries, iconInsertion } from './icon-grid-model';
import { paintIcon } from './icon-preview';

function iconsData(): IconsData | null {
	const all = (window as unknown as { __latticePluginData?: Record<string, IconsData> }).__latticePluginData;
	return all?.icons ?? null;
}

/** Aliases from the lint core's own completion words (`also db`), loaded with the core. */
async function aliasInfo(): Promise<Map<string, string>> {
	try {
		const mod = (await import('@/playground/authoring-core.generated.js')) as unknown as {
			lintCore?: { inlineCodeCompletions?: (span: string) => { words?: Array<{ label: string; info?: string }> } | null };
		};
		const words = mod.lintCore?.inlineCodeCompletions?.('^{')?.words ?? [];
		return new Map(words.map((w) => [w.label, w.info ?? '']));
	} catch {
		return new Map();
	}
}

function Drawing({ name }: { name: string }) {
	const ref = React.useRef<HTMLSpanElement>(null);
	React.useLayoutEffect(() => {
		if (ref.current) paintIcon(ref.current, name);
	}, [name]);
	return <span ref={ref} aria-hidden className="grid size-7 place-items-center text-foreground [&_svg]:size-full [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]" />;
}

/** `onPick` gets the name and what to insert for the caret's line (`iconInsertion`): the whole
 *  `` `^{name}` `` span in prose, `^{name}` inside a span, `icon=name` inside a record. */
export function IconGrid({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (name: string, build: (lineBefore: string, lineAfter: string) => CaretEdit) => void }) {
	const phone = useIsPhone();
	const [entries, setEntries] = React.useState<IconEntry[] | null>(null);
	const [failed, setFailed] = React.useState(false);
	const [query, setQuery] = React.useState('');
	const searchRef = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		if (!open || entries) return;
		let live = true;
		setFailed(false);
		// The data script loads here, on the first open, and not before.
		Promise.all([ensurePluginData('`^{icon}`'), aliasInfo()]).then(([, aliases]) => {
			if (!live) return;
			const list = iconEntries(iconsData(), aliases);
			if (list.length) setEntries(list);
			else setFailed(true);
		});
		return () => {
			live = false;
		};
	}, [open, entries]);

	React.useEffect(() => {
		if (open && !phone) requestAnimationFrame(() => searchRef.current?.focus());
		if (!open) setQuery('');
	}, [open, phone]);

	const groups = React.useMemo(() => (entries ? groupByCategory(filterIcons(entries, query)) : []), [entries, query]);
	const shown = groups.reduce((n, g) => n + g.items.length, 0);

	const search = (
		<PanelSearch
			inputRef={searchRef}
			value={query}
			onChange={setQuery}
			onClear={() => setQuery('')}
			placeholder={entries ? `Search ${entries.length} icons — a name, or what it means…` : 'Search icons…'}
			label="Search icons"
			className="flex-1"
		/>
	);

	return (
		<PanelSheet open={open} onOpenChange={onOpenChange} width="md">
			<PanelHeader icon={<Shapes />} title="Insert an icon" srDescription="Every icon a deck can write, searchable by name, alias or category. Pick one to insert it at the cursor." />
			{phone ? null : <div className="border-b border-border px-4 py-2">{search}</div>}
			<PanelBody padded={false} className="px-3 pb-4">
				{failed ? (
					<PanelEmpty icon={<Shapes />} title="The icons did not load">
						Check the connection and open this again.
					</PanelEmpty>
				) : !entries ? (
					<p className="px-1 py-6 text-center text-[12px] text-muted-foreground" role="status">
						Loading the icons…
					</p>
				) : shown === 0 ? (
					<PanelEmpty icon={<Shapes />} title={`No icon matches “${query}”`}>
						Try what the thing does — storage, queue, identity — or a short alias like db.
					</PanelEmpty>
				) : (
					groups.map((g) => (
						<section key={g.category} aria-label={g.category} className="pt-3">
							<h3 className="px-1 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g.category}</h3>
							<ul className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-1">
								{g.items.map((e) => (
									<li key={e.name}>
										<button
											type="button"
											onClick={() => onPick(e.name, (before, after) => iconInsertion(before, e.name, after))}
											title={e.aliases.length ? `${e.name} — also ${e.aliases.join(', ')}` : e.name}
											className="flex w-full flex-col items-center gap-1 rounded-md border border-transparent px-1 py-2 text-center hover:border-border hover:bg-[var(--accent-soft)] focus-visible:border-[var(--accent)] focus-visible:outline-none"
										>
											<Drawing name={e.name} />
											<span className="w-full truncate font-mono text-[10.5px] leading-tight text-muted-foreground">{e.name}</span>
										</button>
									</li>
								))}
							</ul>
						</section>
					))
				)}
			</PanelBody>
			{phone ? <PanelDock>{search}</PanelDock> : null}
		</PanelSheet>
	);
}
