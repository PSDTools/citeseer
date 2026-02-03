import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createOrganization, getUserOrganizations } from '$lib/server/auth';
import { db, settings } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
	// Redirect to login if not authenticated
	if (!locals.user) {
		redirect(302, '/login');
	}

	// Check if user already has an organization
	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length > 0) {
		redirect(302, '/dashboard');
	}
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!locals.user) {
			redirect(302, '/login');
		}

		const formData = await request.formData();
		const orgName = formData.get('orgName')?.toString()?.trim();
		const geminiApiKey = formData.get('geminiApiKey')?.toString()?.trim();

		if (!orgName) {
			return fail(400, { error: 'Organization name is required' });
		}

		if (orgName.length < 2) {
			return fail(400, { error: 'Organization name must be at least 2 characters' });
		}

		try {
			// Create organization
			const org = await createOrganization(locals.user.id, orgName);

			// If API key provided, save it
			if (geminiApiKey) {
				await db.insert(settings).values({
					orgId: org.id,
					geminiApiKey,
					geminiModel: 'gemini-2.0-flash'
				});
			}

			redirect(302, '/dashboard');
		} catch (error) {
			// Re-throw redirects
			if (isRedirect(error)) {
				throw error;
			}
			console.error('Error creating organization:', error);
			return fail(500, { error: 'Failed to create workspace. Please try again.' });
		}
	}
};
