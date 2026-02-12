<script lang="ts">
	interface Props {
		value: string | number;
		label: string;
		unit?: string;
	}

	let { value, label, unit }: Props = $props();

	function formatNumber(num: number): string {
		const abs = Math.abs(num);
		if (abs >= 10_000) {
			return new Intl.NumberFormat('en-US', {
				notation: 'compact',
				maximumFractionDigits: 1,
			}).format(num);
		}

		const hasFraction = !Number.isInteger(num);
		return new Intl.NumberFormat('en-US', {
			maximumFractionDigits: hasFraction ? 2 : 0,
		}).format(num);
	}

	function tryParseNumeric(raw: string): { value: number; suffix: string } | null {
		const trimmed = raw.trim();
		if (!trimmed) return null;

		const match = trimmed.match(/^(-?[0-9,]+(?:\.[0-9]+)?)(.*)$/);
		if (!match) return null;

		const numericPart = match[1].replace(/,/g, '');
		const suffix = match[2]?.trim() ?? '';
		const parsed = Number(numericPart);
		if (!Number.isFinite(parsed)) return null;
		return { value: parsed, suffix };
	}

	const formattedValue = $derived.by(() => {
		if (typeof value === 'number') {
			return formatNumber(value);
		}

		const parsed = tryParseNumeric(value);
		if (parsed) {
			return `${formatNumber(parsed.value)}${parsed.suffix ? ` ${parsed.suffix}` : ''}`;
		}

		return value.trim();
	});
</script>

<div class="flex flex-col items-center justify-center p-6 text-center">
	<div
		class="max-w-full overflow-hidden text-3xl leading-tight font-bold break-words text-white sm:text-4xl"
		title={String(value)}
	>
		{formattedValue}
		{#if unit}
			<span class="text-lg text-white/40">{unit}</span>
		{/if}
	</div>
	<div class="mt-2 text-sm text-white/50">{label}</div>
</div>
