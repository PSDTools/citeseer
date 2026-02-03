<script lang="ts">
	interface Props {
		value: string | number;
		label: string;
		unit?: string;
	}

	let { value, label, unit }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center p-6 text-center">
	<div class="text-4xl font-bold text-white">
		{value}
		{#if unit}
			<span class="text-lg text-white/50">{unit}</span>
		{/if}
	</div>
	<div class="mt-2 text-sm text-white/60">{label}</div>
</div>
