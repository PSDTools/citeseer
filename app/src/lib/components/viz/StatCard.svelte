<script lang="ts">
	interface Props {
		value: string | number;
		label: string;
		unit?: string;
	}

	let { value, label, unit }: Props = $props();

	const formattedValue = $derived(() => {
		if (typeof value === 'number') {
			if (Math.abs(value) >= 1_000_000) {
				return (value / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
			}
			if (Math.abs(value) >= 10_000) {
				return (value / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
			}
			return value.toLocaleString();
		}
		return value;
	});
</script>

<div class="flex flex-col items-center justify-center p-6 text-center">
	<div class="text-4xl font-bold text-white">
		{formattedValue()}
		{#if unit}
			<span class="text-lg text-white/40">{unit}</span>
		{/if}
	</div>
	<div class="mt-2 text-sm text-white/50">{label}</div>
</div>
