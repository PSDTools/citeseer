import { db, organizations, orgMembers } from '$lib/server/db';
import type { DbClient } from '$lib/server/db';
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
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	// Check if slug exists
	const conn = txn ?? db;
	const existing = await conn.select().from(organizations).where(eq(organizations.slug, slug));
	const finalSlug = existing.length > 0 ? `${slug}-${Date.now()}` : slug;

	const perform = async (tx: DbClient) => {
		const [newOrg] = await tx
			.insert(organizations)
			.values({
				name,
				slug: finalSlug,
			})
			.returning();

		await tx.insert(orgMembers).values({
			userId,
			orgId: newOrg.id,
			role: 'owner',
		});

		return newOrg;
	};

	// If a transaction was provided, use it directly; otherwise create one.
	return txn ? perform(txn) : db.transaction(perform);
}
