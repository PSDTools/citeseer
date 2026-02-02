<script lang="ts">
	let email = $state('');

	function handleSubmit(e: Event) {
		e.preventDefault();
		// Handle form submission
		console.log('Request access for:', email);
	}
</script>

<section class="relative py-32 max-md:py-20 px-5 z-10 bg-gradient-to-b from-[#0b1628] to-[#0d1a30] text-center">
	<div>
		<h2 class="text-[2.25rem] max-md:text-[1.75rem] font-semibold mb-4 text-white/95">
			Ready to see what your data is telling you?
		</h2>
		<p class="text-lg text-white/60 mb-10">
			Join supply chain teams who've moved beyond static dashboards.
		</p>
		<form onsubmit={handleSubmit} class="flex gap-3 justify-center max-w-[500px] mx-auto max-md:flex-col">
			<input
				type="email"
				bind:value={email}
				placeholder="Enter your work email"
				required
				class="flex-1 max-md:w-full px-5 py-3.5 text-base border border-white/20 rounded-lg bg-white/5 text-white/90 outline-none transition-colors focus:border-[rgba(100,255,150,0.5)] placeholder:text-white/40"
			/>
			<button
				type="submit"
				class="px-8 py-3.5 text-base font-semibold rounded-lg bg-gradient-to-br from-[#64ff96] to-[#3dd977] text-[#0a1628] cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(100,255,150,0.3)] transition-all"
			>
				Request Access
			</button>
		</form>
	</div>
</section>
