import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, settings } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';
import { resolveLlmConfig } from '$lib/server/llm/config';
import { generateTextWithLlm } from '$lib/server/llm/text';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(400, 'No organization found');
	}
	const org = orgs[0];

	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));
	const llmConfig = resolveLlmConfig(orgSettings);
	if (!llmConfig) {
		error(400, 'LLM API settings not configured');
	}

	try {
		const text = await generateTextWithLlm(llmConfig, {
			prompt: 'Reply with exactly: OK',
			temperature: 0,
			maxOutputTokens: 16,
		});

		if (!text.toUpperCase().includes('OK')) {
			return json({ success: true, message: `Connected (${llmConfig.provider})` });
		}

		return json({ success: true, message: `API key is valid (${llmConfig.provider})` });
	} catch (e) {
		console.error('LLM key test failed:', e);
		const message = e instanceof Error ? e.message : 'Failed to validate API settings';
		return json({ success: false, message }, { status: 400 });
	}
};
