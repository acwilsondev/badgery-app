import { db } from "./index";
import * as schema from "@shared/schema";
import { eq, and } from "drizzle-orm";
import argon2 from "argon2";

async function seed() {
  try {
    // Create organization
    const existingOrg = await db.query.organizations.findFirst({
      where: eq(schema.organizations.name, "Acme Inc."),
    });

    let organizationId;
    if (!existingOrg) {
      const [org] = await db
        .insert(schema.organizations)
        .values({
          name: "Acme Inc.",
          description: "Leading provider of innovative software solutions",
        })
        .returning();
      organizationId = org.id;
      console.log("Created organization:", org.name);
    } else {
      organizationId = existingOrg.id;
      console.log("Organization already exists:", existingOrg.name);
    }

    // Create badge categories
    const categories = [
      { name: "Technical", organizationId },
      { name: "Leadership", organizationId },
      { name: "Professional", organizationId },
      { name: "Special Achievement", organizationId },
    ];

    for (const category of categories) {
      const existingCategory = await db.query.badgeCategories.findFirst({
        where: and(
          eq(schema.badgeCategories.name, category.name),
          eq(schema.badgeCategories.organizationId, organizationId),
        ),
      });

      if (!existingCategory) {
        const [newCategory] = await db
          .insert(schema.badgeCategories)
          .values(category)
          .returning();
        console.log("Created category:", newCategory.name);
      } else {
        console.log("Category already exists:", existingCategory.name);
      }
    }

    // Get all categories
    const allCategories = await db.query.badgeCategories.findMany({
      where: eq(schema.badgeCategories.organizationId, organizationId),
    });

    const categoryMap = allCategories.reduce(
      (acc, cat) => {
        acc[cat.name] = cat.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Create badges
    const badges = [
      {
        name: "Code Master",
        description:
          "Awarded for exceptional programming skills and code quality.",
        criteria: "Consistently write clean, maintainable, and efficient code.",
        color: "#4F46E5",
        imageUrl:
          "https://images.unsplash.com/photo-1531482615713-2afd69097998?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80",
        categoryId: categoryMap["Technical"],
        organizationId,
      },
      {
        name: "Team Leader",
        description: "Recognizes outstanding leadership and team management.",
        criteria: "Successfully lead a team to accomplish significant goals.",
        color: "#10B981",
        imageUrl:
          "https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80",
        categoryId: categoryMap["Leadership"],
        organizationId,
      },
      {
        name: "Innovation Champion",
        description: "For those who bring creative solutions and new ideas.",
        criteria: "Introduce novel approaches that solve important problems.",
        color: "#F59E0B",
        imageUrl:
          "https://images.unsplash.com/photo-1551434678-e076c223a692?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80",
        categoryId: categoryMap["Professional"],
        organizationId,
      },
      {
        name: "Project Excellence",
        description:
          "Awarded for successful completion of challenging projects.",
        criteria: "Complete complex projects on time and within budget.",
        color: "#6B7280",
        imageUrl:
          "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80",
        categoryId: categoryMap["Professional"],
        organizationId,
      },
      {
        name: "Team Collaboration Award",
        description:
          "Recognizes exceptional teamwork and collaboration skills.",
        criteria:
          "Demonstrate outstanding ability to work effectively with others.",
        color: "#10B981",
        imageUrl:
          "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80",
        categoryId: categoryMap["Professional"],
        organizationId,
      },
      {
        name: "Customer Excellence",
        description: "For outstanding customer service and satisfaction.",
        criteria: "Consistently provide exceptional customer experiences.",
        color: "#F59E0B",
        imageUrl:
          "https://images.unsplash.com/photo-1519389950473-47ba0277781c?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80",
        categoryId: categoryMap["Professional"],
        organizationId,
      },
    ];

    for (const badge of badges) {
      const existingBadge = await db.query.badges.findFirst({
        where: and(
          eq(schema.badges.name, badge.name),
          eq(schema.badges.organizationId, organizationId),
        ),
      });

      if (!existingBadge) {
        const [newBadge] = await db
          .insert(schema.badges)
          .values(badge)
          .returning();
        console.log("Created badge:", newBadge.name);
      } else {
        console.log("Badge already exists:", existingBadge.name);
      }
    }

    // Create users
    const seedPasswordHash = await argon2.hash("password123");
    const users = [
      {
        username: "admin",
        password: seedPasswordHash,
        name: "Sarah Johnson",
        email: "sarah.johnson@example.com",
        role: "admin",
        organizationId,
      },
      {
        username: "emily",
        password: seedPasswordHash,
        name: "Emily Chen",
        email: "emily.chen@example.com",
        role: "user",
        organizationId,
      },
      {
        username: "marcus",
        password: seedPasswordHash,
        name: "Marcus Johnson",
        email: "marcus.johnson@example.com",
        role: "user",
        organizationId,
      },
      {
        username: "sophia",
        password: seedPasswordHash,
        name: "Sophia Lee",
        email: "sophia.lee@example.com",
        role: "user",
        organizationId,
      },
    ];

    for (const user of users) {
      const existingUser = await db.query.users.findFirst({
        where: eq(schema.users.username, user.username),
      });

      if (!existingUser) {
        const [newUser] = await db
          .insert(schema.users)
          .values(user)
          .returning();
        console.log("Created user:", newUser.name);
      } else {
        console.log("User already exists:", existingUser.name);
      }
    }

    // Get all users and badges
    const allUsers = await db.query.users.findMany({
      where: eq(schema.users.organizationId, organizationId),
    });

    const allBadges = await db.query.badges.findMany({
      where: eq(schema.badges.organizationId, organizationId),
    });

    const userMap = allUsers.reduce(
      (acc, user) => {
        acc[user.name] = user.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    const badgeMap = allBadges.reduce(
      (acc, badge) => {
        acc[badge.name] = badge.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Award badges to users (recent activity)
    const awardData = [
      {
        badgeId: badgeMap["Team Collaboration Award"],
        userId: userMap["Emily Chen"],
        awardedBy: userMap["Sarah Johnson"],
        awardedAt: new Date(2023, 6, 15), // July 15, 2023
        status: "completed",
      },
      {
        badgeId: badgeMap["Innovation Champion"],
        userId: userMap["Marcus Johnson"],
        awardedBy: userMap["Sarah Johnson"],
        awardedAt: new Date(2023, 6, 12), // July 12, 2023
        status: "completed",
      },
      {
        badgeId: badgeMap["Customer Excellence"],
        userId: userMap["Sophia Lee"],
        awardedBy: userMap["Sarah Johnson"],
        awardedAt: new Date(2023, 6, 10), // July 10, 2023
        status: "completed",
      },
    ];

    for (const award of awardData) {
      const existingAward = await db.query.achievements.findFirst({
        where: and(
          eq(schema.achievements.badgeId, award.badgeId),
          eq(schema.achievements.userId, award.userId),
          eq(schema.achievements.awardedBy, award.awardedBy),
        ),
      });

      if (!existingAward) {
        const [_newAward] = await db
          .insert(schema.achievements)
          .values(award)
          .returning();
        console.log("Awarded badge to user");
      } else {
        console.log("Badge already awarded to user");
      }
    }

    console.log("Seed data successfully created");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

seed();
