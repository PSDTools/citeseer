<script lang="ts">
	const steps = [
		{
			number: 1,
			title: 'Connect Your Data',
			description:
				'Integrate with your ERP, WMS, TMS, and IoT sensors. CiteSeer unifies your data automatically.'
		},
		{
			number: 2,
			title: 'Ask Questions Naturally',
			description:
				'"Why are shipments delayed from Asia?" or "Which suppliers have the highest risk this quarter?"'
		},
		{
			number: 3,
			title: 'Get Dynamic Dashboards',
			description:
				'Answers come with auto-generated visualizations. Share insights or dive deeper with follow-up questions.'
		}
	];
</script>

<section
	id="how-it-works"
	class="relative z-10 bg-gradient-to-b from-[#0a1220] to-[#0b1628] px-5 py-24"
>
	<div class="mb-16 text-center">
		<h2 class="mb-4 text-[2.5rem] font-semibold text-white/95 max-md:text-[2rem]">How It Works</h2>
		<p class="text-lg text-white/60">From connection to insight in three simple steps</p>
	</div>

	<div
		class="mx-auto flex max-w-[1200px] flex-wrap justify-center gap-10 max-lg:gap-8 max-md:flex-col max-md:items-center"
	>
		{#each steps as step}
			<div class="max-w-[340px] flex-1 text-center max-md:max-w-full">
				<div
					class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#64ff96] to-[#3dd977] text-2xl font-bold text-[#0a1628]"
				>
					{step.number}
				</div>
				<h3 class="mb-3 text-[1.25rem] font-semibold text-white/95">{step.title}</h3>
				<p class="text-base leading-relaxed text-white/60">{step.description}</p>
			</div>
		{/each}
	</div>
</section>
