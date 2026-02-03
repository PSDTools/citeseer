import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { db, sessions, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';

const SESSION_COOKIE_NAME = 'session';
const SESSION_EXPIRY_DAYS = 30;

export interface SessionUser {
	id: string;
	email: string;
}

export interface Session {
	id: string;
	userId: string;
	expiresAt: Date;
}

export interface SessionValidationResult {
	session: Session | null;
	user: SessionUser | null;
}

// Generate a cryptographically secure session token
export function generateSessionToken(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

// Hash the session token for storage (we store hash, not token)
function hashSessionToken(token: string): string {
	const encoded = new TextEncoder().encode(token);
	const hash = sha256(encoded);
	return encodeHexLowerCase(hash);
}

// Create a new session
export async function createSession(token: string, userId: string): Promise<Session> {
	const sessionId = hashSessionToken(token);
	const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

	await db.insert(sessions).values({
		id: sessionId,
		userId,
		expiresAt
	});

	return {
		id: sessionId,
		userId,
		expiresAt
	};
}

// Validate a session token
export async function validateSessionToken(token: string): Promise<SessionValidationResult> {
	const sessionId = hashSessionToken(token);

	const result = await db
		.select({
			session: sessions,
			user: {
				id: users.id,
				email: users.email
			}
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId))
		.limit(1);

	if (result.length === 0) {
		return { session: null, user: null };
	}

	const { session, user } = result[0];

	// Check if session is expired
	if (Date.now() >= session.expiresAt.getTime()) {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
		return { session: null, user: null };
	}

	// Extend session if it's close to expiring (within 15 days)
	if (Date.now() >= session.expiresAt.getTime() - 15 * 24 * 60 * 60 * 1000) {
		const newExpiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
		await db.update(sessions).set({ expiresAt: newExpiresAt }).where(eq(sessions.id, sessionId));
		session.expiresAt = newExpiresAt;
	}

	return {
		session: {
			id: session.id,
			userId: session.userId,
			expiresAt: session.expiresAt
		},
		user
	};
}

// Invalidate a session
export async function invalidateSession(sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

// Invalidate all sessions for a user
export async function invalidateAllUserSessions(userId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

// Set session cookie on response
export function setSessionCookie(event: RequestEvent, token: string, expiresAt: Date): void {
	event.cookies.set(SESSION_COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt,
		path: '/',
		secure: import.meta.env.PROD
	});
}

// Delete session cookie
export function deleteSessionCookie(event: RequestEvent): void {
	event.cookies.set(SESSION_COOKIE_NAME, '', {
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 0,
		path: '/',
		secure: import.meta.env.PROD
	});
}

// Get session token from request
export function getSessionToken(event: RequestEvent): string | null {
	return event.cookies.get(SESSION_COOKIE_NAME) ?? null;
}
