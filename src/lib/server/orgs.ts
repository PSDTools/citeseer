import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { member, organization } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';

// Get user's organizations
export async function getUserOrganizations(userId: string) {
	const memberships = await db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			role: member.role,
		})
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, userId));

	return memberships;
}

// Create organization for user (uses Better Auth organization plugin API)
export async function createOrganization(userId: string, name: string) {
	// Generate slug from name
	let slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	// Check if slug exists
	const existing = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slug));

	if (existing.length > 0) {
		slug = `${slug}-${Date.now()}`;
	}

	// Create organization via Better Auth API (also adds user as owner)
	const org = await auth.api.createOrganization({
		body: {
			name,
			slug,
			userId,
		},
	});

	return org;
}
