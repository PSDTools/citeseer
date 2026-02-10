import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, settings } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';
import { getDemoMode, isDemoBuild, setDemoMode } from '$lib/server/demo/runtime';
import { DEFAULT_MODEL_BY_PROVIDER, type LlmProvider } from '$lib/server/llm/config';

export const load: PageServerLoad = async ({ parent }) => {
	const { org } = await parent();

	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	return {
		settings: {
			geminiApiKey: orgSettings?.geminiApiKey ? true : false, // Don't expose actual key
			geminiModel: orgSettings?.geminiModel || 'gemini-2.0-flash',
			llmProvider: normalizeProvider(orgSettings?.llmProvider),
			llmApiKey:
				Boolean((orgSettings?.llmApiKey || '').trim()) ||
				(!orgSettings?.llmApiKey && Boolean((orgSettings?.geminiApiKey || '').trim())),
			llmModel:
				orgSettings?.llmModel ||
				orgSettings?.geminiModel ||
				DEFAULT_MODEL_BY_PROVIDER[normalizeProvider(orgSettings?.llmProvider)],
			llmBaseUrl: orgSettings?.llmBaseUrl || '',
		},
		demoAvailable: isDemoBuild,
		demoModeEnabled: getDemoMode(),
	};
};

export const actions: Actions = {
	toggleDemoMode: async ({ request, locals }) => {
		if (!locals.user) {
			redirect(302, '/login');
		}

		const formData = await request.formData();
		const enabled = formData.get('enabled')?.toString() === 'true';
		setDemoMode(enabled);
		return { success: true };
	},

	updateApiKey: async ({ request, locals }) => {
		if (!locals.user) {
			redirect(302, '/login');
		}

		// Get user's org
		const orgs = await getUserOrganizations(locals.user.id);
		if (orgs.length === 0) {
			return fail(400, { error: 'No organization found' });
		}
		const org = orgs[0];

		const formData = await request.formData();

		const geminiApiKey = formData.get('geminiApiKey')?.toString()?.trim();
		const geminiModel = formData.get('geminiModel')?.toString()?.trim();
		const llmProvider = normalizeProvider(formData.get('llmProvider')?.toString());
		const llmApiKey = formData.get('llmApiKey')?.toString()?.trim();
		const llmModel = formData.get('llmModel')?.toString()?.trim();
		const llmBaseUrl = formData.get('llmBaseUrl')?.toString()?.trim();

		// Don't update if placeholder value
		const isPlaceholder = geminiApiKey === '••••••••••••';
		const isLlmPlaceholder = llmApiKey === '••••••••••••';

		try {
			const [existing] = await db.select().from(settings).where(eq(settings.orgId, org.id));

			const resolvedModel =
				llmModel || geminiModel || DEFAULT_MODEL_BY_PROVIDER[llmProvider] || 'gemini-2.0-flash';

			if (existing) {
				await db
					.update(settings)
					.set({
						...(isPlaceholder ? {} : { geminiApiKey: geminiApiKey || null }),
						geminiModel: geminiModel || 'gemini-2.0-flash',
						llmProvider,
						...(isLlmPlaceholder ? {} : { llmApiKey: llmApiKey || geminiApiKey || null }),
						llmModel: resolvedModel,
						llmBaseUrl: llmBaseUrl || null,
						updatedAt: new Date(),
					})
					.where(eq(settings.orgId, org.id));
			} else {
				await db.insert(settings).values({
					orgId: org.id,
					geminiApiKey: isPlaceholder ? null : geminiApiKey || null,
					geminiModel: geminiModel || 'gemini-2.0-flash',
					llmProvider,
					llmApiKey: isLlmPlaceholder ? null : llmApiKey || geminiApiKey || null,
					llmModel: resolvedModel,
					llmBaseUrl: llmBaseUrl || null,
				});
			}

			return { success: true };
		} catch (error) {
			console.error('Error updating settings:', error);
			return fail(500, { error: 'Failed to save settings' });
		}
	},
};

function normalizeProvider(provider: string | null | undefined): LlmProvider {
	if (provider === 'openai' || provider === 'claude' || provider === 'custom') return provider;
	return 'gemini';
}
