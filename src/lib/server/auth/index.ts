import { db, users, organizations, orgMembers } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';

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
			slug: finalSlug,
		})
		.returning();

	// Add user as owner
	await db.insert(orgMembers).values({
		userId,
		orgId: org.id,
		role: 'owner',
	});

	return org;
}

// Check if user has access to organization
export async function checkOrgAccess(
	userId: string,
	orgId: string,
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
