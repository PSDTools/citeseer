import type { Handle } from '@sveltejs/kit';
import { getSessionToken, validateSessionToken, deleteSessionCookie } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const token = getSessionToken(event);

	if (!token) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	let session = null;
	let user = null;

	try {
		({ session, user } = await validateSessionToken(token));
	} catch {
		// DB errors should not leak details or crash the request —
		// treat as invalid session and clear the cookie.
		deleteSessionCookie(event);
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

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
