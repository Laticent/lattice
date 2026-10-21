// THE PHOTO PICKER — choose a Library photo by looking at it.
//
// Compose's "Image" door and an image's "Replace" button open this. It lists every photo the open deck may name (its own
// and the shared ones: media-urls.ts), as thumbnails, searchable by name. A pick hands back the name; the caller writes
// `asset:<name>`. Until now the only way to put a Library photo on a slide was to type `![](asset:` and read a completion
// menu, which is the one thing a mouse-first author cannot do.
//
// Shaped like the icon grid (IconGrid.tsx): a sheet on a phone, the same panel shell elsewhere, a search that moves to the
// dock on a phone so the keyboard does not cover the results. It reads the same name → URL map the preview renders with, so
// what the thumbnail shows is what the slide will show.
//
// An empty Library says so and offers the way to fill it (the Library panel), instead of an empty grid.
//
// Design: engineering/decisions/2026-10-21-compose-point-and-click.md §6. Lazy: ComposeView loads this on first use.

import { Images } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { PanelBody, PanelDock, PanelEmpty, PanelHeader, PanelSearch, PanelSheet } from '@/components/ui/panel';
import { useIsPhone } from '@/lib/use-breakpoint';
import type { AssetChoice } from './editor-complete';
import { assetChoices, ensureAssetAlts, ensureAssetUrls, onAssetUrlsChanged } from './media-urls';

export interface PickedPhoto {
	name: string;
	/** The photo's own description, when the Library has one: the better starting alt text than its file name. */
	caption: string | null;
}

/** The photos whose name holds every word of the query. */
export function filterPhotos(photos: readonly AssetChoice[], query: string): AssetChoice[] {
	const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
	if (!words.length) return [...photos];
	return photos.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));
}

export function PhotoPicker({ open, onOpenChange, onPick, onOpenLibrary }: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (photo: PickedPhoto) => void; onOpenLibrary?: () => void }) {
	const phone = useIsPhone();
	const [photos, setPhotos] = React.useState<AssetChoice[] | null>(null);
	const [urls, setUrls] = React.useState<Record<string, string>>({});
	const [alts, setAlts] = React.useState<Record<string, string>>({});
	const [query, setQuery] = React.useState('');
	const searchRef = React.useRef<HTMLInputElement>(null);

	// Read the shelf when the picker opens, and follow it while it is open (a photo added in the Library shows at once).
	React.useEffect(() => {
		if (!open) return;
		let live = true;
		const read = () =>
			Promise.all([ensureAssetUrls(), ensureAssetAlts()]).then(([u, a]) => {
				if (!live) return;
				setUrls(u);
				setAlts(a);
				setPhotos([...assetChoices()]);
			});
		void read();
		const off = onAssetUrlsChanged(() => void read());
		return () => {
			live = false;
			off();
		};
	}, [open]);

	React.useEffect(() => {
		if (open && !phone) requestAnimationFrame(() => searchRef.current?.focus());
		if (!open) setQuery('');
	}, [open, phone]);

	const shown = React.useMemo(() => (photos ? filterPhotos(photos, query) : []), [photos, query]);

	const search = (
		<PanelSearch inputRef={searchRef} value={query} onChange={setQuery} onClear={() => setQuery('')} placeholder={photos ? `Search ${photos.length} photo${photos.length === 1 ? '' : 's'}…` : 'Search photos…'} label="Search photos" className="flex-1" />
	);

	return (
		<PanelSheet open={open} onOpenChange={onOpenChange} width="md">
			<PanelHeader icon={<Images />} title="Choose a photo" srDescription="The photos in your Library. Pick one to put it on the slide." />
			{phone || !photos?.length ? null : <div className="border-b border-border px-4 py-2">{search}</div>}
			<PanelBody padded={false} className="px-3 pb-4">
				{!photos ? (
					<p className="px-1 py-6 text-center text-[12px] text-muted-foreground" role="status">
						Loading your photos…
					</p>
				) : photos.length === 0 ? (
					<PanelEmpty icon={<Images />} title="Your Library has no photos yet">
						Add photos in the Library, then come back here to put them on a slide.
						{onOpenLibrary ? (
							<span className="mt-3 flex justify-center">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										onOpenChange(false);
										onOpenLibrary();
									}}
								>
									Open the Library
								</Button>
							</span>
						) : null}
					</PanelEmpty>
				) : shown.length === 0 ? (
					<PanelEmpty icon={<Images />} title={`No photo matches “${query}”`}>
						Try a shorter word from the photo's name.
					</PanelEmpty>
				) : (
					<ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 pt-3">
						{shown.map((p) => (
							<li key={p.name}>
								<button
									type="button"
									onClick={() => onPick({ name: p.name, caption: alts[p.name] ?? null })}
									title={p.name}
									aria-label={`Photo ${p.name}`}
									className="group flex w-full flex-col gap-1 rounded-md border border-transparent p-1 text-left hover:border-border hover:bg-[var(--accent-soft)] focus-visible:border-[var(--accent)] focus-visible:outline-none"
								>
									<span className="block aspect-[4/3] w-full overflow-hidden rounded bg-muted">
										{urls[p.name] ? <img src={urls[p.name]} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover" /> : null}
									</span>
									<span className="w-full truncate font-mono text-[10.5px] leading-tight text-muted-foreground">{p.name}</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</PanelBody>
			{phone && photos?.length ? <PanelDock>{search}</PanelDock> : null}
		</PanelSheet>
	);
}

export default PhotoPicker;
