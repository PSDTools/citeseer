import { auth } from '$lib/server/auth';
import { getUserOrganizations } from '$lib/server/orgs';
import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

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

		let orgs;

		try {
			const session = await auth.api.signInEmail({
				body: { email, password },
				headers: event.request.headers,
			});

			// Check if user has an organization
			orgs = await getUserOrganizations(session.user.id);
		} catch (e) {
			if (e instanceof APIError) {
				return fail(400, { error: 'Invalid email or password' });
			}
			throw e;
		}

		if (orgs.length === 0) {
			// Redirect to onboarding if no org
			redirect(302, '/onboarding');
		}

		// Redirect to dashboard
		redirect(302, '/dashboard');
	},
};
