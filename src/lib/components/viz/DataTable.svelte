<script lang="ts">
	import type { ChartSelectDetail } from '$lib/types/toon';

	interface Props {
		columns: string[];
		rows: Record<string, unknown>[];
		title?: string;
		maxRows?: number;
		onselect?: (detail: ChartSelectDetail) => void;
	}

	let { columns, rows, title, maxRows = 10, onselect }: Props = $props();

	let showAll = $state(false);

	const displayRows = $derived(showAll ? rows : rows.slice(0, maxRows));
	const hasMore = $derived(rows.length > maxRows);
</script>

<div class="flex flex-col overflow-hidden">
	{#if title}
		<h3 class="mb-3 text-sm font-medium text-white">{title}</h3>
	{/if}
	<div class="overflow-x-auto {showAll && rows.length > 15 ? 'max-h-[400px] overflow-y-auto' : ''}">
		<table class="w-full text-sm">
			<thead class="sticky top-0 bg-black/90 backdrop-blur">
				<tr class="border-b border-white/10">
					{#each columns as column}
						<th class="px-3 py-2 text-left font-medium text-white/70">{column}</th>
					{/each}
				</tr>
			</thead>
			<tbody class="divide-y divide-white/5">
				{#each displayRows as row}
					<tr class="hover:bg-white/[0.02]">
						{#each columns as column}
							<td class="px-3 py-2 text-white/90">
								<span
									role="button"
									tabindex="0"
									oncontextmenu={(event) => {
										event.preventDefault();
										onselect?.({
											field: column,
											value: row[column] as ChartSelectDetail['value'],
											datum: row,
											clientX: event.clientX,
											clientY: event.clientY
										});
									}}
								>
									{row[column] ?? '-'}
								</span>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if hasMore}
		<div class="mt-2 flex items-center justify-center gap-3">
			<p class="text-xs text-white/50">
				{showAll ? `Showing all ${rows.length} rows` : `Showing ${maxRows} of ${rows.length} rows`}
			</p>
			<button
				onclick={() => (showAll = !showAll)}
				class="text-xs text-[#64ff96] transition-colors hover:text-[#7dffab]"
			>
				{showAll ? 'Show less' : 'Show all'}
			</button>
		</div>
	{/if}
</div>
