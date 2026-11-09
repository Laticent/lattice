import { Loader2, PlayCircle } from 'lucide-react';
import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { modelDisplayName } from '@/lib/model-name';
import { selectVoice } from '@/lib/model-selection.js';
import { notify } from '@/lib/notify';
import { geminiVoiceCatalog, previewTtsVoice } from './read-aloud';
import { voicesForModel } from './tts-voice-catalog';
import { VoicePicker } from './VoicePicker';

type Catalog = Awaited<ReturnType<typeof geminiVoiceCatalog>>;

/**
 * The Gemini voice, on the author's own Gemini key: the live TTS models (curated first, from the
 * provider registry) and the live prebuilt voices. Picking a model or a voice selects the Gemini
 * voice at once. Nothing here calls OpenRouter.
 */
export function GeminiVoicePanel({ model, voice, ready }: { model: string; voice: string; ready: boolean }) {
	const [catalog, setCatalog] = React.useState<Catalog | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [previewing, setPreviewing] = React.useState<string | null>(null);
	React.useEffect(() => {
		if (!ready) return;
		let live = true;
		geminiVoiceCatalog().then((c) => {
			if (live) setCatalog(c);
		});
		return () => {
			live = false;
		};
	}, [ready]);
	const models = catalog?.models ?? [];
	const effModel = model || models.find((m) => m.curated)?.id || models[0]?.id || '';
	const voices = React.useMemo(() => voicesForModel(effModel, catalog?.voices ?? []), [effModel, catalog]);
	const play = async (v?: string) => {
		setBusy(true);
		const res = await previewTtsVoice({ rung: 'gemini', model: effModel, voice: v ?? voice });
		setBusy(false);
		if (!res.ok) notify(res.error || 'Could not play a sample.');
	};
	return (
		<div>
			<div className="mb-2 text-[13px] font-semibold leading-normal text-[var(--text-heading)]">Voice model</div>
			<Select value={effModel} onValueChange={(id) => selectVoice({ provider: 'gemini', model: id })} disabled={!ready || !models.length}>
				<SelectTrigger aria-label="Gemini voice model" className="h-auto w-full border-border px-2.5 py-1.5 text-[12.5px]">
					<SelectValue placeholder={ready ? 'Loading Gemini’s models…' : 'Add a Gemini key to choose'} />
				</SelectTrigger>
				<SelectContent>
					{models.map((m) => (
						<SelectItem key={m.id} value={m.id}>
							{modelDisplayName({ id: m.id, name: m.name })}
							{m.curated ? ' · recommended' : ''}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<div className="mt-3">
				<VoicePicker
					label="Voice"
					ariaLabel="Gemini TTS voice"
					modelId={effModel}
					voices={voices}
					value={voice}
					onPick={(v) => {
						selectVoice({ provider: 'gemini', model: model || undefined, voice: v });
						void play(v);
					}}
					onPreview={async (v) => {
						setPreviewing(v);
						await previewTtsVoice({ rung: 'gemini', model: effModel, voice: v });
						setPreviewing(null);
					}}
					previewingId={previewing}
					disabled={!ready}
				/>
			</div>
			<div className="mt-2">
				<button
					type="button"
					onClick={() => play()}
					disabled={busy || !ready}
					className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] disabled:opacity-50"
				>
					{busy ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
					{busy ? 'Playing…' : 'Play sample'}
				</button>
			</div>
			<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Speaks on your own Gemini key; Gemini bills it. Speed is not adjustable on Gemini voices.</p>
		</div>
	);
}
