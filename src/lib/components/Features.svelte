<script lang="ts">
	const features = [
		{
			icon: '💬',
			title: "Ask, Don't Query",
			description:
				'No SQL. No dashboards to configure. Just ask questions in plain English and get instant answers from your data.',
		},
		{
			icon: '📁',
			title: 'Any Format, Any Data',
			description:
				'Upload spreadsheets, databases, or raw exports. CiteSeer handles CSV, Excel, JSON, TSV, and SQLite out of the box.',
		},
		{
			icon: '🔍',
			title: 'AI-Powered Why',
			description:
				"Don't just see what happened—understand why. CiteSeer automatically surfaces root causes and correlations.",
		},
	];
</script>

<section
	id="features"
	class="relative z-10 bg-gradient-to-b from-[#050810] to-[#0a1220] px-5 py-24"
>
	<div class="mb-16 text-center">
		<h2 class="mb-4 text-[2.5rem] font-semibold text-white/95 max-md:text-[2rem]">Why CiteSeer</h2>
		<p class="text-lg text-white/60">Transform how your team interacts with data</p>
	</div>

	<div
		class="mx-auto grid max-w-[1200px] grid-cols-3 gap-8 max-lg:grid-cols-2 max-lg:gap-6 max-md:grid-cols-1"
	>
		{#each features as feature}
			<div
				class="rounded-2xl border border-white/10 bg-white/5 px-8 py-10 text-center backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-[rgba(100,255,150,0.3)]"
			>
				<div class="mb-5 text-[2.5rem]">{feature.icon}</div>
				<h3 class="mb-3 text-[1.35rem] font-semibold text-white/95">{feature.title}</h3>
				<p class="text-base leading-relaxed text-white/65">{feature.description}</p>
			</div>
		{/each}
	</div>
</section>
