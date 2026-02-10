import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isDemoActive, isDemoBuild } from '$lib/server/demo/runtime';
import { saveDemoPattern, type DemoResponse } from '$lib/server/demo/config';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	if (!isDemoBuild) {
		error(400, 'Demo preset editing is only available when DEMO=true');
	}

	if (isDemoActive()) {
		error(400, 'Switch to Live mode to edit demo presets');
	}

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		error(400, 'Invalid request body');
	}

	const question = typeof body.question === 'string' ? body.question.trim() : '';
	if (!question) {
		error(400, 'question is required');
	}

	const response = body.response as DemoResponse | undefined;
	if (!response || typeof response !== 'object') {
		error(400, 'response is required');
	}

	const regex = typeof body.regex === 'string' ? body.regex : undefined;
	const flags = typeof body.flags === 'string' ? body.flags : undefined;

	await saveDemoPattern({
		question,
		response,
		regex,
		flags,
		replace: true,
	});

	return json({ success: true });
};
