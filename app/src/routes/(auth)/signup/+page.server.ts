import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { signup, createSessionAndCookie } from '$lib/server/auth';

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

		const result = await signup({ email, password });

		if (!result.success) {
			return fail(400, { error: result.error });
		}

		// Create session and set cookie
		await createSessionAndCookie(event, result.userId!);

		// Redirect to onboarding to create first org
		redirect(302, '/onboarding');
	}
};
