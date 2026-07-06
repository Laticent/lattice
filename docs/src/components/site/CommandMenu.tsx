import { ArrowRight, BookOpen, LayoutGrid, Moon, Palette, PencilRuler, Play, Sparkles, Sun, Wrench } from 'lucide-react';
import * as React from 'react';
import { paletteLabel } from '@/components/site/PaletteSelectItems';
import { Badge } from '@/components/ui/badge';
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
	CommandShortcut,
} from '@/components/ui/command';
import { setPalette, toggleMode } from '@/lib/site-chrome';

export type NavLink = { label: string; href: string; desc?: string; current?: boolean; badge?: string };

// lucide v1 dropped brand glyphs, so the GitHub mark is a local inline SVG
// (currentColor, sized like the lucide icons around it).
export function GithubIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
		</svg>
	);
}

type DocResult = { id: string; title: string; url: string; excerpt: string };

type PagefindModule = {
	options?: (o: Record<string, unknown>) => Promise<void>;
	search: (q: string) => Promise<{ results: { id: string; data: () => Promise<DocResultData> }[] }>;
};
type DocResultData = { url: string; meta?: { title?: string }; excerpt?: string };

// Icon per nav label — keeps the palette legible without threading icon refs
// through the nav model (src/lib/nav.mjs stays data-only).
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
	Docs: BookOpen,
	Components: LayoutGrid,
	Features: ArrowRight,
	Comparison: ArrowRight,
	Playground: Play,
	'Drawing Board': PencilRuler,
	Workbench: Wrench,
	Studio: Sparkles,
};

/**
 * THE universal command palette — one ⌘K surface on every page.
 *
 * Three always-available registers (navigate anywhere, switch theme, toggle
 * light/dark) plus full-text docs search lazily backed by Starlight's Pagefind
 * index. The Pagefind module is fetched on first query and degrades silently
 * where it isn't built yet (dev), so the navigate/command registers always work.
 *
 * Open state + the ⌘K / `/` shortcut are owned by <NavActions>, which also
 * renders the trigger button — this component is purely the dialog body.
 */
export function CommandMenu({
	open,
	onOpenChange,
	links,
	palettes,
	githubUrl,
	pagefindUrl,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	links: NavLink[];
	palettes: string[];
	githubUrl: string;
	pagefindUrl: string;
}) {
	const [query, setQuery] = React.useState('');
	const [docs, setDocs] = React.useState<DocResult[]>([]);
	const pf = React.useRef<PagefindModule | null | 'unavailable'>(null);

	const go = (href: string) => {
		onOpenChange(false);
		window.location.href = href;
	};

	// Palette / mode commands honour the Drawing Board chrome bus when present
	// (same contract as <PaletteControls>): on that route a pick writes the
	// deck theme; everywhere else it sets the site palette.
	const applyPalette = (name: string) => {
		const bus = window.__dbChrome;
		if (bus) bus.applyTheme(name);
		else setPalette(name);
		onOpenChange(false);
	};
	const flipMode = () => {
		const bus = window.__dbChrome;
		if (bus) bus.toggleMode();
		else toggleMode();
		onOpenChange(false);
	};

	// Lazy Pagefind: fetch the module once, on the first non-empty query.
	React.useEffect(() => {
		const q = query.trim();
		if (!q) {
			setDocs([]);
			return;
		}
		let cancelled = false;
		const run = async () => {
			if (pf.current === 'unavailable') return;
			if (pf.current === null) {
				try {
					const mod: PagefindModule = await import(/* @vite-ignore */ pagefindUrl);
					await mod.options?.({ excerptLength: 18 });
					pf.current = mod;
				} catch {
					pf.current = 'unavailable';
					return;
				}
			}
			const mod = pf.current as PagefindModule;
			try {
				const res = await mod.search(q);
				const data = await Promise.all(res.results.slice(0, 6).map(async (r) => ({ id: r.id, d: await r.data() })));
				if (cancelled) return;
				setDocs(
					data.map(({ id, d }) => ({
						id,
						url: d.url,
						title: d.meta?.title ?? d.url,
						excerpt: (d.excerpt ?? '').replace(/<\/?mark>/g, ''),
					})),
				);
			} catch {
				/* a transient Pagefind error just means no doc results this keystroke */
			}
		};
		const t = setTimeout(run, 140);
		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [query, pagefindUrl]);

	const navRows = matchLinks(links, query);
	const brandRows = matchRows(
		palettes.filter((p) => !p.startsWith('a11y-')),
		query,
	);
	const a11yRows = matchRows(
		palettes.filter((p) => p.startsWith('a11y-')),
		query,
	);
	const appearance = [
		{
			key: 'toggle-light-dark',
			label: 'Toggle light dark appearance',
			node: (
				<>
					<Sun className="dark:hidden" />
					<Moon className="hidden dark:block" />
					Toggle light / dark
				</>
			),
			onSelect: flipMode,
		},
		{
			key: 'github',
			label: 'GitHub repository source code',
			node: (
				<>
					<GithubIcon className="size-4" />
					GitHub repository
				</>
			),
			onSelect: () => go(githubUrl),
		},
	];
	const apprRows = appearance.filter((a) => {
		const q = query.trim().toLowerCase();
		return !q || a.label.toLowerCase().includes(q);
	});

	// "Start walkthrough" — the Explore surface's front door (Specimen Book §4,
	// PR 6): jump to the Playground in Explore and walk the catalog end to end.
	const playgroundHref = links.find((l) => /playground/i.test(l.label))?.href ?? null;
	const walkQ = query.trim().toLowerCase();
	const showWalkthrough = playgroundHref != null && (!walkQ || 'start walkthrough explore components'.includes(walkQ));

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Command palette"
			description="Search the docs, jump to any page, or switch the theme."
			// Pagefind results are already query-ranked; we filter the static rows
			// ourselves so they coexist with doc hits under one input.
			shouldFilter={false}
		>
			<CommandInput placeholder="Search docs, jump to a page, switch theme…" value={query} onValueChange={setQuery} />
			<CommandList>
				<CommandEmpty>No matches.</CommandEmpty>

				{// Each present group is rendered with a leading separator after the
				// first, so the dividers never bracket an empty (filtered-out) group.
				joinGroups([
					navRows.length > 0 && (
						<CommandGroup heading="Go to" key="go">
							{navRows.map((l) => {
								const Icon = ICONS[l.label] ?? ArrowRight;
								return (
									<CommandItem key={l.href} value={`go-${l.label}`} onSelect={() => go(l.href)}>
										<Icon />
										<span className="flex min-w-0 flex-col">
											<span className="flex items-center gap-1.5 truncate">
												{l.label}
												{l.badge && (
													<Badge className="border-transparent bg-primary/15 px-1.5 py-0 text-[10px] font-semibold tracking-wide text-primary uppercase">
														{l.badge}
													</Badge>
												)}
											</span>
											{l.desc && <span className="truncate text-xs text-muted-foreground">{l.desc}</span>}
										</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					),
					docs.length > 0 && (
						<CommandGroup heading="Documentation" key="docs">
							{docs.map((d) => (
								<CommandItem key={d.id} value={`doc-${d.id}`} onSelect={() => go(d.url)}>
									<BookOpen />
									<span className="flex min-w-0 flex-col">
										<span className="truncate">{d.title}</span>
										{d.excerpt && <span className="truncate text-xs text-muted-foreground">{d.excerpt}</span>}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					),
					brandRows.length + a11yRows.length > 0 && (
						<CommandGroup heading="Theme" key="theme">
							{brandRows.map((p) => (
								<CommandItem key={p} value={`palette-${p}`} onSelect={() => applyPalette(p)}>
									<Palette />
									{paletteLabel(p)}
								</CommandItem>
							))}
							{a11yRows.map((p) => (
								<CommandItem key={p} value={`palette-${p}`} onSelect={() => applyPalette(p)}>
									<Palette />
									{paletteLabel(p)}
									<CommandShortcut>colour-blind safe</CommandShortcut>
								</CommandItem>
							))}
						</CommandGroup>
					),
					showWalkthrough && playgroundHref != null && (
						<CommandGroup heading="Playground" key="walk">
							<CommandItem value="start-walkthrough" onSelect={() => go(`${playgroundHref}${playgroundHref.includes('?') ? '&' : '?'}view=read`)}>
								<Play />
								Start walkthrough
							</CommandItem>
						</CommandGroup>
					),
					apprRows.length > 0 && (
						<CommandGroup heading="Appearance" key="appr">
							{apprRows.map((a) => (
								<CommandItem key={a.key} value={a.key} onSelect={a.onSelect}>
									{a.node}
								</CommandItem>
							))}
						</CommandGroup>
					),
				])}
			</CommandList>
		</CommandDialog>
	);
}

// Render the present groups with a separator before every group after the first.
function joinGroups(groups: (React.ReactElement | false)[]): React.ReactNode {
	const present = groups.filter(Boolean) as React.ReactElement[];
	return present.map((g, i) => (
		<React.Fragment key={g.key}>
			{i > 0 && <CommandSeparator />}
			{g}
		</React.Fragment>
	));
}

// Case-insensitive substring match over the palette rows (cmdk's own filter is
// off so Pagefind doc results can share the list).
function matchRows(items: string[], query: string): string[] {
	const q = query.trim().toLowerCase();
	if (!q) return items;
	return items.filter((p) => paletteLabel(p).toLowerCase().includes(q) || p.toLowerCase().includes(q));
}

function matchLinks(items: NavLink[], query: string): NavLink[] {
	const q = query.trim().toLowerCase();
	if (!q) return items;
	return items.filter((l) => `${l.label} ${l.desc ?? ''}`.toLowerCase().includes(q));
}
