import { env } from '$env/dynamic/private';

export const isDemoBuild = env.DEMO === 'true';

/**
 * Module-level demo mode state.
 *
 * In single-instance Node.js servers, this is shared across all requests (intentional).
 * In serverless environments (Vercel, Cloudflare), each isolate gets its own copy,
 * so setDemoMode() only affects the current instance.
 *
 * The DEMO env var controls the initial state; runtime toggling is for live demos.
 */
let demoModeEnabled = isDemoBuild;

export function getDemoMode(): boolean {
	return demoModeEnabled;
}

export function setDemoMode(enabled: boolean): boolean {
	if (!isDemoBuild) {
		return false;
	}

	demoModeEnabled = enabled;
	return demoModeEnabled;
}

export function isDemoActive(): boolean {
	return isDemoBuild && demoModeEnabled;
}

export function getDataMode(): 'demo' | 'live' {
	return isDemoActive() ? 'demo' : 'live';
}
