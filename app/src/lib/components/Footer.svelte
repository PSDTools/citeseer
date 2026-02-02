<script lang="ts">
	const links = ['Product', 'Pricing', 'Documentation', 'Contact'];
</script>

<footer class="bg-[#050810] py-16 pb-8 px-5 border-t border-white/[0.08]">
	<div class="flex justify-between items-start max-md:flex-col max-md:gap-8 max-w-[1200px] mx-auto mb-10">
		<div class="max-w-[300px]">
			<span class="text-2xl font-semibold text-white/90 block mb-3">CiteSeer</span>
			<p class="text-[0.95rem] text-white/50 leading-relaxed">
				Question-driven analytics for modern supply chains.
			</p>
		</div>
		<div class="flex gap-8 max-md:flex-wrap max-md:gap-5">
			{#each links as link}
				<a href="#" class="text-white/60 text-[0.95rem] hover:text-white/90 transition-colors">
					{link}
				</a>
			{/each}
		</div>
	</div>
	<div class="text-center pt-8 border-t border-white/[0.08]">
		<p class="text-[0.85rem] text-white/40">&copy; 2026 CiteSeer. All rights reserved.</p>
	</div>
</footer>
