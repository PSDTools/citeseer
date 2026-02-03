<script lang="ts">
	import VegaChart from './VegaChart.svelte';
	import StatCard from './StatCard.svelte';
	import DataTable from './DataTable.svelte';
	import {
		panelToVegaLite,
		extractStatData,
		extractTableData
	} from '$lib/services/visualization';
	import type { PanelSpec, QueryResult } from '$lib/types/toon';

	interface Props {
		panel: PanelSpec;
		result: QueryResult;
	}

	let { panel, result }: Props = $props();
</script>

<div class="rounded-xl border border-white/10 bg-white/[0.02] p-4">
	{#if !result.success}
		<div class="p-4 text-center">
			<h3 class="text-sm font-medium text-white/70 mb-2">{panel.title}</h3>
			<p class="text-red-400 text-sm">{result.error || 'Failed to load data'}</p>
		</div>
	{:else if result.data.length === 0}
		<div class="p-4 text-center">
			<h3 class="text-sm font-medium text-white/70 mb-2">{panel.title}</h3>
			<p class="text-white/50 text-sm">No data returned from query</p>
		</div>
	{:else if panel.type === 'stat'}
		{@const data = extractStatData(panel, result)}
		{#if data}
			<StatCard value={data.value} label={data.label} unit={data.unit} />
		{:else}
			<p class="p-4 text-center text-white/50">No data</p>
		{/if}
	{:else if panel.type === 'table'}
		{@const data = extractTableData(panel, result)}
		{#if data}
			<DataTable columns={data.columns} rows={data.rows} title={panel.title} />
		{:else}
			<p class="p-4 text-center text-white/50">No data</p>
		{/if}
	{:else}
		{@const spec = panelToVegaLite(panel, result)}
		{#if spec}
			<VegaChart {spec} />
		{:else}
			<div class="p-4 text-center">
				<h3 class="text-sm font-medium text-white/70 mb-2">{panel.title}</h3>
				<p class="text-white/50 text-sm">Unable to render {panel.type} chart</p>
			</div>
		{/if}
	{/if}

	{#if panel.summary}
		<div class="mt-3 border-t border-white/5 pt-3">
			<div class="flex items-start gap-2">
				<svg class="h-4 w-4 text-[#64ff96] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<p class="text-sm text-white/80 leading-relaxed">{panel.summary}</p>
			</div>
		</div>
	{:else if panel.description}
		<p class="mt-3 text-sm text-white/60 border-t border-white/5 pt-3">
			{panel.description}
		</p>
	{/if}
</div>
