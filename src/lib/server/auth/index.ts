import { db, users, organizations, orgMembers } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { hashPassword, verifyPassword } from './password';
import {
	generateSessionToken,
	createSession,
	validateSessionToken,
	invalidateSession,
	setSessionCookie,
	deleteSessionCookie,
	getSessionToken
} from './session';
import type { RequestEvent } from '@sveltejs/kit';

export {
	generateSessionToken,
	createSession,
	validateSessionToken,
	invalidateSession,
	setSessionCookie,
	deleteSessionCookie,
	getSessionToken
};

export interface SignupData {
	email: string;
	password: string;
}

export interface LoginData {
	email: string;
	password: string;
}

export interface AuthResult {
	success: boolean;
	error?: string;
	userId?: string;
}

// Sign up a new user
export async function signup(data: SignupData): Promise<AuthResult> {
	const { email, password } = data;

	// Validate email format
	if (!email || !email.includes('@')) {
		return { success: false, error: 'Invalid email address' };
	}

	// Validate password length
	if (!password || password.length < 8) {
		return { success: false, error: 'Password must be at least 8 characters' };
	}

	// Check if user already exists
	const existingUser = await db.select().from(users).where(eq(users.email, email.toLowerCase()));

	if (existingUser.length > 0) {
		return { success: false, error: 'Email already registered' };
	}

	// Hash password and create user
	const passwordHash = await hashPassword(password);

	const [newUser] = await db
		.insert(users)
		.values({
			email: email.toLowerCase(),
			passwordHash
		})
		.returning({ id: users.id });

	return { success: true, userId: newUser.id };
}

// Log in an existing user
export async function login(data: LoginData): Promise<AuthResult> {
	const { email, password } = data;

	// Find user by email
	const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));

	if (!user) {
		return { success: false, error: 'Invalid email or password' };
	}

	// Verify password
	const validPassword = await verifyPassword(user.passwordHash, password);

	if (!validPassword) {
		return { success: false, error: 'Invalid email or password' };
	}

	return { success: true, userId: user.id };
}

// Create a session and set cookie
export async function createSessionAndCookie(event: RequestEvent, userId: string): Promise<void> {
	const token = generateSessionToken();
	const session = await createSession(token, userId);
	setSessionCookie(event, token, session.expiresAt);
}

// Log out (invalidate session and clear cookie)
export async function logout(event: RequestEvent): Promise<void> {
	const token = getSessionToken(event);
	if (token) {
		const { session } = await validateSessionToken(token);
		if (session) {
			await invalidateSession(session.id);
		}
	}
	deleteSessionCookie(event);
}

// Get user's organizations
export async function getUserOrganizations(userId: string) {
	const memberships = await db
		.select({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			role: orgMembers.role
		})
		.from(orgMembers)
		.innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
		.where(eq(orgMembers.userId, userId));

	return memberships;
}

// Create organization for user
export async function createOrganization(userId: string, name: string) {
	// Generate slug from name
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	// Check if slug exists
	const existing = await db.select().from(organizations).where(eq(organizations.slug, slug));
	const finalSlug = existing.length > 0 ? `${slug}-${Date.now()}` : slug;

	// Create organization
	const [org] = await db
		.insert(organizations)
		.values({
			name,
			slug: finalSlug
		})
		.returning();

	// Add user as owner
	await db.insert(orgMembers).values({
		userId,
		orgId: org.id,
		role: 'owner'
	});

	return org;
}

// Check if user has access to organization
export async function checkOrgAccess(
	userId: string,
	orgId: string
): Promise<{ hasAccess: boolean; role?: string }> {
	const [membership] = await db
		.select({ role: orgMembers.role })
		.from(orgMembers)
		.where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)));

	if (!membership) {
		return { hasAccess: false };
	}

	return { hasAccess: true, role: membership.role };
}
