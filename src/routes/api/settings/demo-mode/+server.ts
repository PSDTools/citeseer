import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDemoMode, isDemoBuild, setDemoMode } from '$lib/server/demo/runtime';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	if (!isDemoBuild) {
		error(400, 'Demo mode is not available in this build');
	}

	const body = await request.json().catch(() => null);
	if (!body || typeof body.enabled !== 'boolean') {
		error(400, 'Request body must include boolean "enabled"');
	}

	const enabled = setDemoMode(body.enabled);
	return json({ enabled });
};

export const GET: RequestHandler = async () => {
	return json({
		demoAvailable: isDemoBuild,
		enabled: getDemoMode(),
	});
};
