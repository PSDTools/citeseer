<script lang="ts">
	import { onMount } from 'svelte';
	import type { VisualizationSpec } from 'vega-embed';
	import type { ChartSelectDetail } from '$lib/types/toon';

	interface Props {
		spec: VisualizationSpec;
		interaction?: {
			panelIndex?: number;
			panelTitle?: string;
			xField?: string;
			yField?: string;
		};
		onselect?: (detail: ChartSelectDetail) => void;
	}

	let { spec, interaction, onselect }: Props = $props();
	let container: HTMLDivElement;
	let lastDatum: Record<string, unknown> | null = null;

	onMount(async () => {
		const vegaEmbed = (await import('vega-embed')).default;

		const result = await vegaEmbed(container, spec, {
			actions: false,
			renderer: 'svg',
			theme: 'dark',
		});

		if (interaction) {
			result.view.addEventListener('mouseover', (_event, item) => {
				if (!item || !item.datum) return;
				lastDatum = item.datum as Record<string, unknown>;
			});

			result.view.addEventListener('contextmenu', (event, item) => {
				event.preventDefault();

				const datum = (item?.datum as Record<string, unknown> | undefined) ?? lastDatum;
				if (!datum) return;

				const field = interaction.xField || Object.keys(datum)[0];
				const value = field ? (datum as Record<string, unknown>)[field] : undefined;
				const metricField = interaction.yField;
				const metricValue = metricField
					? (datum as Record<string, unknown>)[metricField]
					: undefined;

				const mouseEvent = event as unknown as MouseEvent;
				onselect?.({
					panelIndex: interaction.panelIndex,
					panelTitle: interaction.panelTitle,
					field,
					value: value as ChartSelectDetail['value'],
					metricField,
					metricValue: metricValue as ChartSelectDetail['metricValue'],
					datum,
					xField: interaction.xField,
					yField: interaction.yField,
					clientX: mouseEvent.clientX,
					clientY: mouseEvent.clientY,
				});
			});
		}
	});
</script>

<div bind:this={container} class="w-full"></div>
