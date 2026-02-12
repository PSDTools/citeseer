<script lang="ts">
	import type { ChartSelectDetail } from '$lib/types/toon';
	import type { VisualizationSpec } from 'vega-embed';

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

	$effect(() => {
		// Read spec to track it as a dependency
		const currentSpec = spec;
		let view: import('vega-embed').Result['view'] | undefined;

		async function embed() {
			const vegaEmbed = (await import('vega-embed')).default;

			const result = await vegaEmbed(container, currentSpec, {
				actions: false,
				renderer: 'svg',
				theme: 'dark',
			});

			view = result.view;

			if (interaction) {
				view.addEventListener('mouseover', (_event: unknown, item: unknown) => {
					if (!item || !(item as { datum?: unknown }).datum) return;
					lastDatum = (item as { datum: Record<string, unknown> }).datum;
				});

				view.addEventListener('contextmenu', (event: unknown, item: unknown) => {
					(event as Event).preventDefault();

					const datum =
						((item as { datum?: Record<string, unknown> } | undefined)?.datum as
							| Record<string, unknown>
							| undefined) ?? lastDatum;
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
		}

		embed();

		return () => {
			view?.finalize();
		};
	});
</script>

<div bind:this={container} class="w-full"></div>
