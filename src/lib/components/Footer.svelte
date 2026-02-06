<script lang="ts">
	const links = ['Product', 'Pricing', 'Documentation', 'Contact'];
</script>

<footer class="border-t border-white/[0.08] bg-[#050810] px-5 py-16 pb-8">
	<div
		class="mx-auto mb-10 flex max-w-[1200px] items-start justify-between max-md:flex-col max-md:gap-8"
	>
		<div class="max-w-[300px]">
			<span class="mb-3 block text-2xl font-semibold text-white/90">CiteSeer</span>
			<p class="text-[0.95rem] leading-relaxed text-white/50">
				Question-driven analytics for modern supply chains.
			</p>
		</div>
		<div class="flex gap-8 max-md:flex-wrap max-md:gap-5">
			{#each links as link}
				<a href="#" class="text-[0.95rem] text-white/60 transition-colors hover:text-white/90">
					{link}
				</a>
			{/each}
		</div>
	</div>
	<div class="border-t border-white/[0.08] pt-8 text-center">
		<p class="text-[0.85rem] text-white/40">&copy; 2026 CiteSeer. All rights reserved.</p>
	</div>
</footer>
