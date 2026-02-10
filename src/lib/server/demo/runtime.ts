import { env } from '$env/dynamic/private';

export const isDemoBuild = env.DEMO === 'true';

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
