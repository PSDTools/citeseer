// @ts-check
import adapter from '@sveltejs/adapter-node';

export default /** @satisfies {import('@sveltejs/kit').Config} */ ({
	kit: {
		adapter: adapter(),

		experimental: {
			instrumentation: {
				server: true,
			},
			tracing: {
				server: true,
			},
		},
	},

	compilerOptions: {
		runes: true,
	},
});
