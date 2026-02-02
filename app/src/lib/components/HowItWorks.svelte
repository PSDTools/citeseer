<script lang="ts">
	const steps = [
		{
			number: 1,
			title: 'Connect Your Data',
			description: 'Integrate with your ERP, WMS, TMS, and IoT sensors. CiteSeer unifies your data automatically.'
		},
		{
			number: 2,
			title: 'Ask Questions Naturally',
			description: '"Why are shipments delayed from Asia?" or "Which suppliers have the highest risk this quarter?"'
		},
		{
			number: 3,
			title: 'Get Dynamic Dashboards',
			description: 'Answers come with auto-generated visualizations. Share insights or dive deeper with follow-up questions.'
		}
	];
</script>

<section id="how-it-works" class="relative py-24 px-5 z-10 bg-gradient-to-b from-[#0a1220] to-[#0b1628]">
	<div class="text-center mb-16">
		<h2 class="text-[2.5rem] max-md:text-[2rem] font-semibold mb-4 text-white/95">How It Works</h2>
		<p class="text-lg text-white/60">From connection to insight in three simple steps</p>
	</div>

	<div class="flex justify-center gap-10 max-lg:gap-8 max-md:flex-col max-md:items-center max-w-[1200px] mx-auto flex-wrap">
		{#each steps as step}
			<div class="flex-1 max-w-[340px] max-md:max-w-full text-center">
				<div class="w-14 h-14 rounded-full bg-gradient-to-br from-[#64ff96] to-[#3dd977] text-[#0a1628] text-2xl font-bold flex items-center justify-center mx-auto mb-6">
					{step.number}
				</div>
				<h3 class="text-[1.25rem] font-semibold mb-3 text-white/95">{step.title}</h3>
				<p class="text-base leading-relaxed text-white/60">{step.description}</p>
			</div>
		{/each}
	</div>
</section>
