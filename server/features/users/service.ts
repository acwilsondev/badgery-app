import { pool } from "@db";
import { UnauthorizedError } from "../../middleware/errors";
import type { InsertUser } from "@shared/schema";

export async function getUserById(id: number) {
  try {
    // Use direct SQL query to avoid relationship issues during schema transition
    const sql = `
      SELECT u.*,
             array_agg(DISTINCT o.id) as organization_ids,
             array_agg(DISTINCT o.name) as organization_names
      FROM users u
      LEFT JOIN user_organization uo ON u.id = uo.user_id
      LEFT JOIN organizations o ON uo.organization_id = o.id
      WHERE u.id = $1
      GROUP BY u.id
    `;

    const result = await pool.query(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      password: row.password,
      name: row.name,
      email: row.email,
      role: row.role,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      // Add organizations array from the joined data
      organizations:
        row.organization_ids && row.organization_ids[0] !== null
          ? row.organization_ids.map((id: number, index: number) => ({
              id,
              name: row.organization_names[index],
            }))
          : [],
    };
  } catch (error) {
    console.error("Error in getUserById:", error);
    throw error;
  }
}

export async function getUserByUsername(username: string) {
  try {
    // Use direct SQL query to avoid relationship issues during schema transition
    const sql = `
      SELECT u.*,
             array_agg(DISTINCT o.id) as organization_ids,
             array_agg(DISTINCT o.name) as organization_names
      FROM users u
      LEFT JOIN user_organization uo ON u.id = uo.user_id
      LEFT JOIN organizations o ON uo.organization_id = o.id
      WHERE u.username = $1
      GROUP BY u.id
    `;

    const result = await pool.query(sql, [username]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      password: row.password,
      name: row.name,
      email: row.email,
      role: row.role,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      // Add organizations array from the joined data
      organizations:
        row.organization_ids && row.organization_ids[0] !== null
          ? row.organization_ids.map((id: number, index: number) => ({
              id,
              name: row.organization_names[index],
            }))
          : [],
    };
  } catch (error) {
    console.error("Error in getUserByUsername:", error);
    throw error;
  }
}

export async function createUser(
  userData: InsertUser,
  organizationIds?: number[],
) {
  try {
    // Use direct SQL for user creation with only columns that definitely exist
    const sql = `
      INSERT INTO users (username, password, name, email, role, organization_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, password, name, email, role, organization_id as "organizationId", created_at as "createdAt"
    `;

    const values = [
      userData.username,
      userData.password,
      userData.name,
      userData.email,
      userData.role || "user",
      userData.organizationId || null,
    ];

    const result = await pool.query(sql, values);
    if (result.rows.length === 0) {
      throw new Error("Failed to create user");
    }

    const newUser = result.rows[0];

    // Associate user with organizations if provided
    if (organizationIds && organizationIds.length > 0) {
      const orgPromises = organizationIds.map((orgId) => {
        return pool.query(
          `INSERT INTO user_organization (user_id, organization_id)
           VALUES ($1, $2)`,
          [newUser.id, orgId],
        );
      });

      await Promise.all(orgPromises);
    }

    return newUser;
  } catch (error) {
    console.error("Error in createUser:", error);
    throw error;
  }
}

export async function getUsersByOrganization(organizationId: number) {
  try {
    // Use raw SQL query for compatibility during schema transition
    const sql = `
      SELECT u.*,
            array_agg(DISTINCT o.id) as organization_ids,
            array_agg(DISTINCT o.name) as organization_names
      FROM users u
      JOIN user_organization uo ON u.id = uo.user_id
      JOIN organizations o ON uo.organization_id = o.id
      WHERE uo.organization_id = $1
      GROUP BY u.id
      ORDER BY u.name ASC
    `;

    const result = await pool.query(sql, [organizationId]);

    // Format the results to include the organizations array
    return result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
      // Add organizations array from the joined data
      organizations:
        row.organization_ids && row.organization_ids[0] !== null
          ? row.organization_ids.map((id: number, index: number) => ({
              id,
              name: row.organization_names[index],
            }))
          : [],
    }));
  } catch (error) {
    console.error("Error in getUsersByOrganization:", error);
    throw error;
  }
}

/**
 * Loads the current session's user record, throwing UnauthorizedError (401)
 * if it's missing — collapses the repeated
 * `const user = await getUserById(id); if (!user) return res.status(401)...`
 * pattern that appeared ~10 times across the old routes.ts. Deliberately
 * throws Unauthorized, not NotFound: this only fires when a valid,
 * authenticated session points at a user row that no longer exists, which
 * is an auth-state problem, not a "the resource you asked for is missing"
 * problem — and it preserves the exact 401 the old code returned here.
 */
export async function getRequesterOrThrow(userId: number) {
  const user = await getUserById(userId);
  if (!user) {
    throw new UnauthorizedError("User not found");
  }
  return user;
}
