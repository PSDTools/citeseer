import type { Handle } from '@sveltejs/kit';
import { getSessionToken, validateSessionToken, deleteSessionCookie } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const token = getSessionToken(event);

	if (!token) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	const { session, user } = await validateSessionToken(token);

	if (!session) {
		deleteSessionCookie(event);
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	event.locals.user = user;
	event.locals.session = session;

	return resolve(event);
};
