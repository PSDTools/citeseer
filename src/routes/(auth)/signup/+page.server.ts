import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/auth';
import { APIError } from 'better-auth/api';

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
		const confirmPassword = formData.get('confirmPassword')?.toString();

		if (!email || !password || !confirmPassword) {
			return fail(400, { error: 'All fields are required' });
		}

		if (password !== confirmPassword) {
			return fail(400, { error: 'Passwords do not match' });
		}

		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters' });
		}

		try {
			await auth.api.signUpEmail({
				body: { email, password, name: email.split('@')[0] },
				headers: event.request.headers,
			});
		} catch (e) {
			if (e instanceof APIError) {
				const message =
					e.body?.message === 'User already exists'
						? 'Email already registered'
						: (e.body?.message ?? 'Signup failed');
				return fail(400, { error: message });
			}
			throw e;
		}

		// Redirect to onboarding to create first org
		redirect(302, '/onboarding');
	},
};
