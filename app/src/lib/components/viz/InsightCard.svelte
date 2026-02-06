<script lang="ts">
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
		low: 'bg-red-500/20 text-red-400 border-red-500/30'
	};
</script>

<div class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
	<div class="flex items-start justify-between gap-3 mb-3">
		<div class="flex items-center gap-2">
			<svg class="h-5 w-5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
			</svg>
			<h3 class="text-sm font-medium text-amber-400">{title}</h3>
		</div>
		{#if confidence}
			<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium {confidenceColors[confidence]}">
				{confidence} confidence
			</span>
		{/if}
	</div>

	<p class="text-white/90 leading-relaxed text-sm whitespace-pre-line">{narrative}</p>

	{#if recommendations && recommendations.length > 0}
		<div class="mt-4 border-t border-amber-500/10 pt-3">
			<h4 class="text-xs font-medium text-amber-400/70 uppercase tracking-wide mb-2">Recommendations</h4>
			<ul class="space-y-1.5">
				{#each recommendations as rec, i (i)}
					<li class="flex items-start gap-2 text-sm text-white/80">
						<svg class="h-4 w-4 text-amber-400/60 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
						{rec}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
