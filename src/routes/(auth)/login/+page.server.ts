import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { login, createSessionAndCookie, getUserOrganizations } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	// Redirect to dashboard if already logged in
	if (locals.user) {
		redirect(302, '/dashboard');
	}
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString();
		const password = formData.get('password')?.toString();

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required' });
		}

		const result = await login({ email, password });

		if (!result.success) {
			return fail(400, { error: result.error });
		}

		// Create session and set cookie
		await createSessionAndCookie(event, result.userId!);

		// Check if user has an organization
		const orgs = await getUserOrganizations(result.userId!);

		if (orgs.length === 0) {
			// Redirect to onboarding if no org
			redirect(302, '/onboarding');
		}

		// Redirect to dashboard
		redirect(302, '/dashboard');
	}
};
