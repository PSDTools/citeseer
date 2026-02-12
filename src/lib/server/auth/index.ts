import type { DbClient } from '$lib/server/db';
import { db, organizations, orgMembers } from '$lib/server/db';
import { eq } from 'drizzle-orm';

// Get user's organizations
export async function getUserOrganizations(userId: string) {
	const memberships = await db
		.select({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			role: orgMembers.role,
		})
		.from(orgMembers)
		.innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
		.where(eq(orgMembers.userId, userId));

	return memberships;
}

// Create organization for user
// Accepts an optional transaction handle; when omitted, wraps its own transaction.
export async function createOrganization(userId: string, name: string, txn?: DbClient) {
	// Generate slug from name
	const baseSlug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	const conn = txn ?? db;
	const MAX_SLUG_RETRIES = 5;

	const perform = async (tx: DbClient) => {
		// Retry loop for slug uniqueness (handles race conditions)
		for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
			const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Date.now()}-${attempt}`;

			try {
				const [newOrg] = await tx
					.insert(organizations)
					.values({
						name,
						slug,
					})
					.returning();

				await tx.insert(orgMembers).values({
					userId,
					orgId: newOrg.id,
					role: 'owner',
				});

				return newOrg;
			} catch (error) {
				// Check if it's a unique constraint violation
				const isUniqueViolation =
					error instanceof Error &&
					('code' in error ? error.code === '23505' : error.message.includes('unique'));

				// If it's the last attempt or not a unique violation, throw
				if (attempt === MAX_SLUG_RETRIES - 1 || !isUniqueViolation) {
					throw error;
				}

				// Otherwise, retry with a different slug
				console.log(
					`Slug collision detected, retrying (attempt ${attempt + 2}/${MAX_SLUG_RETRIES})`,
				);
			}
		}

		throw new Error('Failed to create organization after multiple attempts');
	};

	// If a transaction was provided, use it directly; otherwise create one.
	return txn ? perform(txn) : db.transaction(perform);
}
