<script lang="ts">
	import { Lightbulb, ChevronRight } from '@lucide/svelte';

	interface Props {
		title: string;
		narrative: string;
		confidence?: 'high' | 'medium' | 'low';
		recommendations?: string[];
	}

	let { title, narrative, confidence, recommendations }: Props = $props();

	const confidenceColors = {
		high: 'bg-green-500/20 text-green-400 border-green-500/30',
		medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
		low: 'bg-red-500/20 text-red-400 border-red-500/30',
	};
</script>

<div class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
	<div class="mb-3 flex items-start justify-between gap-3">
		<div class="flex items-center gap-2">
			<Lightbulb class="h-5 w-5 flex-shrink-0 text-amber-400" />
			<h3 class="text-sm font-medium text-amber-400">{title}</h3>
		</div>
		{#if confidence}
			<span
				class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium {confidenceColors[
					confidence
				]}"
			>
				{confidence} confidence
			</span>
		{/if}
	</div>

	<p class="text-sm leading-relaxed whitespace-pre-line text-white/90">{narrative}</p>

	{#if recommendations && recommendations.length > 0}
		<div class="mt-4 border-t border-amber-500/10 pt-3">
			<h4 class="mb-2 text-xs font-medium tracking-wide text-amber-400/70 uppercase">
				Recommendations
			</h4>
			<ul class="space-y-1.5">
				{#each recommendations as rec, i (i)}
					<li class="flex items-start gap-2 text-sm text-white/80">
						<ChevronRight class="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400/60" />
						{rec}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
