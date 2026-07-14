import * as React from 'react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

// The insert-component palette: a searchable, bucket-grouped picker over the REAL
// component catalog (dist/docs/components.json, passed in from the page at build
// time). Selecting a component inserts its authored skeleton as a new slide —
// the same skeleton the docs portal documents — so authors don't hand-write a
// `<!-- _class: … -->` block from memory.

export type ComponentEntry = { name: string; bucket: string; description: string; skeleton: string; function?: string; form?: string };

// 'local' (your saved Layout-Studio components) leads, then the 12 built-in
// buckets in a deliberate reading order (anchor first, legal last).
const BUCKET_ORDER = ['local', 'anchor', 'statement', 'inventory', 'comparison', 'progression', 'evidence', 'imagery', 'chart', 'diagram', 'math', 'code', 'legal'];

export function InsertComponent({ open, onOpenChange, components, onInsert }: { open: boolean; onOpenChange: (v: boolean) => void; components: ComponentEntry[]; onInsert: (c: ComponentEntry) => void }) {
	const groups = React.useMemo(() => {
		const byBucket = new Map<string, ComponentEntry[]>();
		for (const c of components) {
			const list = byBucket.get(c.bucket) ?? [];
			list.push(c);
			byBucket.set(c.bucket, list);
		}
		const order = (b: string) => {
			const i = BUCKET_ORDER.indexOf(b);
			return i === -1 ? BUCKET_ORDER.length : i;
		};
		return [...byBucket.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([bucket, list]) => ({ bucket, list: [...list].sort((x, y) => x.name.localeCompare(y.name)) }));
	}, [components]);

	return (
		<CommandDialog open={open} onOpenChange={onOpenChange} title="Insert a component" description="Search the component library and insert one as a new slide.">
			<CommandInput placeholder={`Search ${components.length} components — name, bucket, or what it's for…`} />
			<CommandList>
				<CommandEmpty>No matching component.</CommandEmpty>
				{groups.map(({ bucket, list }) => (
					<CommandGroup key={bucket} heading={bucket}>
						{list.map((c) => (
							<CommandItem
								key={c.name}
								value={`${c.name} ${c.bucket} ${c.description}`}
								onSelect={() => {
									onInsert(c);
									onOpenChange(false);
								}}
							>
								<span className="font-mono text-[12px] font-semibold text-[var(--text-heading)]">{c.name}</span>
								<span className="ml-2 min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{c.description}</span>
							</CommandItem>
						))}
					</CommandGroup>
				))}
			</CommandList>
		</CommandDialog>
	);
}
