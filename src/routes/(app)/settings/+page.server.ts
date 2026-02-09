import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, settings } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';

export const load: PageServerLoad = async ({ parent }) => {
	const { org } = await parent();

	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	return {
		settings: {
			geminiApiKey: orgSettings?.geminiApiKey ? true : false, // Don't expose actual key
			geminiModel: orgSettings?.geminiModel || 'gemini-2.0-flash',
		},
	};
};

export const actions: Actions = {
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

		// Don't update if placeholder value
		const isPlaceholder = geminiApiKey === '••••••••••••';

		try {
			const [existing] = await db.select().from(settings).where(eq(settings.orgId, org.id));

			if (existing) {
				await db
					.update(settings)
					.set({
						...(isPlaceholder ? {} : { geminiApiKey: geminiApiKey || null }),
						geminiModel: geminiModel || 'gemini-2.0-flash',
						updatedAt: new Date(),
					})
					.where(eq(settings.orgId, org.id));
			} else {
				await db.insert(settings).values({
					orgId: org.id,
					geminiApiKey: isPlaceholder ? null : geminiApiKey || null,
					geminiModel: geminiModel || 'gemini-2.0-flash',
				});
			}

			return { success: true };
		} catch (error) {
			console.error('Error updating settings:', error);
			return fail(500, { error: 'Failed to save settings' });
		}
	},
};
