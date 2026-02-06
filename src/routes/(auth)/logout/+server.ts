import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logout } from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
	await logout(event);
	redirect(302, '/');
};

// Also handle GET for convenience (e.g., direct link)
export const GET: RequestHandler = async (event) => {
	await logout(event);
	redirect(302, '/');
};
