import { Check, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type CatalogItem, groupBy, type Lens, makeFuse, rankedFor } from '@/lib/component-search';
import { cn } from '@/lib/utils';

/**
 * The component template picker — a shadcn Popover + cmdk Command (replacing the
 * vanilla template-picker.js popover). Searchable + groupable by the same lenses
 * the component reference uses (Family / Function / Substance / A–Z), reusing
 * the shared search-core so there's one taxonomy. Selecting a component reports
 * its name to the controller, which loads its sample + fresh-renders.
 *
 * Search + lens are CONTROLLED (2026-07-05 Specimen Book decision §4): the
 * controller owns and persists them, so reopening the picker — or reloading the
 * page — restores your last search instead of starting blank. Selecting a
 * component deliberately does NOT clear the query.
 *
 * `detached` is the honest sync state: the editor's draft holds no recognized
 * component, so the trigger says so instead of showing a stale name.
 */
export function ComponentPicker({
	components,
	lenses,
	current,
	detached,
	query,
	onQueryChange,
	lensId,
	onLensChange,
	onPick,
}: {
	components: CatalogItem[];
	lenses: Lens[];
	current: string;
	detached?: boolean;
	query: string;
	onQueryChange: (q: string) => void;
	lensId: string;
	onLensChange: (id: string) => void;
	onPick: (name: string) => void;
}) {
	const [open, setOpen] = React.useState(false);
	const fuse = React.useMemo(() => makeFuse(components), [components]);

	const ranked = rankedFor(components, fuse, query); // flat ranked list while searching
	const lens = lenses.find((l) => l.id === lensId) ?? lenses[0];
	const groups = ranked ? null : groupBy(components, lens);

	const select = (name: string) => {
		onPick(name);
		setOpen(false);
		// The query survives — reopening resumes the last search (decision §4).
	};

	// cmdk filters internally on its own value; we feed it a precise, pre-ordered
	// set and disable its fuzzy filter so OUR ranking (substring-first) wins.
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id="pg-template-trigger"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label="Pick a component"
					className="w-full justify-between font-normal"
				>
					<span className={cn('truncate', detached && 'text-muted-foreground italic')}>
						{current ? (detached ? `${current} (draft differs)` : current) : 'Pick a component…'}
					</span>
					<ChevronsUpDown className="opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[min(22rem,86vw)] p-0" align="start">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search components — name, tag, or description…"
						value={query}
						onValueChange={onQueryChange}
					/>
					<div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
						<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Group</span>
						{lenses.map((l) => (
							<button
								key={l.id}
								type="button"
								onClick={() => onLensChange(l.id)}
								className={cn(
									'rounded px-1.5 py-0.5 text-[11px] font-medium',
									l.id === (lens?.id ?? '') ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
								)}
							>
								{l.label}
							</button>
						))}
					</div>
					<CommandList>
						<CommandEmpty>No components match that search.</CommandEmpty>
						{ranked
							? ranked.length > 0 && (
									<CommandGroup>
										{ranked.map((it) => (
											<PickItem key={it.name} name={it.name} current={current} onSelect={select} />
										))}
									</CommandGroup>
								)
							: groups?.map((g) => (
									<CommandGroup key={g.key} heading={g.label}>
										{g.items.map((it) => (
											<PickItem key={it.name} name={it.name} current={current} onSelect={select} />
										))}
									</CommandGroup>
								))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function PickItem({ name, current, onSelect }: { name: string; current: string; onSelect: (n: string) => void }) {
	return (
		<CommandItem value={name} onSelect={() => onSelect(name)} className="font-mono">
			{name}
			<Check className={cn('ml-auto size-3.5', name === current ? 'opacity-100' : 'opacity-0')} />
		</CommandItem>
	);
}
