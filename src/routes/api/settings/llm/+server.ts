import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, settings } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';
import { DEFAULT_MODEL_BY_PROVIDER, type LlmProvider } from '$lib/server/llm/config';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const org = await getPrimaryOrg(locals.user.id);
	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	const provider = normalizeProvider(orgSettings?.llmProvider);
	const model =
		orgSettings?.llmModel || orgSettings?.geminiModel || DEFAULT_MODEL_BY_PROVIDER[provider];
	const baseUrl = orgSettings?.llmBaseUrl || '';
	const hasApiKey =
		Boolean((orgSettings?.llmApiKey || '').trim()) ||
		Boolean((orgSettings?.geminiApiKey || '').trim());

	return json({
		provider,
		model,
		baseUrl,
		hasApiKey,
	});
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const org = await getPrimaryOrg(locals.user.id);
	const body = (await request.json().catch(() => null)) as {
		provider?: string;
		apiKey?: string;
		model?: string;
		baseUrl?: string;
	} | null;

	if (!body) {
		error(400, 'Invalid JSON body');
	}

	const provider = normalizeProvider(body.provider);
	const apiKey = body.apiKey?.trim();
	const model = body.model?.trim() || DEFAULT_MODEL_BY_PROVIDER[provider];
	const baseUrl = body.baseUrl?.trim() || null;

	const [existing] = await db.select().from(settings).where(eq(settings.orgId, org.id));
	if (existing) {
		await db
			.update(settings)
			.set({
				llmProvider: provider,
				llmModel: model,
				llmBaseUrl: baseUrl,
				...(apiKey ? { llmApiKey: apiKey } : {}),
				updatedAt: new Date(),
			})
			.where(eq(settings.orgId, org.id));
	} else {
		await db.insert(settings).values({
			orgId: org.id,
			llmProvider: provider,
			llmApiKey: apiKey || null,
			llmModel: model,
			llmBaseUrl: baseUrl,
			geminiModel: 'gemini-2.0-flash',
		});
	}

	return json({ success: true, provider, model, baseUrl: baseUrl || '' });
};

async function getPrimaryOrg(userId: string) {
	const orgs = await getUserOrganizations(userId);
	if (orgs.length === 0) {
		error(400, 'No organization found');
	}
	return orgs[0];
}

function normalizeProvider(provider: string | null | undefined): LlmProvider {
	if (provider === 'openai' || provider === 'claude' || provider === 'custom') return provider;
	return 'gemini';
}
