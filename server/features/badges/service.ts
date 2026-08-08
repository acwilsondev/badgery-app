import { db, pool } from "@db";
import { eq } from "drizzle-orm";
import { badges, type InsertBadge, type Badge } from "@shared/schema";

export async function getBadges(organizationId: number, categoryId?: number) {
  try {
    // Using SQL directly to avoid schema caching issues
    let sql = `
      SELECT b.*, c.name as category_name, c.id as category_id
      FROM badges b
      LEFT JOIN badge_categories c ON b.category_id = c.id
      WHERE b.organization_id = $1
    `;

    const params = [organizationId];

    if (categoryId) {
      sql += ` AND b.category_id = $2`;
      params.push(categoryId);
    }

    sql += ` ORDER BY b.name ASC`;

    const result = await pool.query(sql, params);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      criteria: row.criteria,
      imageUrl: row.image_url,
      color: row.color,
      categoryId: row.category_id,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      requiresProgress: row.requires_progress,
      criteriaSections: row.criteria_sections,
      criteriaType: row.criteria_type || "binary",
      category: row.category_id
        ? {
            id: row.category_id,
            name: row.category_name,
          }
        : null,
    }));
  } catch (error) {
    console.error("Error in getBadges:", error);
    throw error;
  }
}

export async function getBadgeById(id: number) {
  try {
    // Using SQL directly to avoid schema caching issues
    const sql = `
      SELECT b.*, c.name as category_name, c.id as category_id
      FROM badges b
      LEFT JOIN badge_categories c ON b.category_id = c.id
      WHERE b.id = $1
    `;

    const result = await pool.query(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      criteria: row.criteria,
      imageUrl: row.image_url,
      color: row.color,
      categoryId: row.category_id,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      requiresProgress: row.requires_progress,
      criteriaSections: row.criteria_sections,
      criteriaType: row.criteria_type || "binary",
      category: row.category_id
        ? {
            id: row.category_id,
            name: row.category_name,
          }
        : null,
    };
  } catch (error) {
    console.error("Error in getBadgeById:", error);
    throw error;
  }
}

export async function createBadge(
  badge: InsertBadge & { organizationId: number },
) {
  const [newBadge] = await db.insert(badges).values(badge).returning();
  return newBadge;
}

export async function updateBadge(id: number, data: Partial<Badge>) {
  const [updatedBadge] = await db
    .update(badges)
    .set(data)
    .where(eq(badges.id, id))
    .returning();
  return updatedBadge;
}

export async function deleteBadge(id: number) {
  await db.delete(badges).where(eq(badges.id, id));
  return { success: true };
}
