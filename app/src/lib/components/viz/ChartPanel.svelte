<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import VegaChart from './VegaChart.svelte';
	import StatCard from './StatCard.svelte';
	import DataTable from './DataTable.svelte';
	import {
		panelToVegaLite,
		resolvePanelFields,
		resolveStatField,
		extractStatData,
		extractTableData
	} from '$lib/services/visualization';
	import type { PanelSpec, QueryResult, ChartSelectDetail } from '$lib/types/toon';

	interface Props {
		panel: PanelSpec;
		result: QueryResult;
		panelIndex?: number;
		interactive?: boolean;
	}

	const dispatch = createEventDispatcher<{ select: ChartSelectDetail }>();

	let { panel, result, panelIndex, interactive = false }: Props = $props();
</script>

<div class="rounded-xl border border-white/10 bg-white/[0.02] p-4">
	{#if !result.success}
		<div class="p-4 text-center">
			<h3 class="mb-2 text-sm font-medium text-white/70">{panel.title}</h3>
			<p class="text-sm text-red-400">{result.error || 'Failed to load data'}</p>
		</div>
	{:else if result.data.length === 0}
		<div class="p-4 text-center">
			<h3 class="mb-2 text-sm font-medium text-white/70">{panel.title}</h3>
			<p class="text-sm text-white/50">No data returned from query</p>
		</div>
	{:else if panel.type === 'stat'}
		{@const data = extractStatData(panel, result)}
		{@const valueField = resolveStatField(panel, result)}
		{@const rawValue = valueField ? result.data[0]?.[valueField] : undefined}
		{#if data}
			<div
				role="button"
				tabindex="0"
				oncontextmenu={(event) => {
					event.preventDefault();
					if (!valueField) return;
					dispatch('select', {
						field: valueField,
						value: rawValue as ChartSelectDetail['value'],
						datum: result.data[0],
						clientX: event.clientX,
						clientY: event.clientY
					});
				}}
			>
				<StatCard value={data.value} label={data.label} unit={data.unit} />
			</div>
		{:else}
			<p class="p-4 text-center text-white/50">No data</p>
		{/if}
	{:else if panel.type === 'table'}
		{@const data = extractTableData(panel, result)}
		{#if data}
			<DataTable
				columns={data.columns}
				rows={data.rows}
				title={panel.title}
				onselect={(detail) => dispatch('select', detail)}
			/>
		{:else}
			<p class="p-4 text-center text-white/50">No data</p>
		{/if}
	{:else}
		{@const spec = panelToVegaLite(panel, result)}
		{@const fields = resolvePanelFields(panel, result)}
		{#if spec}
			<VegaChart
				{spec}
				interaction={interactive
					? {
							panelIndex,
							panelTitle: panel.title,
							xField: fields.xField,
							yField: fields.yField
						}
					: undefined}
				onselect={(detail) => dispatch('select', detail)}
			/>
		{:else}
			<div class="p-4 text-center">
				<h3 class="mb-2 text-sm font-medium text-white/70">{panel.title}</h3>
				<p class="text-sm text-white/50">Unable to render {panel.type} chart</p>
			</div>
		{/if}
	{/if}

	{#if panel.summary}
		<div class="mt-3 border-t border-white/5 pt-3">
			<div class="flex items-start gap-2">
				<svg
					class="mt-0.5 h-4 w-4 flex-shrink-0 text-[#64ff96]"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<p class="text-sm leading-relaxed text-white/80">{panel.summary}</p>
			</div>
		</div>
	{:else if panel.description}
		<p class="mt-3 border-t border-white/5 pt-3 text-sm text-white/60">
			{panel.description}
		</p>
	{/if}
</div>
