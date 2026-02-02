<script lang="ts">
	const features = [
		{
			icon: '💬',
			title: 'Ask, Don\'t Query',
			description: 'No SQL. No dashboards to configure. Just ask questions in plain English and get instant answers from your data.'
		},
		{
			icon: '⚡',
			title: 'Real-Time Insights',
			description: 'Connect to live data streams. See changes as they happen across your entire supply chain network.'
		},
		{
			icon: '🔍',
			title: 'AI-Powered Why',
			description: 'Don\'t just see what happened—understand why. CiteSeer automatically surfaces root causes and correlations.'
		}
	];
</script>

<section id="features" class="relative py-24 px-5 z-10 bg-gradient-to-b from-[#050810] to-[#0a1220]">
	<div class="text-center mb-16">
		<h2 class="text-[2.5rem] max-md:text-[2rem] font-semibold mb-4 text-white/95">Why CiteSeer</h2>
		<p class="text-lg text-white/60">Transform how your team interacts with supply chain data</p>
	</div>

	<div class="grid grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1 gap-8 max-lg:gap-6 max-w-[1200px] mx-auto">
		{#each features as feature}
			<div class="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl py-10 px-8 text-center transition-all hover:-translate-y-1 hover:border-[rgba(100,255,150,0.3)]">
				<div class="text-[2.5rem] mb-5">{feature.icon}</div>
				<h3 class="text-[1.35rem] font-semibold mb-3 text-white/95">{feature.title}</h3>
				<p class="text-base leading-relaxed text-white/65">{feature.description}</p>
			</div>
		{/each}
	</div>
</section>
