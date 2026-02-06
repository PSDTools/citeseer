<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import VegaChart from './VegaChart.svelte';
	import StatCard from './StatCard.svelte';
	import DataTable from './DataTable.svelte';
	import InsightCard from './InsightCard.svelte';
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

	const forecastLabels: Record<string, string> = {
		auto: 'Auto',
		linear: 'Linear trend',
		drift: 'Drift',
		moving_average: 'Moving average',
		exp_smoothing: 'Exponential smoothing',
		seasonal_naive: 'Seasonal naive'
	};

	function formatForecastMeta() {
		if (!panel.forecast) return null;
		const strategy = panel.forecast.strategy ? forecastLabels[panel.forecast.strategy] || panel.forecast.strategy : 'Auto';
		const horizon = panel.forecast.horizon ? `${panel.forecast.horizon} period${panel.forecast.horizon === 1 ? '' : 's'}` : null;
		const confidence = panel.forecast.confidence ? panel.forecast.confidence.toUpperCase() : null;
		const interval = panel.forecast.intervalPct
			? `${Math.round(panel.forecast.intervalPct * 100)}% interval`
			: panel.forecast
				? '90% interval'
				: null;
		return { strategy, horizon, confidence, interval };
	}
</script>

{#if panel.type === 'insight'}
	<InsightCard
		title={panel.title}
		narrative={panel.narrative || panel.description || ''}
		confidence={panel.confidence}
		recommendations={panel.recommendations}
	/>
{:else}
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
				interaction={interactive ? {
					panelIndex,
					panelTitle: panel.title,
					xField: fields.xField,
					yField: fields.yField
				} : undefined}
				onselect={(detail) => dispatch('select', detail)}
			/>
		{:else}
			<div class="p-4 text-center">
				<h3 class="text-sm font-medium text-white/70 mb-2">{panel.title}</h3>
				<p class="text-white/50 text-sm">Unable to render {panel.type} chart</p>
			</div>
		{/if}
	{/if}

	{#if panel.forecast || panel.summary || panel.description}
		<div class="mt-3 border-t border-white/5 pt-3">
			{#if panel.forecast}
				{@const meta = formatForecastMeta()}
				{#if meta}
					<div class="flex flex-wrap items-center gap-2 text-xs text-white/60 mb-2">
						<span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">
							Forecast: {meta.strategy}
						</span>
						{#if meta.horizon}
							<span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
								Horizon: {meta.horizon}
							</span>
						{/if}
						{#if meta.confidence}
							<span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
								Confidence: {meta.confidence}
							</span>
						{/if}
						{#if meta.interval}
							<span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
								{meta.interval}
							</span>
						{/if}
					</div>
				{/if}
			{/if}

			{#if panel.summary}
				<div class="flex items-start gap-2">
					<svg class="h-4 w-4 text-[#64ff96] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<p class="text-sm text-white/80 leading-relaxed">{panel.summary}</p>
				</div>
			{:else if panel.description}
				<p class="text-sm text-white/60">
					{panel.description}
				</p>
			{/if}
		</div>
	{/if}
</div>
{/if}
