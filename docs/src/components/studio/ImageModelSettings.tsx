import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { metaLabel, shortName } from '@/components/studio/ai/or-catalog.js';
import { cn } from '@/lib/utils';
import type { ArchitectStatus } from './architect';
import { DEFAULT_IMAGE_MODEL, IMAGE_LOOKS, type ImageLook, lookTokens } from './image-look';
import { ModelList, useModelCatalog } from './ModelPicker';
import { loadSettings, saveSettings } from './studio-store';

// Workspace → Model → Image model: which model looks at the author's photos, and how closely. Today that is the Library's
// **Suggest** button (a name and a description for a photo). It is its own setting because the model that is best for
// editing a deck is not always the one to pay for to look at a picture, and a model that cannot read images cannot do it at all.
// Decision note: engineering/decisions/2026-10-12-library-media-assets.md § The image model.

const LOOKS = Object.keys(IMAGE_LOOKS) as ImageLook[];

export function ImageModelSettings({ status }: { status: ArchitectStatus }) {
	const [open, setOpen] = React.useState(false);
	const [settings, setSettings] = React.useState(() => loadSettings());
	const searchRef = React.useRef<HTMLInputElement>(null);
	const catalog = useModelCatalog(status, {
		onPicked: () => setOpen(false),
		visionOnly: true,
		label: 'Image model',
		currentId: settings.imageModel,
		select: (m) => {
			saveSettings({ imageModel: m.id });
			setSettings(loadSettings());
		},
	});
	const isDefault = settings.imageModel === DEFAULT_IMAGE_MODEL;
	const summary = isDefault ? 'Latest Claude Sonnet' : catalog.current ? shortName(catalog.current) : settings.imageModel;
	const meta = isDefault ? 'Follows the newest Sonnet automatically' : catalog.current ? metaLabel(catalog.current) : '';
	const look = settings.imageLook;

	return (
		<div data-image-model-settings>
			<div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Image model</div>
			<div className={cn('rounded-xl border', open ? 'border-[var(--accent)]' : 'border-border')}>
				<button
					type="button"
					aria-expanded={open}
					onClick={() => {
						const next = !open;
						setOpen(next);
						if (next) requestAnimationFrame(() => searchRef.current?.focus());
					}}
					className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
				>
					<span className="min-w-0 flex-1">
						<span className="block truncate text-[14px] font-bold text-[var(--text-heading)]">{summary}</span>
						{meta && <span className="block truncate font-mono text-[11px] text-muted-foreground">{meta}</span>}
					</span>
					<ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
				</button>
				{open && (
					<div className="border-t border-border p-2.5">
						<ModelList catalog={catalog} searchRef={searchRef} />
						{!isDefault && (
							<button
								type="button"
								className="mt-2 text-[12px] font-semibold text-[var(--accent)]"
								onClick={() => {
									saveSettings({ imageModel: DEFAULT_IMAGE_MODEL });
									setSettings(loadSettings());
									setOpen(false);
								}}
							>
								Use the latest Claude Sonnet again
							</button>
						)}
					</div>
				)}
			</div>
			<div className="mb-1 mt-3 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Look closer</div>
			<fieldset aria-label="How closely the image model looks" className="m-0 flex min-w-0 gap-1 rounded-lg border border-border p-0.5">
				{LOOKS.map((k) => (
					<button
						type="button"
						key={k}
						aria-pressed={look === k}
						onClick={() => {
							saveSettings({ imageLook: k });
							setSettings(loadSettings());
						}}
						className={cn('flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold', look === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-[var(--text-heading)]')}
					>
						{IMAGE_LOOKS[k].label}
					</button>
				))}
			</fieldset>
			<p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
				{IMAGE_LOOKS[look].means} About {lookTokens(look).toLocaleString()} input tokens per photo.
			</p>
			<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Used when you press Suggest on a photo in the Library. The photo is sent to this model on your own OpenRouter key, only then.</p>
		</div>
	);
}
