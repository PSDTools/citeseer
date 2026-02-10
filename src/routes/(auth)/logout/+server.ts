import { auth } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	await auth.api.signOut({ headers: event.request.headers });
	redirect(302, '/');
};

// Also handle GET for convenience (e.g., direct link)
export const GET: RequestHandler = async (event) => {
	await auth.api.signOut({ headers: event.request.headers });
	redirect(302, '/');
};
