<script lang="ts">
	import { onMount } from 'svelte';
	import type { VisualizationSpec } from 'vega-embed';

	interface Props {
		spec: VisualizationSpec;
	}

	let { spec }: Props = $props();
	let container: HTMLDivElement;

	onMount(async () => {
		const vegaEmbed = (await import('vega-embed')).default;

		await vegaEmbed(container, spec, {
			actions: false,
			renderer: 'svg',
			theme: 'dark'
		});
	});
</script>

<div bind:this={container} class="w-full"></div>
