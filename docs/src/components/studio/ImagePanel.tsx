// THE IMAGE EDITOR — point and click, never type the syntax.
//
// The image's panel in Compose's editor host (InlineObjectEditor.tsx): which photo, what it shows (the description a screen
// reader says), and, for a background, which side of the slide it takes. Design:
// engineering/decisions/2026-10-21-compose-point-and-click.md §6.
//
//   · `ImagePanel` is the controls and nothing else. It is handed the image's attributes and reports one change per pick
//     (`{ alt }`, `{ src }`); the host writes it through `editImage` (lib/compose/image-objects.ts), which replaces the node as its
//     own undo step.
//   · A background's alt text is a directive (`bg right:40%`), not a description. The panel shows its side as three chips and
//     writes only the side word, so every other keyword the author typed (`blur`, a share) survives.
//   · "Replace photo" opens the same picker the Image door uses (PhotoPicker.tsx). The host holds the editor open while it is up.
//   · "Remove" takes the image off the slide. The slide's other settings (the card, its band and opacity) stay in the slide
//     settings panel, which a layout like `image` already has.
//
// Lazy with the host: none of it is in the Studio's startup JavaScript.

import { Trash2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { assetNameOf, type BgSide, bgKeywords, bgSideOf, descriptionAsAlt, imageSourceKind, withBgSide } from '@/lib/compose/image-objects';
import { altFromAssetName } from '@/lib/photo-alt';
import { ChoiceRow, Field, PanelFooter, TextRow } from './object-controls';
import { PhotoPicker } from './PhotoPicker';

const SIDE_NAMES: Record<string, string> = { left: 'Left side', right: 'Right side', full: 'Full slide' };

export interface ImageFields {
	src: string;
	alt: string | null;
}

export interface ImagePanelProps {
	fields: ImageFields;
	/** Returns whether the edit was written. A refusal is shown, never swallowed. */
	onEdit: (edit: { src?: string; alt?: string }) => boolean;
	/** Returns whether the image was taken out. A refusal (a locked slide) is shown, and the panel stays. */
	onRemove: () => boolean;
	onDone: () => void;
	holdOpen: (held: boolean) => void;
	onOpenLibrary?: () => void;
}

/** What the source is, in words. */
function sourceLine(src: string): string {
	const kind = imageSourceKind(src);
	if (kind === 'asset') return `Library photo: ${assetNameOf(src)}`;
	if (kind === 'data') return 'A photo saved inside this deck';
	if (src.startsWith('sample:')) return `Sample art: ${src.slice(7)}`;
	if (/^https?:/i.test(src)) return 'A web image';
	return src;
}

export function ImagePanel({ fields, onEdit, onRemove, onDone, holdOpen, onOpenLibrary }: ImagePanelProps) {
	const [refused, setRefused] = React.useState<string | null>(null);
	const [pickerOpen, setPickerOpen] = React.useState(false);
	const labelId = React.useId();
	const alt = fields.alt ?? '';
	const background = bgKeywords(alt) !== null;
	const send = (edit: { src?: string; alt?: string }, what: string) => setRefused(onEdit(edit) ? null : what);
	const openPicker = (v: boolean) => {
		holdOpen(v);
		setPickerOpen(v);
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 text-[13px]">
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
				<Field label="Photo" id={`${labelId}-photo`}>
					<div className="flex items-center gap-2">
						<span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{sourceLine(fields.src)}</span>
						<Button type="button" variant="outline" size="sm" onClick={() => openPicker(true)}>
							Replace photo
						</Button>
					</div>
				</Field>
				<PhotoPicker
					open={pickerOpen}
					onOpenChange={openPicker}
					onOpenLibrary={onOpenLibrary}
					onPick={(p) => {
						// A photo with a description of its own gives it to the slide; otherwise the name, as the Markdown editor's completion does. A description the author already wrote stays.
						const next = background || alt.trim() ? undefined : descriptionAsAlt(p.caption ?? altFromAssetName(p.name));
						send({ src: `asset:${p.name}`, ...(next !== undefined ? { alt: next } : {}) }, 'That photo cannot be written here. Edit this slide in Markdown.');
						openPicker(false);
					}}
				/>

				{background ? (
					<Field label="Placement" id={`${labelId}-side`}>
						<ChoiceRow
							labeledBy={`${labelId}-side`}
							group="Placement"
							values={['left', 'right', 'full']}
							value={bgSideOf(alt)}
							names={SIDE_NAMES}
							noAuto
							onPick={(v) => {
								const next = withBgSide(alt, (v ?? 'full') as BgSide);
								if (next === null) return setRefused('That placement cannot be written here. Edit this slide in Markdown.');
								send({ alt: next }, 'That placement cannot be written here. Edit this slide in Markdown.');
							}}
						/>
						<p className="text-[11px] text-muted-foreground">A background fills that part of the slide. The text sits beside it.</p>
					</Field>
				) : (
					<Field label="Description" id={`${labelId}-alt`}>
						<TextRow id={`${labelId}-alt-input`} label="Description" value={alt} placeholder="What the picture shows" onCommit={(v) => send({ alt: descriptionAsAlt(v) }, 'That description cannot be written here. Edit this slide in Markdown.')} />
						<p className="text-[11px] text-muted-foreground">Read aloud for people who cannot see the picture, and shown if it does not load.</p>
					</Field>
				)}
				{refused ? (
					<p role="alert" className="text-[12px] text-[var(--warn)]">
						{refused}
					</p>
				) : null}
			</div>
			<PanelFooter onDone={onDone}>
				<Button type="button" variant="ghost" size="sm" onClick={() => !onRemove() && setRefused('This image cannot be removed here. Edit this slide in Markdown.')}>
					<Trash2 aria-hidden /> Remove
				</Button>
			</PanelFooter>
		</div>
	);
}
